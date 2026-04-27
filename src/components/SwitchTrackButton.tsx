import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getPersonaByEmail } from "@/lib/demoPersonas";
import { setLastTrack } from "@/lib/lastTrack";
import { cn } from "@/lib/utils";

/**
 * Visible on every dashboard page. Signs the user out (same flow as the
 * /auth picker's "Sign out" affordance and the UserMenu confirmation) and
 * routes them back to /auth so they can pick the other track. Using the
 * shared `signOut()` from useAuth ensures in-memory demo/dashboard state is
 * cleared before the next sign-in, so the new track lands on a clean slate.
 */
export default function SwitchTrackButton({ className }: { className?: string }) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  // Label the destination track so the button reads as a deliberate switch
  // rather than a generic logout. Demo persona email wins over DB role to
  // match the precedence used elsewhere (RequireTrack, AppLayout sidebar).
  const persona = getPersonaByEmail(user.email);
  const currentTrack = persona?.track ?? profile?.role ?? "individual";
  const otherLabel =
    currentTrack === "policymaker" ? "job seeker" : "policymaker";

  async function handleSwitch() {
    setBusy(true);
    try {
      // Pre-set the persisted track to the destination so /auth's auto-jump
      // sends them straight to the right demo login after sign-out.
      const nextTrack = currentTrack === "policymaker" ? "individual" : "policymaker";
      setLastTrack(nextTrack);
      await signOut();
      toast({
        title: "Switching track",
        description: `Pick a ${otherLabel} profile to continue.`,
      });
      navigate("/auth", { replace: true });
    } catch (e) {
      toast({
        title: "Switch failed",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border bg-surface text-xs font-mono text-text-muted hover:text-text hover:border-strong transition-colors disabled:opacity-60",
        className,
      )}
      aria-label={`Switch to ${otherLabel} track`}
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <ArrowLeftRight size={12} />
      )}
      <span className="hidden sm:inline">
        {busy ? "Switching…" : `Switch to ${otherLabel}`}
      </span>
      <span className="sm:hidden">{busy ? "…" : "Switch"}</span>
    </button>
  );
}