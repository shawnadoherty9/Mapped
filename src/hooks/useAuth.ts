import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AccountRole = "individual" | "policymaker";

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  organization: string | null;
  country_code: string | null;
  role: AccountRole;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Single source of truth for auth state across the app.
 *
 * IMPORTANT: We register the onAuthStateChange listener BEFORE calling
 * getSession() per Lovable Cloud guidance — otherwise the very first
 * SIGNED_IN event after a hard reload can be missed.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileRequest = useRef(0);

  const fetchProfile = useCallback(async (userId: string) => {
    const requestId = ++profileRequest.current;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, display_name, organization, country_code, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (requestId !== profileRequest.current) return;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[useAuth] failed to load profile:", error.message);
      setProfile(null);
      return;
    }
    setProfile((data as Profile) ?? null);
  }, []);

  const applySession = useCallback(async (sess: Session | null, cancelled: () => boolean) => {
    if (cancelled()) return;
    const nextUser = sess?.user ?? null;
    setSession(sess);
    setUser(nextUser);
    setProfile(null);

    if (nextUser) {
      await fetchProfile(nextUser.id);
    } else {
      profileRequest.current += 1;
    }

    if (!cancelled()) setLoading(false);
  }, [fetchProfile]);

  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (cancelled) return;
      setLoading(true);
      // Defer profile fetch to avoid recursive calls inside the listener.
      setTimeout(() => void applySession(sess, () => cancelled), 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      void applySession(data.session, () => cancelled);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  async function signOut() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      // Ensure UI doesn't get stuck in a loading state if Supabase rejects
      // (e.g. already-expired session). The onAuthStateChange listener will
      // also clear loading on success, but this guarantees recovery on error.
      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
      throw err;
    }
  }

  return createElement(AuthContext.Provider, { value: { session, user, profile, loading, signOut } }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
