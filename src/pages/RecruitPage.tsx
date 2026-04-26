import { useEffect, useMemo, useState } from "react";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import { useActiveCountry } from "@/store/useAppStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { generateSyntheticCohort } from "@/lib/synthetic";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Briefcase, Plus, Search, Sparkles, Trash2, Users, X, MapPin, GraduationCap, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

/**
 * Recruit — policymaker / employer workspace for posting open roles & projects
 * and surfacing matched talent. Two sub-tabs:
 *   1. Synthetic candidates — match against the same 50-profile cohort used in
 *      the Talent Pool page (deterministic, no PII).
 *   2. Real job seekers — search opted-in profiles from the database
 *      (profile.discoverable = true).
 *
 * Postings persist via the `recruit_postings` table (RLS: owner can mutate;
 * any authenticated user can browse active postings).
 */

type Aptitude = "Novice" | "Proficient" | "Advanced";
const APT_RANK: Record<Aptitude, number> = { Advanced: 3, Proficient: 2, Novice: 1 };
function hash(s: string) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

interface Posting {
  id: string;
  user_id: string;
  kind: "role" | "project";
  status: "active" | "closed";
  title: string;
  description: string | null;
  country_code: string | null;
  isco_group: number | null;
  seniority: string | null;
  required_skills: string[];
  organization: string | null;
  external_link: string | null;
  created_at: string;
}

const postingSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  organization: z.string().trim().max(120).optional().or(z.literal("")),
  external_link: z.string().trim().url("Must be a valid URL").max(500).optional().or(z.literal("")),
  seniority: z.string().trim().max(40).optional().or(z.literal("")),
  required_skills_raw: z.string().trim().max(500),
});

