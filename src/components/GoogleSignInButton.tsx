import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { lovable } from "@/integrations/lovable";
import type { AccountRole } from "@/hooks/useAuth";

/**
 * Direct Google OAuth trigger usable from the landing page.
 * Mirrors the signup flow in AuthPage: passes the chosen role via OAuth `state`
 * so the new profile gets the right role on first session.
 */
export default function GoogleSignInButton({
  role,
  label,
  variant = "outline",
  className,
}: {
  role: AccountRole;
  label: string;
  variant?: "outline" | "default" | "secondary";
  className?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
      extraParams: { state: JSON.stringify({ role }) },
    });
    if (result.error) {
      setBusy(false);
      toast({
        title: "Google sign-in failed",
        description: String(result.error),
        variant: "destructive",
      });
      return;
    }
    if (result.redirected) return;
    setBusy(false);
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      disabled={busy}
      className={`w-full ${className ?? ""}`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <GoogleMark />}
      <span className="ml-2">{label}</span>
    </Button>
  );
}

function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.13 4.13 0 0 1-1.79 2.71v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.36 0-4.36-1.59-5.07-3.73H.96v2.34A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.93 10.69A5.4 5.4 0 0 1 3.64 9c0-.59.1-1.16.29-1.69V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.03l2.97-2.34z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.97l2.97 2.34C4.64 5.17 6.64 3.58 9 3.58z"/>
    </svg>
  );
}
