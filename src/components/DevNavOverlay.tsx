/**
 * DevNavOverlay
 * -------------
 * Lightweight, **development-only** floating panel that surfaces:
 *   • the current pathname (so you can confirm route + active styling line up)
 *   • the resolved label for `/app/config` per track (job-seeker vs policymaker),
 *     proving the rename to "Country View" is live on every surface
 *   • a live viewport readout with the Tailwind breakpoint we're in
 *   • a "highlight active nav" toggle that paints a dashed outline around any
 *     element with `aria-current="page"` (the marker react-router puts on
 *     active <NavLink>s) so it's easy to scan at a glance which entry is lit
 *
 * The whole module is tree-shaken in production via the `import.meta.env.DEV`
 * guard at the top of the component — it returns `null` in prod builds and
 * the injected `<style>` block is also skipped.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff, X } from "lucide-react";
import { navGroupsForTrack } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { getPersonaByEmail, type DemoTrack } from "@/lib/demoPersonas";

// Map raw px width → the Tailwind breakpoint the layout will be using. Kept
// inline (rather than imported) because this overlay should never depend on
// project config in a way that risks shipping in prod.
const breakpoint = (w: number) =>
  w >= 1536 ? "2xl" : w >= 1280 ? "xl" : w >= 1024 ? "lg" : w >= 768 ? "md" : w >= 640 ? "sm" : "xs";

const labelFor = (track: DemoTrack, route: string) => {
  for (const group of navGroupsForTrack(track)) {
    const hit = group.links.find((l) => l.to === route);
    if (hit) return hit.label;
  }
  return "(not in nav)";
};

export default function DevNavOverlay() {
  // Hard kill-switch for production builds. Vite replaces this with `false`
  // at build time so the rest of the component is dead code.
  if (!import.meta.env.DEV) return null;

  const location = useLocation();
  const { user, profile } = useAuth();

  const persona = getPersonaByEmail(user?.email);
  const track: DemoTrack = persona?.track ?? (profile?.role === "policymaker" ? "policymaker" : "individual");

  const [open, setOpen] = useState(true);
  const [highlight, setHighlight] = useState(false);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Resolve the label both ways so we can spot any divergence (e.g. if a
  // future edit only renames one track).
  const labels = useMemo(
    () => ({
      jobSeeker: labelFor("individual", "/app/config"),
      policymaker: labelFor("policymaker", "/app/config"),
      active: labelFor(track, "/app/config"),
    }),
    [track]
  );

  return (
    <>
      {/* Inject a global style only when highlight is on. Scoped to
          `[data-dev-highlight] [aria-current="page"]` so it can't leak. */}
      {highlight && (
        <style>{`
          html[data-dev-highlight] [aria-current="page"] {
            outline: 2px dashed hsl(var(--brand, 200 90% 55%)) !important;
            outline-offset: 2px;
            background-color: hsl(var(--brand, 200 90% 55%) / 0.08) !important;
          }
        `}</style>
      )}
      <DevHighlightToggleEffect on={highlight} />

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-3 right-3 z-[9999] rounded-full border border-border bg-surface/90 backdrop-blur-sm p-2 shadow-lg text-text-muted hover:text-text"
          aria-label="Show dev nav overlay"
          title="Show dev nav overlay"
        >
          <Eye size={14} />
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-3 right-3 z-[9999] w-[280px] rounded-sm border border-border bg-surface/95 backdrop-blur-sm shadow-xl font-mono text-[11px] text-text"
          role="status"
          aria-label="Developer nav overlay"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
            <span className="label-mono text-[10px] tracking-wider text-text-muted">DEV · NAV OVERLAY</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setHighlight((h) => !h)}
                className={`p-1 rounded-sm hover:bg-surface2 ${highlight ? "text-brand" : "text-text-muted"}`}
                aria-label={highlight ? "Disable active highlight" : "Enable active highlight"}
                title={highlight ? "Disable active highlight" : "Enable active highlight"}
              >
                {highlight ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-sm text-text-muted hover:text-text hover:bg-surface2"
                aria-label="Hide overlay"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <dl className="px-3 py-2 space-y-1.5">
            <Row k="path" v={location.pathname} />
            <Row k="track" v={track} />
            <Row
              k="viewport"
              v={`${viewport.w}×${viewport.h} · ${breakpoint(viewport.w)}`}
            />
            <div className="pt-1.5 mt-1.5 border-t border-border space-y-1">
              <div className="text-[9px] uppercase tracking-wider text-text-subtle">/app/config label</div>
              <Row k="active"      v={labels.active}      highlight />
              <Row k="job-seeker"  v={labels.jobSeeker} />
              <Row k="policymaker" v={labels.policymaker} />
            </div>
          </dl>
        </div>
      )}
    </>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-subtle">{k}</dt>
      <dd className={`truncate text-right ${highlight ? "text-brand" : "text-text"}`}>{v}</dd>
    </div>
  );
}

/** Toggle the `data-dev-highlight` attribute on <html> so the injected CSS
 *  rule activates without us re-rendering every consumer. */
function DevHighlightToggleEffect({ on }: { on: boolean }) {
  useEffect(() => {
    if (on) document.documentElement.setAttribute("data-dev-highlight", "");
    else document.documentElement.removeAttribute("data-dev-highlight");
    return () => document.documentElement.removeAttribute("data-dev-highlight");
  }, [on]);
  return null;
}
