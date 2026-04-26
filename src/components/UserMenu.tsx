import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, ChevronDown, Building2, GraduationCap, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getPersonaByEmail } from "@/lib/demoPersonas";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Account menu for real (non-demo) signed-in users. Shows the active profile
 * type (Job Seeker vs Policymaker) and exposes a Sign out action gated by a
 * confirmation dialog. Demo personas continue to use DemoPersonaSwitcher, so
 * this component intentionally renders nothing for them to avoid two
 * overlapping menus.
 */
export default function UserMenu({ className }: { className?: string }) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;
  // Demo personas already have their own switcher with a Sign out entry.
  if (getPersonaByEmail(user.email)) return null;

  const isPolicymaker = profile?.role === "policymaker";
  const roleLabel = isPolicymaker ? "Policy maker" : "Job seeker";
  const RoleIcon = isPolicymaker ? Building2 : GraduationCap;

  const displayName =
    profile?.display_name?.trim() ||
    user.email?.split("@")[0] ||
    "Account";

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      toast({
        title: "Signed out",
        description: `You have been signed out of your ${roleLabel.toLowerCase()} account.`,
      });
      setConfirmOpen(false);
      navigate("/", { replace: true });
    } catch (e) {
      toast({
        title: "Sign out failed",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-2 rounded-sm border border-border bg-surface hover:border-strong px-2.5 py-1.5 text-xs font-mono text-text transition-colors",
              className,
            )}
            aria-label="Account menu"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-brand">
              <RoleIcon size={12} strokeWidth={2} />
            </span>
            <span className="hidden sm:inline truncate max-w-[160px]">{displayName}</span>
            <span className="sm:hidden">Account</span>
            <ChevronDown size={12} className="text-text-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="label-mono text-[10px]">
            {roleLabel} · signed in
          </DropdownMenuLabel>
          <div className="px-2 pb-2 text-[11px] text-text-muted leading-snug truncate">
            {user.email}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
            className="cursor-pointer text-text-muted"
          >
            <LogOut size={12} className="mr-2" />
            <span className="text-xs">Sign out of {roleLabel.toLowerCase()} account</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !signingOut && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of your {roleLabel.toLowerCase()} account?</AlertDialogTitle>
            <AlertDialogDescription>
              You're signed in as <span className="font-mono text-text">{user.email}</span>. You'll
              need to sign in again to access your {roleLabel.toLowerCase()} dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleSignOut();
              }}
              disabled={signingOut}
            >
              {signingOut ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> Signing out…
                </span>
              ) : (
                "Sign out"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
