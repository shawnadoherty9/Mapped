import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getPersonaByEmail, type DemoTrack } from "@/lib/demoPersonas";
import { useToast } from "@/hooks/use-toast";

/**
 * Resolve the effective track for the signed-in user. Mirrors the precedence
 * used by `resolveNavGroups` in AppLayout so the guard and the sidebar always
 * agree on which dashboard the user belongs to:
 *   1. Demo persona matched by email — always wins.
 *   2. DB-stored account role on the profile row.
 *   3. Fallback to job-seeker ("individual").
 */
function resolveTrack(args: {
  email?: string | null;
  role?: "individual" | "policymaker" | null;
}): DemoTrack {
  const persona = getPersonaByEmail(args.email);
  if (persona) return persona.track;
  if (args.role === "policymaker") return "policymaker";
  return "individual";
}

/**
 * Route guard: blocks signed-in users from deep-linking into a dashboard that
 * doesn't match their current track. The only way to switch tracks is via the
 * `/auth` picker (which signs the user out and back in as the other persona).
 *
 * Assumes it is wrapped by `<RequireAuth>`, so it can rely on `session` being
 * present once `loading` is false.
 */
export default function RequireTrack({
  allow,
  children,
}: {
  allow: DemoTrack;
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const warned = useRef(false);

  const effectiveTrack = resolveTrack({
    email: user?.email,
    role: profile?.role ?? null,
  });
  const mismatch = !loading && !!user && effectiveTrack !== allow;

  useEffect(() => {
    if (mismatch && !warned.current) {
      warned.current = true;
      toast({
        title: "Switch track to continue",
        description:
          allow === "policymaker"
            ? "Sign in as a policymaker / employer to open this dashboard."
            : "Sign in as a job seeker to open this dashboard.",
      });
    }
  }, [mismatch, allow, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-muted text-sm font-mono">
        Loading session…
      </div>
    );
  }

  if (mismatch) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}