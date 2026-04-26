import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Briefcase, Building2, Loader2, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AccountRole } from "@/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import {
  DEMO_PERSONAS,
  personasForTrack,
  type DemoPersona,
  type DemoTrack,
} from "@/lib/demoPersonas";

function destinationFor(role: AccountRole | DemoTrack | null | undefined): string {
  // Policymakers land on the country dashboard; job seekers land on Skills Signal
  // so they immediately see the tabulated Profile + Grow signals.
  return role === "policymaker" ? "/app/policy" : "/app/skills";
}

/**
 * Shared chrome around all three auth screens (picker + per-track demo pages).
 * Keeps the header, background, and back-link consistent.
 */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background grid-paper">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="font-display text-lg text-text">
            MAPPED
          </Link>
          <Link
            to="/"
            className="text-xs font-mono text-text-muted hover:text-text inline-flex items-center gap-1"
          >
            <ArrowLeft size={12} /> Back to overview
          </Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-6 py-12">{children}</main>
    </div>
  );
}

/** Once auth completes, route the user to the correct dashboard.
 *  We wait briefly for the profile row (created by the on_auth_user_created
 *  trigger), but fall back to the default destination so users are never
 *  stranded on the auth page if the profile fetch is slow.
 *
 *  `expectedTrack` constrains the redirect to a specific track — when set, we
 *  only auto-route if the loaded profile matches that track. This prevents a
 *  user who is already signed in as (e.g.) a job-seeker from being bounced
 *  away when they intentionally visit /auth/employer to switch tracks. */
function useRedirectAfterAuth(expectedTrack?: DemoTrack) {
  const navigate = useNavigate();
  const { session, user, profile, loading } = useAuth();
  useEffect(() => {
    if (loading || !session || !user) return;
    if (profile && profile.user_id === user.id) {
      // If the caller pinned a track and the current profile is on a different
      // track, do not redirect — let the user pick a persona on this page.
      if (expectedTrack && profile.role !== expectedTrack) return;
      navigate(destinationFor(profile.role), { replace: true });
      return;
    }
    if (expectedTrack) return; // wait for persona click; don't fall back
    // Profile not loaded yet — give the trigger ~1.2s, then route to default.
    const t = setTimeout(() => {
      navigate(destinationFor(null), { replace: true });
    }, 1200);
    return () => clearTimeout(t);
  }, [loading, session, user, profile, navigate, expectedTrack]);
}

// ============================================================================
// /auth — landing picker. Choose a track, then go to its demo login.
// ============================================================================
export default function AuthPage() {
  useRedirectAfterAuth();

  const tracks: Array<{
    track: DemoTrack;
    title: string;
    sub: string;
    icon: typeof Briefcase;
    href: string;
  }> = [
    {
      track: "individual",
      title: "Job seeker",
      sub: "Track your skills, see how AI exposure shifts your role, and find your next learning step.",
      icon: Briefcase,
      href: "/auth/job-seeker",
    },
    {
      track: "policymaker",
      title: "Policymaker / employer",
      sub: "Run country-level risk diagnostics, compare ISCO exposure, and export auditable evidence.",
      icon: Building2,
      href: "/auth/employer",
    },
  ];

  return (
    <AuthShell>
      <div className="surface-elevated p-6">
        <div className="label-mono mb-2">Continue as</div>
        <h1 className="font-display text-2xl text-text mb-6">Choose your track</h1>
        <div className="grid gap-3">
          {tracks.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.track}
                to={t.href}
                className="group flex items-start gap-3 rounded-sm border border-border bg-surface hover:border-strong px-4 py-4 transition-colors"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-brand">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-text">{t.title}</span>
                  <span className="block text-[12px] text-text-muted leading-snug mt-0.5">
                    {t.sub}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  className="text-text-muted group-hover:text-text mt-1 transition-colors"
                />
              </Link>
            );
          })}
        </div>
        <p className="mt-5 text-[11px] font-mono text-text-muted text-center">
          Demo only · sandbox data may be visible to other visitors.
        </p>
      </div>
    </AuthShell>
  );
}

// ============================================================================
// Per-track demo login pages, exported separately and mounted in App.tsx.
// ============================================================================

interface TrackPageProps {
  track: DemoTrack;
  title: string;
  eyebrow: string;
  sub: string;
  backHref?: string;
}

function DemoTrackPage({ track, title, eyebrow, sub, backHref = "/auth" }: TrackPageProps) {
  useRedirectAfterAuth(track);
  const personas = personasForTrack(track);

  return (
    <AuthShell>
      <div className="surface-elevated p-6">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1 text-[11px] font-mono text-text-muted hover:text-text mb-4"
        >
          <ArrowLeft size={11} /> Choose a different track
        </Link>
        <div className="label-mono mb-2">{eyebrow}</div>
        <h1 className="font-display text-2xl text-text mb-2">{title}</h1>
        <p className="text-[13px] text-text-muted leading-relaxed mb-5">{sub}</p>
        <DemoPersonaList personas={personas} />
      </div>
    </AuthShell>
  );
}

export function JobSeekerAuthPage() {
  return (
    <DemoTrackPage
      track="individual"
      eyebrow="Job seeker · demo"
      title="Pick a demo profile"
      sub="Each profile has its own skill history and country context. Pick one to land in the job-seeker dashboards."
    />
  );
}

export function EmployerAuthPage() {
  return (
    <DemoTrackPage
      track="policymaker"
      eyebrow="Policymaker / employer · demo"
      title="Pick a demo profile"
      sub="Each profile has its own country and organization context. Pick one to land in the policymaker dashboards."
    />
  );
}

// ============================================================================
// Shared persona-list UI used by both demo pages.
// ============================================================================

function DemoPersonaList({ personas }: { personas: DemoPersona[] }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const setCountry = useAppStore((s) => s.setCountry);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function signInAs(persona: DemoPersona) {
    setBusyId(persona.id);
    try {
      const { data, error } = await supabase.functions.invoke("ensure-demo-user", {
        body: { personaId: persona.id },
      });
      if (error || !data?.email || !data?.password) {
        throw new Error(error?.message ?? "Demo unavailable");
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInErr) throw signInErr;
      setCountry(persona.country);
      navigate(destinationFor(persona.track), { replace: true });
    } catch (e) {
      toast({
        title: "Demo login failed",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="grid gap-2">
        {personas.map((p) => {
          const loading = busyId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => signInAs(p)}
              disabled={busyId !== null}
              className="w-full flex items-center gap-3 rounded-sm border border-border bg-surface hover:border-strong px-3 py-2.5 text-left transition-colors disabled:opacity-60"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-brand text-sm font-mono">
                {loading ? <Loader2 size={14} className="animate-spin" /> : p.glyph}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text truncate">{p.displayName}</span>
                <span className="block text-[11px] text-text-muted truncate">{p.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] font-mono text-text-muted text-center">
        Sandbox account · data may be visible to other demo visitors.
      </p>
    </div>
  );
}

// Re-export the shared list for any callers that previously imported a
// DemoLoginButton component name. Safe no-op for tree-shaking.
export { DemoPersonaList as DemoLoginButton };

// Re-export to satisfy older imports.
// (DEMO_PERSONAS and personasForTrack come from @/lib/demoPersonas directly.)
export type { DemoPersona, DemoTrack };
export { DEMO_PERSONAS };
