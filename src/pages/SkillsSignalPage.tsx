import { useEffect, useMemo, useState } from "react";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles, Trash2, RefreshCcw, Sprout, User as UserIcon, FileCheck2, Target, ArrowRight } from "lucide-react";
import SkillAptitudeTest, { AssessmentBadge, StartTestButton } from "@/components/SkillAptitudeTest";
import DataProvenance from "@/components/DataProvenance";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ResiliencySection from "@/components/ResiliencySection";
import RiskSection from "@/components/RiskSection";
import SkillMapDashboard from "@/components/SkillMapDashboard";

interface GrowSkillRating { category: string; rating: number; }
interface GrowAptitude { id: string; category: string; score: number; total: number; level: string; created_at: string; skill_input: string | null; }
interface GrowPortfolio { id: string; title: string; status: string; skill_tags: string[] | null; sdg_number: number | null; updated_at?: string; created_at: string; }

export default function SkillsSignalPage() {
  const profile = useAppStore((s) => s.activeProfile);
  const form = useAppStore((s) => s.form);
  const country = useActiveCountry();
  const assessments = useAppStore((s) => s.assessments);
  const clearAssessments = useAppStore((s) => s.clearAssessments);
  const { user } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_TABS = ["signal", "resiliency", "risk"] as const;
  const tabParam = searchParams.get("tab");
  const tab = (VALID_TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as string) : "signal";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    if (next === "signal") sp.delete("tab"); else sp.set("tab", next);
    setSearchParams(sp, { replace: false });
  };

  const [activeSkill, setActiveSkill] = useState<string | null>(null);

  // Pull Grow data so Skills Signal becomes the single tabulated view of Profile + Grow.
  const [growRatings, setGrowRatings] = useState<GrowSkillRating[]>([]);
  const [growAttempts, setGrowAttempts] = useState<GrowAptitude[]>([]);
  const [growPortfolio, setGrowPortfolio] = useState<GrowPortfolio[]>([]);
  const [growLoading, setGrowLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setGrowRatings([]); setGrowAttempts([]); setGrowPortfolio([]);
      return;
    }
    let cancelled = false;
    setGrowLoading(true);
    Promise.all([
      supabase.from("user_skill_ratings").select("category, rating").eq("user_id", user.id),
      supabase.from("aptitude_attempts")
        .select("id, category, score, total, level, created_at, skill_input")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("portfolio_projects")
        .select("id, title, status, skill_tags, sdg_number, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]).then(([r, a, p]) => {
      if (cancelled) return;
      setGrowRatings(((r.data ?? []) as GrowSkillRating[]).filter((x) => x.rating > 0));
      setGrowAttempts((a.data ?? []) as GrowAptitude[]);
      setGrowPortfolio((p.data ?? []) as GrowPortfolio[]);
    }).finally(() => { if (!cancelled) setGrowLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  const assessmentMap = useMemo(() => {
    const m: Record<string, (typeof assessments)[number]> = {};
    assessments.forEach((a) => { m[a.skill.toLowerCase()] = a; });
    return m;
  }, [assessments]);

  if (!profile) {
    return (
      <AppLayout>
        <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-6xl">
          <PageHeader
            eyebrow="Module 01 · Skills Signal Engine"
            title="Your skills, mapped"
            sub={`ISCO-08 + ESCO mapping for ${country.name} (${country.code}).`}
          />
          {/* Aggregated skill-set map (Profile + Grow) — synthesized from Grow data even before AI mapping has run */}
          <SkillMapDashboard profile={null} ratings={growRatings} attempts={growAttempts} />
          <div className="surface rounded-sm p-5 mt-4 border-l-2 border-brand bg-gradient-to-r from-brand/5 to-transparent flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 mb-1">
                <Target size={14} className="text-brand" />
                <div className="label-mono text-brand">Opportunity Match</div>
              </div>
              <p className="text-text-muted text-sm">
                Map your skills to {country.name}'s growth industries and the skills each one is hiring for.
              </p>
            </div>
            <Link
              to="/app/match"
              className="inline-flex items-center gap-2 bg-brand text-bg px-4 py-2.5 rounded-sm font-mono text-xs hover:opacity-90 transition-opacity"
            >
              Open Opportunity Match <ArrowRight size={14} />
            </Link>
          </div>
          <div className="surface rounded-sm p-6 text-text-muted text-sm mt-4">
            For the full ISCO-08 + ESCO breakdown, run the AI mapping from{" "}
            <Link to="/app/grow" className="text-brand underline">Grow → Map My Skills</Link>{" "}
            or <Link to="/app/profile" className="text-brand underline">Profile Input</Link>.
          </div>
        </div>
      </AppLayout>
    );
  }

  const exportPassport = () => {
    const blob = new Blob([JSON.stringify({ profile: form, mapped: profile, country: country.code, assessments }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `unmapped-skills-passport-${country.code}.json`; a.click();
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-6xl">
        <PageHeader eyebrow="Module 01 · Skills Signal Engine" title="Your skills, mapped" sub={`ISCO-08 + ESCO mapping for ${country.name} (${country.code}). Run quick aptitude tests to verify each skill.`} />

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-xl mb-6">
            <TabsTrigger value="signal">Skills Signal</TabsTrigger>
            <TabsTrigger value="resiliency">Resiliency Score</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="signal">
        {/* Assessment progress */}
        {(() => {
          const total = profile.esco_skills.length;
          const done = profile.esco_skills.filter((s) => assessmentMap[s.label.toLowerCase()]).length;
          const pct = total === 0 ? 0 : Math.round((done / total) * 100);
          const complete = done === total && total > 0;
          return (
            <div className="surface rounded-sm p-4 mb-6">
              <div className="flex items-baseline justify-between mb-2">
                <div className="label-mono">Assessment progress</div>
                <div className="font-mono text-xs">
                  <span className={complete ? "text-teal" : "text-brand"}>{done}</span>
                  <span className="text-text-muted">/{total} skills · {pct}%</span>
                </div>
              </div>
              <div className="h-2 bg-bg rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${complete ? "bg-teal" : "bg-brand"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="label-mono mt-2 text-[10px]">
                {complete
                  ? "All skills assessed — your profile is fully verified."
                  : `${total - done} skill${total - done === 1 ? "" : "s"} left to assess`}
              </div>
            </div>
          );
        })()}

        {/* Plain summary */}
        <div className="border-l-2 border-teal pl-6 py-4 mb-8">
          <div className="label-mono mb-2 text-teal">Plain language summary</div>
          <p className="font-display italic text-2xl md:text-3xl text-text leading-snug" style={{ fontWeight: 300 }}>
            {profile.plain_summary}
          </p>
        </div>

        {/* Aggregated skill-set map (Profile + Grow) */}
        <SkillMapDashboard profile={profile} ratings={growRatings} attempts={growAttempts} />

        {/* CTA → Opportunity Match: map skills to country growth sectors */}
        <div className="surface rounded-sm p-5 mb-8 border-l-2 border-brand bg-gradient-to-r from-brand/5 to-transparent">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-2 mb-1">
                <Target size={14} className="text-brand" />
                <div className="label-mono text-brand">Next step · Opportunity Match</div>
              </div>
              <h3 className="font-display text-xl text-text mb-1" style={{ fontWeight: 400 }}>
                See where your skills fit in {country.name}'s growth economy
              </h3>
              <p className="text-text-muted text-sm leading-relaxed">
                We'll map your verified skill set against {country.name}'s fastest-growing industries
                and surface the exact skills employers are hiring for in each sector.
              </p>
            </div>
            <Link
              to="/app/match"
              className="inline-flex items-center gap-2 bg-brand text-bg px-4 py-2.5 rounded-sm font-mono text-xs hover:opacity-90 transition-opacity self-center"
            >
              Open Opportunity Match
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Profile + Grow tabulated signals */}
        <div className="surface rounded-sm p-5 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <FileCheck2 size={14} className="text-brand" />
            <div className="label-mono">Profile &amp; Grow signals</div>
            <span className="ml-auto font-mono text-[10px] text-text-muted">
              Combined inputs from <Link to="/app/profile" className="text-brand hover:underline">Profile</Link> + <Link to="/app/grow" className="text-brand hover:underline">Grow</Link>
            </span>
          </div>
          <p className="text-text-muted text-xs mb-4">
            Everything you've entered in Profile Input and Grow is tabulated here so this Skills Signal view is your single source of truth.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {/* From Profile Input */}
            <div className="surface2 rounded-sm p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <UserIcon size={12} className="text-teal" />
                <div className="label-mono">From Profile Input</div>
              </div>
              <dl className="space-y-1.5 text-xs">
                {form.name && <Row label="Name" value={form.name} />}
                {form.age !== "" && <Row label="Age" value={String(form.age)} />}
                <Row label="Education" value={form.education || "—"} />
                <Row label="Experience" value={`${form.experience} yrs`} />
                <Row label="Country" value={`${country.name} (${country.code})`} />
                <Row label="Connectivity" value={form.connectivity || "—"} />
                {form.languages?.length > 0 && (
                  <div className="pt-1">
                    <div className="text-text-muted mb-1">Languages</div>
                    <div className="flex flex-wrap gap-1">
                      {form.languages.map((l, i) => <span key={i} className="pill bg-teal/15 text-teal">{l}</span>)}
                    </div>
                  </div>
                )}
                {form.skills?.length > 0 && (
                  <div className="pt-1">
                    <div className="text-text-muted mb-1">Self-reported skills ({form.skills.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {form.skills.map((s, i) => <span key={i} className="pill bg-brand/15 text-brand">{s}</span>)}
                    </div>
                  </div>
                )}
                {form.description && (
                  <div className="pt-1">
                    <div className="text-text-muted mb-1">Description</div>
                    <p className="text-text leading-snug">{form.description}</p>
                  </div>
                )}
              </dl>
            </div>

            {/* From Grow */}
            <div className="surface2 rounded-sm p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Sprout size={12} className="text-brand" />
                <div className="label-mono">From Grow</div>
                {growLoading && <span className="ml-auto font-mono text-[10px] text-text-muted">Loading…</span>}
              </div>
              {!user?.id ? (
                <div className="text-xs text-text-muted">
                  Sign in to pull your Grow ratings, aptitude attempts, and portfolio into this view.{" "}
                  <Link to="/auth" className="text-brand underline">Sign in →</Link>
                </div>
              ) : !growLoading && growRatings.length === 0 && growAttempts.length === 0 && growPortfolio.length === 0 ? (
                <div className="text-xs text-text-muted">
                  No Grow activity yet. <Link to="/app/grow" className="text-brand underline">Open Grow →</Link>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  {growRatings.length > 0 && (
                    <div>
                      <div className="text-text-muted mb-1">Self-rated skills ({growRatings.length})</div>
                      <div className="space-y-1">
                        {growRatings
                          .slice()
                          .sort((a, b) => b.rating - a.rating)
                          .slice(0, 8)
                          .map((r) => (
                            <div key={r.category} className="flex items-center gap-2">
                              <span className="flex-1 truncate">{r.category}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <i key={n} className={`w-2 h-2 rounded-sm inline-block ${n <= r.rating ? "bg-brand" : "bg-bg"}`} />
                                ))}
                              </div>
                              <span className="font-mono text-[10px] text-text-muted w-6 text-right">{r.rating}/5</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {growAttempts.length > 0 && (
                    <div>
                      <div className="text-text-muted mb-1">Aptitude attempts ({growAttempts.length})</div>
                      <div className="space-y-1">
                        {growAttempts.slice(0, 5).map((a) => {
                          const cls =
                            a.level === "Advanced" ? "text-teal"
                            : a.level === "Proficient" ? "text-brand"
                            : "text-warn";
                          return (
                            <div key={a.id} className="flex items-center gap-2">
                              <span className="flex-1 truncate">{a.skill_input || a.category}</span>
                              <span className="font-mono text-[10px] text-text-muted">{a.score}/{a.total}</span>
                              <span className={`font-mono text-[10px] ${cls} w-16 text-right`}>{a.level}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {growPortfolio.length > 0 && (
                    <div>
                      <div className="text-text-muted mb-1">Portfolio projects ({growPortfolio.length})</div>
                      <div className="space-y-1">
                        {growPortfolio.slice(0, 5).map((p) => {
                          const cls =
                            p.status === "done" ? "text-teal"
                            : p.status === "in_progress" ? "text-brand"
                            : "text-text-muted";
                          return (
                            <div key={p.id} className="flex items-start gap-2">
                              <span className="flex-1 truncate">{p.title}</span>
                              {p.sdg_number && <span className="pill bg-bg text-text-muted text-[9px]">SDG {p.sdg_number}</span>}
                              <span className={`font-mono text-[10px] ${cls} w-20 text-right`}>{p.status.replace("_", " ")}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          {/* ISCO */}
          <div className="surface rounded-sm p-5">
            <div className="label-mono mb-3">ISCO-08 matches</div>
            <div className="space-y-3">
              {profile.isco_matches.slice(0, 3).map((m) => (
                <div key={m.code} className="surface2 rounded-sm p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm text-teal">{m.code}</span>
                    <span className="text-sm text-text">{m.label}</span>
                  </div>
                  <div className="mt-2">
                    <div className="h-1 bg-bg rounded-full overflow-hidden">
                      <div className="h-full bg-teal" style={{ width: `${Math.round(m.confidence * 100)}%` }} />
                    </div>
                    <div className="label-mono mt-1">Confidence {Math.round(m.confidence * 100)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ESCO */}
          <div className="surface rounded-sm p-5">
            <div className="label-mono mb-3">ESCO skills</div>
            <div className="flex flex-wrap gap-1.5">
              {profile.esco_skills.map((s, i) => {
                const cls = s.type === "formal" ? "bg-teal/20 text-teal" : s.type === "informal" ? "bg-warn/20 text-warn" : "bg-brand/20 text-brand";
                return <span key={i} className={`pill ${cls}`}>{s.label}</span>;
              })}
            </div>
            <div className="mt-4 flex gap-3 label-mono">
              <span className="flex items-center gap-1"><i className="w-2 h-2 bg-teal inline-block"></i>formal</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 bg-warn inline-block"></i>informal</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 bg-brand inline-block"></i>demonstrated</span>
            </div>
          </div>

          {/* Metadata */}
          <div className="surface rounded-sm p-5">
            <div className="label-mono mb-3">Profile metadata</div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-text-muted">Education</dt><dd>{form.education}</dd></div>
              <div className="flex justify-between"><dt className="text-text-muted">Experience</dt><dd>{form.experience} yrs</dd></div>
              <div className="flex justify-between"><dt className="text-text-muted">Country</dt><dd>{country.name} ({country.code})</dd></div>
              <div className="flex justify-between"><dt className="text-text-muted">Region</dt><dd>{country.region}</dd></div>
              <div className="flex justify-between"><dt className="text-text-muted">Connectivity</dt><dd>{form.connectivity}</dd></div>
            </dl>
            <div className="label-mono mt-4">Mapping: ISCO-08 · ESCO v1.1</div>
            <DataProvenance />
          </div>
        </div>

        {/* Skill aptitude tests */}
        <div className="surface rounded-sm p-5 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-brand" />
            <div className="label-mono">Skill aptitude tests</div>
            <span className="ml-auto font-mono text-[10px] text-text-muted">
              {assessments.length}/{profile.esco_skills.length} assessed
            </span>
          </div>
          <p className="text-text-muted text-xs mb-4">
            Click <span className="text-brand">Test</span> next to a skill to run a 5-question quiz (powered by OpenTDB). Results map to <span className="text-warn">Novice</span> / <span className="text-brand">Proficient</span> / <span className="text-teal">Advanced</span> aptitude and feed your dashboard.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Skill list */}
            <div className="space-y-2">
              {profile.esco_skills.map((s, i) => {
                const a = assessmentMap[s.label.toLowerCase()];
                const isActive = activeSkill === s.label;
                // Status: in_progress (currently active test) > needs_retake (Novice) > assessed > not_assessed
                const status: "in_progress" | "needs_retake" | "assessed" | "not_assessed" =
                  isActive && !a ? "in_progress"
                  : a && a.aptitude === "Novice" ? "needs_retake"
                  : a ? "assessed"
                  : isActive ? "in_progress"
                  : "not_assessed";
                const statusMeta = {
                  in_progress: { dot: "bg-brand animate-pulse", label: "In progress", cls: "text-brand" },
                  needs_retake: { dot: "bg-warn", label: "Needs retake", cls: "text-warn" },
                  assessed: { dot: "bg-teal", label: "Assessed", cls: "text-teal" },
                  not_assessed: { dot: "bg-text-muted/40", label: "Not assessed", cls: "text-text-muted" },
                }[status];
                return (
                  <div
                    key={i}
                    className={`surface2 rounded-sm p-3 border ${isActive ? "border-brand" : "border-border"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider ${statusMeta.cls} whitespace-nowrap`}
                        title={statusMeta.label}
                      >
                        <i className={`w-1.5 h-1.5 rounded-full inline-block ${statusMeta.dot}`} />
                        {statusMeta.label}
                      </span>
                      <span className="text-sm flex-1 truncate">{s.label}</span>
                      {a && <AssessmentBadge assessment={a} />}
                      <StartTestButton skill={s.label} onClick={() => setActiveSkill(s.label)} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active test panel */}
            <div id="active-test-panel">
              {activeSkill ? (
                <SkillAptitudeTest
                  key={activeSkill}
                  skill={activeSkill}
                  onClose={() => setActiveSkill(null)}
                />
              ) : (
                <div className="surface2 rounded-sm p-6 text-center text-text-muted text-sm h-full flex items-center justify-center">
                  Select a skill on the left to start an aptitude test.
                </div>
              )}
            </div>
          </div>

          {assessments.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
              <div className="text-xs text-text-muted">
                Results saved to your profile and visible on the <Link to="/youth" className="text-brand underline">Youth Dashboard</Link>.
              </div>
              <button
                onClick={clearAssessments}
                className="pill border border-border text-text-muted hover:border-warn hover:text-warn text-[10px] flex items-center gap-1"
              >
                <Trash2 size={10} /> Clear all
              </button>
            </div>
          )}
        </div>

        {/* Retest a previously assessed skill */}
        {assessments.length > 0 && (
          <div className="surface rounded-sm p-5 mb-8">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCcw size={14} className="text-teal" />
              <div className="label-mono">Retest a previously assessed skill</div>
              <span className="ml-auto font-mono text-[10px] text-text-muted">
                {assessments.length} retestable
              </span>
            </div>
            <p className="text-text-muted text-xs mb-4">
              Pick any skill you've already assessed to retake the quiz. Only that skill's latest result will be overwritten — all others stay intact.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[...assessments]
                .sort((a, b) => (a.assessed_at < b.assessed_at ? 1 : -1))
                .map((a) => {
                  const aptCls =
                    a.aptitude === "Advanced" ? "text-teal"
                    : a.aptitude === "Proficient" ? "text-brand"
                    : "text-warn";
                  const isActive = activeSkill === a.skill;
                  const confirmRetake = () => {
                    if (window.confirm(`Retake the aptitude test for "${a.skill}"?\n\nYour previous result (${a.aptitude}, ${a.correct}/${a.total}) will be overwritten only after you finish the new test.`)) {
                      setActiveSkill(a.skill);
                      // scroll the active panel into view
                      setTimeout(() => {
                        document.getElementById("active-test-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 50);
                    }
                  };
                  return (
                    <div
                      key={a.skill}
                      className={`surface2 rounded-sm p-3 border ${isActive ? "border-teal" : "border-border"}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="text-sm truncate">{a.skill}</div>
                          <div className="label-mono text-[9px] mt-0.5">{a.category}</div>
                        </div>
                        <span className={`font-mono text-[10px] ${aptCls} whitespace-nowrap`}>
                          {a.aptitude}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-[10px] text-text-muted">
                          {a.correct}/{a.total} · {new Date(a.assessed_at).toLocaleDateString()}
                        </div>
                        <button
                          onClick={confirmRetake}
                          className="pill border border-border text-text-muted hover:border-teal hover:text-teal text-[10px] flex items-center gap-1"
                        >
                          <RefreshCcw size={9} /> Retest
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button onClick={exportPassport} className="bg-brand text-bg px-5 py-2.5 rounded-sm text-sm font-medium hover:opacity-90">Export Skills Passport</button>
          <Link to="/risk" className="surface2 px-5 py-2.5 rounded-sm text-sm hover:bg-surface">View AI Risk Lens →</Link>
        </div>
          </TabsContent>

          <TabsContent value="resiliency">
            <ResiliencySection />
          </TabsContent>

          <TabsContent value="risk">
            <RiskSection />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text text-right truncate">{value}</dd>
    </div>
  );
}