export default function RecruitPage() {
  const country = useActiveCountry();
  const { user } = useAuth();

  const [postings, setPostings] = useState<Posting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activePostingId, setActivePostingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    kind: "role" as "role" | "project",
    title: "",
    description: "",
    organization: "",
    external_link: "",
    seniority: "",
    required_skills_raw: "",
  });

  const loadPostings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recruit_postings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load postings");
    } else {
      setPostings((data ?? []) as Posting[]);
      if (data && data.length && !activePostingId) setActivePostingId(data[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { loadPostings(); /* eslint-disable-next-line */ }, []);

  const submitPosting = async () => {
    const parsed = postingSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Invalid form");
      return;
    }
    if (!user) { toast.error("You must be signed in"); return; }
    const skills = form.required_skills_raw
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 25);
    if (skills.length === 0) { toast.error("Add at least one required skill"); return; }

    const { data, error } = await supabase.from("recruit_postings").insert({
      user_id: user.id,
      kind: form.kind,
      title: form.title.trim(),
      description: form.description.trim() || null,
      organization: form.organization.trim() || null,
      external_link: form.external_link.trim() || null,
      seniority: form.seniority.trim() || null,
      required_skills: skills,
      country_code: country.code,
    }).select().single();

    if (error) { toast.error(error.message); return; }
    toast.success(`${form.kind === "role" ? "Role" : "Project"} posted`);
    setShowForm(false);
    setForm({ kind: "role", title: "", description: "", organization: "", external_link: "", seniority: "", required_skills_raw: "" });
    setPostings((p) => [data as Posting, ...p]);
    setActivePostingId((data as Posting).id);
  };

  const deletePosting = async (id: string) => {
    const { error } = await supabase.from("recruit_postings").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setPostings((p) => p.filter((x) => x.id !== id));
    if (activePostingId === id) setActivePostingId(null);
    toast.success("Posting removed");
  };

  const activePosting = useMemo(
    () => postings.find((p) => p.id === activePostingId) ?? null,
    [postings, activePostingId],
  );

  return (
    <AppLayout>
      <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-7xl">
        <PageHeader
          eyebrow="Recruit · Policymakers · Employers"
          title={`Post roles, projects, and find matched talent`}
          sub={`Publish open positions and short-term initiatives. Mapped auto-suggests candidates by skill sets, calibrated to your country`}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
          {/* ===== Postings list ===== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text">Your postings</h2>
              <button
                onClick={() => setShowForm((s) => !s)}
                className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-sm border border-border bg-surface hover:bg-surface2 text-text"
              >
                {showForm ? <X size={12} /> : <Plus size={12} />}
                {showForm ? "Cancel" : "New posting"}
              </button>
            </div>

            {showForm && (
              <div className="border border-border rounded-sm bg-surface p-4 space-y-3">
                <div className="flex gap-2">
                  {(["role", "project"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setForm((f) => ({ ...f, kind: k }))}
                      className={`flex-1 text-xs font-mono px-2 py-1.5 rounded-sm border transition-colors ${
                        form.kind === k ? "bg-brand text-bg border-brand" : "bg-surface2 border-border text-text-muted hover:text-text"
                      }`}
                    >
                      {k === "role" ? "Open role" : "Project"}
                    </button>
                  ))}
                </div>
                <Field label="Title">
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    maxLength={120}
                    placeholder={form.kind === "role" ? "Senior Web Developer" : "Solar mini-grid pilot"}
                    className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-sm text-text outline-none focus:border-brand"
                  />
                </Field>
                <Field label="Organization">
                  <input
                    value={form.organization}
                    onChange={(e) => setForm({ ...form, organization: e.target.value })}
                    maxLength={120}
                    className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-sm text-text outline-none focus:border-brand"
                  />
                </Field>
                <Field label="Seniority (optional)">
                  <input
                    value={form.seniority}
                    onChange={(e) => setForm({ ...form, seniority: e.target.value })}
                    placeholder="entry / mid / senior"
                    maxLength={40}
                    className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-sm text-text outline-none focus:border-brand"
                  />
                </Field>
                <Field label="Required skills (comma separated)">
                  <input
                    value={form.required_skills_raw}
                    onChange={(e) => setForm({ ...form, required_skills_raw: e.target.value })}
                    placeholder="welding, safety standards, customer service"
                    maxLength={500}
                    className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-sm text-text outline-none focus:border-brand font-mono"
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    maxLength={1000}
                    rows={3}
                    className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-sm text-text outline-none focus:border-brand resize-none"
                  />
                </Field>
                <Field label="External link (optional)">
                  <input
                    value={form.external_link}
                    onChange={(e) => setForm({ ...form, external_link: e.target.value })}
                    placeholder="https://"
                    maxLength={500}
                    className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-sm text-text outline-none focus:border-brand"
                  />
                </Field>
                <button
                  onClick={submitPosting}
                  className="w-full bg-brand text-bg text-xs font-mono px-3 py-2 rounded-sm hover:bg-brand/90"
                >
                  Publish posting
                </button>
              </div>
            )}

            {loading ? (
              <div className="text-xs text-text-muted font-mono">Loading…</div>
            ) : postings.length === 0 ? (
              <div className="border border-dashed border-border rounded-sm p-6 text-center text-xs text-text-muted">
                No postings yet. Create one to start matching talent.
              </div>
            ) : (
              <div className="space-y-2">
                {postings.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePostingId(p.id)}
                    className={`w-full text-left border rounded-sm p-3 transition-colors ${
                      activePostingId === p.id ? "border-brand bg-surface" : "border-border bg-surface hover:bg-surface2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-brand">
                        {p.kind}
                      </span>
                      {p.user_id === user?.id && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); deletePosting(p.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); deletePosting(p.id); } }}
                          className="text-text-subtle hover:text-warn cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-text font-medium truncate">{p.title}</div>
                    {p.organization && (
                      <div className="text-[11px] text-text-muted truncate">{p.organization}</div>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.required_skills.slice(0, 3).map((s) => (
                        <span key={s} className="text-[9px] font-mono bg-surface2 text-text-muted px-1.5 py-0.5 rounded-sm">
                          {s}
                        </span>
                      ))}
                      {p.required_skills.length > 3 && (
                        <span className="text-[9px] font-mono text-text-subtle">+{p.required_skills.length - 3}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ===== Matching panel ===== */}
          <div>
            {activePosting ? (
              <MatchingPanel posting={activePosting} />
            ) : (
              <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-text-muted">
                Select a posting to see matched candidates, or create a new one.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="label-mono mb-1">{label}</div>
      {children}
    </label>
  );
}

// =================================================================
// Matching panel — synthetic + real candidate sub-tabs for a posting
// =================================================================

function MatchingPanel({ posting }: { posting: Posting }) {
  const country = useActiveCountry();
  const cohort = useMemo(() => generateSyntheticCohort(country, 50), [country]);

  // Score each synthetic candidate against the posting's required skills.
  // Skill overlap is fuzzy (substring both ways); aptitude tier weights the
  // contribution per skill (Advanced 3, Proficient 2, Novice 1).
  type SyntheticMatch = {
    id: string; age: number; education: string; occupation: string;
    risk: number; resilience: "High" | "Medium" | "Low";
    matchedSkills: { label: string; aptitude: Aptitude }[];
    score: number; coverage: number;
  };
  const required = posting.required_skills.map((s) => s.toLowerCase());

  const syntheticMatches: SyntheticMatch[] = useMemo(() => {
    return cohort.map((p) => {
      const enriched = p.skills.map((s) => {
        const r = (hash(p.id + s.label) % 100) / 100;
        const apt: Aptitude = r < 0.25 ? "Novice" : r < 0.6 ? "Proficient" : "Advanced";
        return { label: s.label, aptitude: apt };
      });
      const matched: { label: string; aptitude: Aptitude }[] = [];
      const covered = new Set<string>();
      for (const req of required) {
        const found = enriched.find((s) => {
          const sl = s.label.toLowerCase();
          return sl.includes(req) || req.includes(sl);
        });
        if (found) {
          matched.push(found);
          covered.add(req);
        }
      }
      const score = matched.reduce((sum, s) => sum + APT_RANK[s.aptitude], 0);
      const coverage = required.length ? covered.size / required.length : 0;
      const resilience: "High" | "Medium" | "Low" = p.risk < 0.35 ? "High" : p.risk < 0.6 ? "Medium" : "Low";
      return {
        id: p.id, age: p.age, education: p.education, occupation: p.occupation.label,
        risk: p.risk, resilience, matchedSkills: matched, score, coverage,
      };
    }).sort((a, b) => b.score - a.score || b.coverage - a.coverage).slice(0, 25);
  }, [cohort, required.join("|")]);

  // Real signed-up users — fetched from profiles table where discoverable=true.
  type RealCandidate = {
    user_id: string; display_name: string | null; organization: string | null;
    country_code: string | null; topAttempts: { category: string; level: string; score: number; total: number }[];
    matchedCategories: string[];
  };
  const [realCandidates, setRealCandidates] = useState<RealCandidate[]>([]);
  const [realSearch, setRealSearch] = useState("");
  const [realLoading, setRealLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRealLoading(true);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, organization, country_code, discoverable")
        .eq("discoverable", true)
        .limit(100);

      if (cancelled || !profiles) { setRealLoading(false); return; }

      // Pull recent aptitude attempts to surface skill signals
      const userIds = profiles.map((p) => p.user_id);
      let attemptsByUser: Record<string, RealCandidate["topAttempts"]> = {};
      if (userIds.length) {
        const { data: attempts } = await supabase
          .from("aptitude_attempts")
          .select("user_id, category, level, score, total, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .limit(500);
        (attempts ?? []).forEach((a) => {
          if (!attemptsByUser[a.user_id]) attemptsByUser[a.user_id] = [];
          if (attemptsByUser[a.user_id].length < 5) {
            attemptsByUser[a.user_id].push({
              category: a.category, level: a.level, score: a.score, total: a.total,
            });
          }
        });
      }

      const enriched: RealCandidate[] = profiles.map((p) => {
        const top = attemptsByUser[p.user_id] ?? [];
        const matchedCategories = top
          .filter((t) => required.some((r) =>
            t.category.toLowerCase().includes(r) || r.includes(t.category.toLowerCase())
          ))
          .map((t) => t.category);
        return {
          user_id: p.user_id,
          display_name: p.display_name,
          organization: p.organization,
          country_code: p.country_code,
          topAttempts: top,
          matchedCategories,
        };
      }).sort((a, b) => b.matchedCategories.length - a.matchedCategories.length);

      setRealCandidates(enriched);
      setRealLoading(false);
    })();
    return () => { cancelled = true; };
  }, [posting.id, required.join("|")]);

  const filteredReal = realCandidates.filter((c) => {
    if (!realSearch.trim()) return true;
    const q = realSearch.toLowerCase();
    return (c.display_name ?? "").toLowerCase().includes(q)
      || (c.organization ?? "").toLowerCase().includes(q)
      || c.topAttempts.some((t) => t.category.toLowerCase().includes(q));
  });

  return (
    <div className="border border-border rounded-sm bg-surface p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-brand mb-1">
            <Briefcase size={11} /> {posting.kind}
            <span className="text-text-subtle">·</span>
            <span className={posting.status === "active" ? "text-teal" : "text-warn"}>{posting.status}</span>
          </div>
          <h3 className="text-lg font-medium text-text">{posting.title}</h3>
          {posting.organization && <div className="text-xs text-text-muted">{posting.organization}</div>}
        </div>
        <div className="text-right text-[10px] font-mono text-text-subtle">
          posted {new Date(posting.created_at).toLocaleDateString()}
        </div>
      </div>

      {posting.description && (
        <p className="text-sm text-text-muted mb-4 leading-relaxed">{posting.description}</p>
      )}

      <div className="mb-5">
        <div className="label-mono mb-1.5">Required skills</div>
        <div className="flex flex-wrap gap-1.5">
          {posting.required_skills.map((s) => (
            <span key={s} className="text-[11px] font-mono bg-surface2 border border-border text-text px-2 py-0.5 rounded-sm">
              {s}
            </span>
          ))}
        </div>
      </div>

      <Tabs defaultValue="synthetic">
        <TabsList className="bg-surface2 border border-border rounded-sm h-auto p-1 mb-4">
          <TabsTrigger value="synthetic" className="data-[state=active]:bg-brand data-[state=active]:text-bg rounded-sm text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Sparkles size={12} /> Auto-suggested ({syntheticMatches.length})
          </TabsTrigger>
          <TabsTrigger value="real" className="data-[state=active]:bg-brand data-[state=active]:text-bg rounded-sm text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Users size={12} /> Real candidates ({realCandidates.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="synthetic" className="mt-0">
          <div className="text-[11px] text-text-muted mb-3">
            Ranked by skill overlap × aptitude tier (Advanced 3 · Proficient 2 · Novice 1) against the synthetic {country.name} cohort.
          </div>
          {syntheticMatches.length === 0 || syntheticMatches[0].score === 0 ? (
            <EmptyState text="No synthetic candidates match these required skills. Try broader skill keywords." />
          ) : (
            <div className="space-y-2">
              {syntheticMatches.filter((m) => m.score > 0).map((m, i) => (
                <CandidateRow
                  key={m.id}
                  rank={i + 1}
                  title={m.occupation}
                  subtitle={`${m.age} yrs · ${m.education}`}
                  badges={[
                    { label: `score ${m.score}`, tone: "brand" },
                    { label: `${Math.round(m.coverage * 100)}% match`, tone: "teal" },
                    { label: `${m.resilience} resilience`, tone: m.resilience === "High" ? "teal" : m.resilience === "Medium" ? "brand" : "warn" },
                  ]}
                  skills={m.matchedSkills.map((s) => `${s.label} · ${s.aptitude}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="real" className="mt-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
              <input
                value={realSearch}
                onChange={(e) => setRealSearch(e.target.value)}
                placeholder="Search by name, org, or skill category"
                className="w-full bg-bg border border-border rounded-sm pl-8 pr-2.5 py-1.5 text-sm text-text outline-none focus:border-brand"
              />
            </div>
          </div>
          <div className="text-[11px] text-text-muted mb-3">
            Real signed-up users who opted into discoverability. Skill signal comes from their aptitude assessments.
          </div>
          {realLoading ? (
            <div className="text-xs text-text-muted font-mono">Loading candidates…</div>
          ) : filteredReal.length === 0 ? (
            <EmptyState text="No discoverable candidates found yet. Real users appear here once they enable discoverability in their profile." />
          ) : (
            <div className="space-y-2">
              {filteredReal.map((c, i) => (
                <CandidateRow
                  key={c.user_id}
                  rank={i + 1}
                  title={c.display_name ?? "Anonymous candidate"}
                  subtitle={[c.organization, c.country_code].filter(Boolean).join(" · ") || "—"}
                  badges={[
                    ...(c.matchedCategories.length
                      ? [{ label: `${c.matchedCategories.length} skill match`, tone: "teal" as const }]
                      : []),
                    { label: `${c.topAttempts.length} assessments`, tone: "brand" as const },
                  ]}
                  skills={c.topAttempts.map((t) => `${t.category} · ${t.level} (${t.score}/${t.total})`)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CandidateRow({
  rank, title, subtitle, badges, skills,
}: {
  rank: number;
  title: string;
  subtitle: string;
  badges: { label: string; tone: "brand" | "teal" | "warn" }[];
  skills: string[];
}) {
  const toneCls = (t: "brand" | "teal" | "warn") =>
    t === "teal" ? "bg-teal/15 text-teal" : t === "warn" ? "bg-warn/15 text-warn" : "bg-brand/15 text-brand";
  return (
    <div className="border border-border rounded-sm bg-bg p-3 hover:border-strong transition-colors">
      <div className="flex items-start gap-3">
        <div className="text-xs font-mono text-text-subtle pt-0.5 w-5">{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm text-text truncate">{title}</div>
              <div className="text-[11px] text-text-muted truncate">{subtitle}</div>
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
              {badges.map((b) => (
                <span key={b.label} className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm ${toneCls(b.tone)}`}>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
          {skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skills.map((s) => (
                <span key={s} className="text-[10px] font-mono bg-surface2 text-text-muted px-1.5 py-0.5 rounded-sm">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-border rounded-sm p-6 text-center text-xs text-text-muted">
      {text}
    </div>
  );
}
