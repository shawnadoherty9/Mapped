import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, UserCircle2, ChevronDown, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import { DEMO_PERSONAS, getPersonaByEmail, type DemoPersona } from "@/lib/demoPersonas";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Compact in-app switcher to hop between demo personas without leaving the
 * current page. Only renders when the current session is one of the known
 * demo accounts — for real users it stays hidden so it can't be confused for
 * an account-switch UI.
 */
export default function DemoPersonaSwitcher({ className }: { className?: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const setCountry = useAppStore((s) => s.setCountry);
  const [busyId, setBusyId] = useState<string | null>(null);

  const currentPersona = getPersonaByEmail(user?.email);
  if (!currentPersona) return null;

  async function switchTo(p: DemoPersona) {
    if (p.id === currentPersona?.id) return;
    setBusyId(p.id);
    try {
      // Make sure the persona's auth user exists, then sign in as them.
      const { data, error } = await supabase.functions.invoke("ensure-demo-user", {
        body: { personaId: p.id },
      });
      if (error || !data?.email || !data?.password) {
        throw new Error(error?.message ?? "Demo unavailable");
      }
      // Sign out current session first so listeners fire cleanly.
      await supabase.auth.signOut();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInErr) throw signInErr;
      // Align the active country in the app store with the persona's home country
      // so dashboards immediately reflect their context.
      setCountry(p.country);
      navigate(p.track === "policymaker" ? "/app/policy" : "/app/skills", { replace: true });
      toast({
        title: `Switched to ${p.displayName}`,
        description: p.blurb,
      });
    } catch (e) {
      toast({
        title: "Switch failed",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-sm border border-border bg-surface hover:border-strong px-2.5 py-1.5 text-xs font-mono text-text transition-colors",
            className,
          )}
          aria-label="Switch demo profile"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-[10px] text-brand">
            {currentPersona.glyph}
          </span>
          <span className="hidden sm:inline truncate max-w-[140px]">{currentPersona.displayName}</span>
          <span className="sm:hidden">Demo</span>
          <ChevronDown size={12} className="text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="label-mono text-[10px]">
          Demo profiles · sandbox data
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DEMO_PERSONAS.map((p) => {
          const active = p.id === currentPersona.id;
          const loading = busyId === p.id;
          return (
            <DropdownMenuItem
              key={p.id}
              disabled={loading || active}
              onSelect={(e) => {
                e.preventDefault();
                if (!active) switchTo(p);
              }}
              className="flex items-start gap-3 py-2 cursor-pointer"
            >
              <span
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-mono",
                  active ? "bg-brand text-bg" : "bg-accent-soft text-brand",
                )}
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : p.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text truncate">{p.displayName}</span>
                  {active && (
                    <span className="text-[9px] font-mono uppercase text-brand">active</span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted leading-snug truncate">{p.blurb}</div>
              </div>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void (async () => {
              try {
                await signOut();
                toast({
                  title: "Signed out",
                  description: "You've been signed out of the demo profile.",
                });
                navigate("/", { replace: true });
              } catch (err) {
                toast({
                  title: "Sign out failed",
                  description: err instanceof Error ? err.message : "Try again in a moment.",
                  variant: "destructive",
                });
              }
            })();
          }}
          className="cursor-pointer text-text-muted"
        >
          <LogOut size={12} className="mr-2" />
          <span className="text-xs">Sign out of demo</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserCircle2 }; // re-export to keep tree-shaking honest
