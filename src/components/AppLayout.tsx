import { NavLink as RRNavLink, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { CountryKey, countryConfigs, countryKeys } from "@/data/countryConfigs";
import { User, Activity, ShieldAlert, Target, LineChart, Building2, Settings, Grid3x3, ChevronDown, Sprout, Check, ArrowLeft, Users, Menu, X, Briefcase } from "lucide-react";
import DemoPersonaSwitcher from "@/components/DemoPersonaSwitcher";
import UserMenu from "@/components/UserMenu";
import SwitchTrackButton from "@/components/SwitchTrackButton";
import { useAuth } from "@/hooks/useAuth";
import { getPersonaByEmail, type DemoTrack } from "@/lib/demoPersonas";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type NavLinkItem = {
  to: string;
  label: string;
  /** i18next key resolved at render time. Falls back to `label` if missing. */
  labelKey?: string;
  icon: typeof User;
  mod?: string;
  tooltip?: string;
  /** i18next key for the tooltip. Falls back to `tooltip` if missing. */
  tooltipKey?: string;
};
type NavGroup = {
  label: string;
  /** i18next key for the group label (e.g. "app.groups.assess"). */
  labelKey?: string;
  links: NavLinkItem[];
};

const COUNTRY_VIEW_TOOLTIP_KEY = "app.tooltips.countryView";
const COUNTRY_VIEW_TOOLTIP_FALLBACK = "Switch the active country and inspect its calibration inputs — informality rate, GDP per capita, structural multiplier, and source years used across every page.";

export const jobSeekerGroups: NavGroup[] = [
  {
    label: "Assess",
    labelKey: "app.groups.assess",
    links: [
      { to: "/app/profile", label: "Profile Input", labelKey: "app.links.profileInput", icon: User },
      { to: "/app/grow",    label: "Grow",          labelKey: "app.links.grow",         icon: Sprout, mod: "GR" },
      { to: "/app/skills",  label: "Skills Signal", labelKey: "app.links.skillsSignal", icon: Activity, mod: "01" },
      { to: "/app/match",   label: "Opportunity Match", labelKey: "app.links.opportunityMatch", icon: Target, mod: "03" },
    ],
  },
  {
    label: "System",
    labelKey: "app.groups.system",
    links: [
      { to: "/app/config", label: "Country View", labelKey: "app.links.countryView", icon: Settings, tooltip: COUNTRY_VIEW_TOOLTIP_FALLBACK, tooltipKey: COUNTRY_VIEW_TOOLTIP_KEY },
    ],
  },
];

export const policymakerGroups: NavGroup[] = [
  {
    label: "Insights",
    labelKey: "app.groups.insights",
    links: [
      { to: "/app/policy",  label: "Policymaker Dashboard", labelKey: "app.links.policymakerDashboard", icon: Building2 },
      { to: "/app/heatmap", label: "Risk Heat Map",         labelKey: "app.links.riskHeatMap",          icon: Grid3x3, mod: "FO" },
    ],
  },
  {
    label: "Talent Pool",
    labelKey: "app.groups.talentPool",
    links: [
      { to: "/app/talent", label: "Talent Pool", labelKey: "app.links.talentPool", icon: Users, mod: "TP" },
      { to: "/app/recruit", label: "Recruit", labelKey: "app.links.recruit", icon: Briefcase, mod: "RC" },
    ],
  },
  {
    label: "System",
    labelKey: "app.groups.system",
    links: [
      { to: "/app/config", label: "Country View", labelKey: "app.links.countryView", icon: Settings, tooltip: COUNTRY_VIEW_TOOLTIP_FALLBACK, tooltipKey: COUNTRY_VIEW_TOOLTIP_KEY },
    ],
  },
];

export function navGroupsForTrack(track: DemoTrack | null | undefined) {
  return track === "policymaker" ? policymakerGroups : jobSeekerGroups;
}

/**
 * Pure resolver for the sidebar nav groups. Mirrors the precedence used inside
 * AppLayout so it can be unit-tested without rendering the component:
 *   1. Demo persona (matched by email) — always wins, even if profile is stale.
 *   2. DB-stored account role on the profile row.
 *   3. Fallback to the job-seeker (individual) view.
 */
export function resolveNavGroups(args: {
  email?: string | null;
  role?: "individual" | "policymaker" | null;
}) {
  const persona = getPersonaByEmail(args.email);
  if (persona) return navGroupsForTrack(persona.track);
  if (args.role === "policymaker") return navGroupsForTrack("policymaker");
  return navGroupsForTrack("individual");
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const country = useActiveCountry();
  const setCountry = useAppStore((s) => s.setCountry);
  const activeKey = useAppStore((s) => s.country);
  const location = useLocation();
  const { user, profile, loading } = useAuth();
  // Translation hook — drives all sidebar / drawer chrome strings. Falls
  // back to the static English label if a key isn't present in the active
  // locale's bundle.
  const { t } = useTranslation();
  const tr = (key: string | undefined, fallback: string) =>
    key ? (t(key) === key ? fallback : t(key)) : fallback;
  const navGroups = useMemo(
    () => resolveNavGroups({ email: user?.email, role: profile?.role ?? null }),
    [profile?.role, user?.email]
  );
  const allLinks = useMemo(() => navGroups.flatMap((g) => g.links), [navGroups]);

  // Track resolution mirrors resolveNavGroups so the mobile chrome (drawer vs.
  // bottom bar) follows the same rules as the desktop sidebar contents.
  const persona = getPersonaByEmail(user?.email);
  const track: DemoTrack = persona?.track ?? (profile?.role === "policymaker" ? "policymaker" : "individual");
  const isPolicymaker = track === "policymaker";

  // Mobile drawer state — only used on the policymaker track. Auto-close when
  // the route changes so navigating from the drawer dismisses it.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  // Swipe-to-close gesture for the mobile drawer. We track the active drag
  // offset (always <= 0; rightward swipes are clamped) and disable the CSS
  // transition while the finger is down so the drawer follows the touch 1:1.
  // On release we either commit the close (past distance threshold OR a fast
  // leftward flick) or spring back to fully open.
  const DRAWER_WIDTH = 260; // keep in sync with the w-[260px] class below
  const SWIPE_CLOSE_PX = 80;             // distance threshold to commit close
  const SWIPE_CLOSE_VELOCITY = 0.5;      // leftward px/ms flick threshold
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const lockAxis = useRef<"x" | "y" | null>(null);

  const onDrawerTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: performance.now() };
    lockAxis.current = null;
    setDragging(true);
  };
  const onDrawerTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    // Lock axis on first meaningful movement so vertical scrolls inside the
    // nav don't accidentally drag the drawer horizontally.
    if (!lockAxis.current && Math.abs(dx) + Math.abs(dy) > 8) {
      lockAxis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (lockAxis.current !== "x") return;
    // Only react to leftward swipes (closing direction); clamp rightward.
    setDragX(Math.min(0, dx));
  };
  const onDrawerTouchEnd = () => {
    if (!touchStart.current) { setDragging(false); return; }
    const elapsed = Math.max(1, performance.now() - touchStart.current.t);
    const velocity = -dragX / elapsed; // leftward px/ms (positive = closing)
    const shouldClose = -dragX > SWIPE_CLOSE_PX || velocity > SWIPE_CLOSE_VELOCITY;
    setDragging(false);
    setDragX(0);
    touchStart.current = null;
    lockAxis.current = null;
    if (shouldClose) setMobileNavOpen(false);
  };
  // Reset drag offset whenever the drawer toggles so reopening is clean.
  useEffect(() => { setDragX(0); }, [mobileNavOpen]);

  // Inline switch feedback: flash badge + show "Loaded" pill briefly
  const [flash, setFlash] = useState(false);
  const [justSwitched, setJustSwitched] = useState<string | null>(null);
  const prevKey = useRef(activeKey);
  useEffect(() => {
    if (prevKey.current !== activeKey) {
      prevKey.current = activeKey;
      setFlash(true);
      setJustSwitched(country.name);
      const t1 = setTimeout(() => setFlash(false), 700);
      const t2 = setTimeout(() => setJustSwitched(null), 1800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [activeKey, country.name]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-muted text-sm font-mono">
        {t("common.loading")}
      </div>
    );
  }

  // Reusable sidebar body — rendered both in the persistent desktop column and
  // inside the mobile drawer for policymakers, so the two stay in sync.
  const sidebarBody = (
    <>
      <div className="px-5 pt-6 pb-5 border-b border-border">
        <h1 className="font-display text-[22px] text-text tracking-tight" style={{ fontWeight: 600 }}>
          MAPPED<span className="text-brand">.</span>
        </h1>
        <div className="mt-3 label-mono">{t("app.sidebar.activeCountry")}</div>
        <div
          key={activeKey}
          className={cn(
            "mt-1.5 flex items-center gap-2 text-[13px] text-text rounded-sm px-1.5 py-1 -mx-1.5 transition-colors duration-500 animate-fade-in",
            flash ? "bg-accent-soft" : "bg-transparent"
          )}
        >
          <span className={cn("inline-block w-1.5 h-1.5 rounded-full bg-brand", flash && "animate-pulse")} />
          <span className="font-mono text-xs">{country.code}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted truncate">{country.name}</span>
        </div>
        {justSwitched && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-brand animate-fade-in">
            <Check size={10} strokeWidth={2.25} />
            <span className="truncate">{t("app.sidebar.datasetLoaded")} · {justSwitched}</span>
          </div>
        )}
      </div>

      <nav className="px-2 py-3 flex-1 overflow-y-auto">
        <TooltipProvider delayDuration={200}>
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="px-3 pb-1.5 label-mono">{tr(group.labelKey, group.label)}</div>
              <div className="space-y-px">
                {group.links.map((l) => {
                  const active = location.pathname === l.to;
                  const Icon = l.icon;
                  // Render the link once; conditionally wrap with Tooltip when
                  // the entry has a tooltip string. Tooltip uses pointerdown +
                  // focus internally, so taps on touch devices momentarily
                  // surface the tip before navigation occurs.
                  const link = (
                    <RRNavLink
                      to={l.to}
                      className={cn(
                        "group flex items-center gap-2.5 px-3 py-1.5 rounded-sm text-[13px] transition-colors relative",
                        active
                          ? "bg-surface2 text-text font-medium"
                          : "text-text-muted hover:text-text hover:bg-surface2/70"
                      )}
                    >
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-brand rounded-r-sm" />}
                      <Icon size={14} className={active ? "text-brand" : "text-text-subtle group-hover:text-text-muted"} strokeWidth={1.75} />
                      <span className="flex-1 truncate">{tr(l.labelKey, l.label)}</span>
                      {l.mod && (
                        <span className="font-mono text-[9px] text-text-subtle tracking-wider">
                          {l.mod}
                        </span>
                      )}
                    </RRNavLink>
                  );
                  const tipText = l.tooltipKey ? tr(l.tooltipKey, l.tooltip ?? "") : l.tooltip;
                  if (!tipText) return <div key={l.to}>{link}</div>;
                  return (
                    <Tooltip key={l.to}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" align="center" className="max-w-[240px] text-xs leading-snug">
                        {tipText}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </TooltipProvider>
      </nav>

      <div className="px-3 py-3 border-t border-border bg-surface2/40">
        <label className="label-mono mb-1.5 block">{t("app.sidebar.switchCountry")}</label>
        <div className="relative">
          <select
            value={activeKey}
            onChange={(e) => setCountry(e.target.value as CountryKey)}
            className="w-full appearance-none bg-surface rounded-sm border border-border text-text text-xs font-mono px-2.5 py-2 pr-7 outline-none focus:border-brand cursor-pointer hover:border-strong transition-colors"
          >
            {countryKeys.map((k) => (
              <option key={k} value={k} className="bg-surface text-text">
                {countryConfigs[k as CountryKey].code} — {countryConfigs[k as CountryKey].name}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
        </div>
        <div className="mt-3 label-mono text-[9px] leading-relaxed">{t("app.sidebar.summit")}<br/>{t("app.sidebar.prototype")}</div>
        {/* Language switcher in the sidebar footer — visible on every dashboard
            page so users can change language without leaving their workflow. */}
        <div className="mt-3 -mx-1">
          <LanguageSwitcher align="start" className="w-full justify-start" />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-bg text-text">
      {/* Sidebar — desktop (always visible at md+) */}
      <aside className="hidden md:flex flex-col w-[232px] shrink-0 border-r border-border bg-surface">
        {sidebarBody}
      </aside>

      {/* Mobile slide-in side nav — policymaker track only.
          Replaces the bottom tab bar with a proper sidebar drawer so
          analysts get the same grouped navigation on phones. */}
      {isPolicymaker && (
        <>
          {/* Backdrop — opacity tracks the drag so the dim recedes as the
              user pulls the drawer offscreen, giving tactile feedback. */}
          <div
            onClick={() => setMobileNavOpen(false)}
            style={
              mobileNavOpen && dragging
                ? { opacity: Math.max(0, 1 + dragX / DRAWER_WIDTH), transition: "none" }
                : undefined
            }
            className={cn(
              "md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity",
              mobileNavOpen ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            aria-hidden="true"
          />
          {/* Drawer — touch handlers implement swipe-to-close. While dragging
              we suppress the CSS transition and apply an inline transform so
              the panel tracks the finger; on release the transition class
              springs us back to the committed open/closed state. */}
          <aside
            onTouchStart={onDrawerTouchStart}
            onTouchMove={onDrawerTouchMove}
            onTouchEnd={onDrawerTouchEnd}
            onTouchCancel={onDrawerTouchEnd}
            style={
              mobileNavOpen && dragging
                ? { transform: `translateX(${dragX}px)`, transition: "none" }
                : undefined
            }
            className={cn(
              "md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-[260px] bg-surface border-r border-border shadow-xl touch-pan-y",
              !dragging && "transition-transform duration-200",
              mobileNavOpen ? "translate-x-0" : "-translate-x-full",
            )}
            aria-label="Policymaker navigation"
          >
            <div className="flex items-center justify-end px-2 pt-2">
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-2 rounded-sm text-text-muted hover:text-text hover:bg-surface2"
                aria-label={t("common.close")}
              >
                <X size={16} />
              </button>
            </div>
            {sidebarBody}
          </aside>
        </>
      )}

      {/* Main */}
      <main className={cn("flex-1 min-w-0", isPolicymaker ? "pb-0" : "pb-16 md:pb-0")}>
        <div className="flex items-center justify-between gap-2 px-4 md:px-6 pt-3">
          {/* Mobile drawer trigger — policymaker only, hidden on md+ */}
          {isPolicymaker ? (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden inline-flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-text px-2 py-1.5 rounded-sm border border-border bg-surface"
              aria-label={t("common.menu")}
            >
              <Menu size={14} />
              <span>Menu</span>
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="flex justify-end gap-2">
            <SwitchTrackButton />
            <DemoPersonaSwitcher />
            <UserMenu />
          </div>
        </div>
        {children}
      </main>

      {/* Mobile bottom nav — job-seeker track only. Policymakers use the
          slide-in side drawer above so the nav grouping is preserved on mobile. */}
      {!isPolicymaker && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur-sm border-t border-border flex overflow-x-auto shadow-lg">
          {allLinks.map((l) => {
            const active = location.pathname === l.to;
            const Icon = l.icon;
            return (
              <RRNavLink
                key={l.to}
                to={l.to}
                className={cn(
                  "flex flex-col items-center justify-center px-3 py-2 text-[10px] min-w-[64px] transition-colors",
                  active ? "text-brand" : "text-text-muted"
                )}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span className="mt-0.5">{tr(l.labelKey, l.label).split(" ")[0]}</span>
              </RRNavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mb-8 pb-6 border-b border-border animate-fade-in">
      <BackButton />
      {eyebrow && <div className="label-mono mb-2.5">{eyebrow}</div>}
      <h1 className="font-display text-3xl md:text-[40px] text-text leading-[1.1]" style={{ fontWeight: 400 }}>
        {title}
      </h1>
      {sub && <p className="text-text-muted mt-3 text-[15px] max-w-2xl leading-relaxed">{sub}</p>}
    </div>
  );
}

/**
 * Back navigation for dashboard pages. Walks browser history when possible,
 * otherwise falls back to the role's home dashboard so users are never
 * stranded after a deep-link or fresh login.
 */
export function BackButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  const persona = getPersonaByEmail(user?.email);
  const track: DemoTrack = persona?.track ?? (profile?.role === "policymaker" ? "policymaker" : "individual");
  const home = track === "policymaker" ? "/app/policy" : "/app/profile";
  const onHome = location.pathname === home;

  // Hide on the home page of the active track — there's nothing to go back to
  // within the dashboard. Users still have the sidebar + landing link.
  if (onHome) return null;

  const handleClick = () => {
    // history.length > 1 means we have an in-app entry to pop. If we don't,
    // route to the role's home dashboard instead of bouncing to the landing.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(home, { replace: true });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 mb-4 text-xs font-mono text-text-muted hover:text-text transition-colors",
        className,
      )}
      aria-label="Go back to previous page"
    >
      <ArrowLeft size={13} strokeWidth={2} />
      <span>Back</span>
    </button>
  );
}

