import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowDown, ArrowUp, Bookmark, BookmarkPlus, Check, Copy, ExternalLink, Globe, GripVertical, Loader2, Lock, Pencil, Plus, RotateCcw, Search, Settings, Share2, Sparkles, Target, Trash2, Upload, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { mapProfileWithClaude } from "@/lib/claude";
import { supabase } from "@/integrations/supabase/client";
import { categoryForSkill, fetchQuestions, scoreToAptitude, type AptitudeLevel, type TriviaQuestion } from "@/lib/opentdb";
import ResiliencySection from "@/components/ResiliencySection";
import RiskSection from "@/components/RiskSection";
import GrowProfileSync from "@/components/GrowProfileSync";
import AppLayout from "@/components/AppLayout";

const SKILL_CATEGORIES = [
  "Computers", "Mathematics", "Science & Nature", "Geography",
  "History", "Art", "Sports", "General Knowledge",
];

/** Country-flavoured category suggestions to help users localize. ISO-3 keys. */
const COUNTRY_CATEGORY_HINTS: Record<string, string[]> = {
  KEN: ["Mobile money / fintech", "Smallholder agriculture", "Swahili communication", "Renewable energy", "Tourism & hospitality"],
  IND: ["IT services", "Hindi/English communication", "Agritech", "Manufacturing & engineering", "Financial inclusion"],
  NGA: ["Oil & gas operations", "Agribusiness", "Fintech", "Creative industries (Nollywood)", "Public health"],
  BRA: ["Agribusiness", "Portuguese communication", "Renewable energy", "Mining & extractives", "Public sector / SUS"],
  ZAF: ["Mining & metals", "Tourism", "Fintech", "Renewable energy", "Agriculture & viticulture"],
  IDN: ["Marine & fisheries", "Bahasa communication", "Manufacturing", "Tourism & hospitality", "Digital commerce"],
  PHL: ["BPO / customer service", "English communication", "Healthcare", "Maritime work", "Disaster response"],
  USA: ["Software & cloud", "Healthcare", "Logistics", "Finance & accounting", "Skilled trades"],
  GBR: ["Financial services", "Healthcare (NHS)", "Creative industries", "Engineering", "Public administration"],
  DEU: ["Manufacturing & engineering", "Automotive", "Renewable energy", "German communication", "Skilled trades (Handwerk)"],
};

/** Career-pathway flavoured suggestions, matched on substring of free-text input. */
const CAREER_PATHWAY_HINTS: { match: RegExp; suggestions: string[] }[] = [
  { match: /(software|develop|engineer|programm|web|app)/i, suggestions: ["Software development", "Cloud & DevOps", "Data structures", "UX & design", "Technical communication"] },
  { match: /(data|analyt|scien|machine|ai)/i, suggestions: ["Statistics & probability", "SQL & data wrangling", "Python / R", "Data visualization", "Domain expertise"] },
  { match: /(health|nurs|medic|care|doctor)/i, suggestions: ["Patient communication", "Clinical reasoning", "Public health", "Health informatics", "Care coordination"] },
  { match: /(teach|educat|tutor|train)/i, suggestions: ["Pedagogy & lesson design", "Subject expertise", "Classroom management", "Assessment & feedback", "EdTech tools"] },
  { match: /(agri|farm|food|crop)/i, suggestions: ["Agronomy", "Soil & water", "Agribusiness", "Cooperative organizing", "Climate-smart farming"] },
  { match: /(business|entrepre|sales|marketing|retail)/i, suggestions: ["Sales & negotiation", "Marketing & branding", "Bookkeeping & finance", "Customer insight", "Operations"] },
  { match: /(finance|account|bank|invest)/i, suggestions: ["Bookkeeping", "Financial analysis", "Risk & compliance", "Excel modeling", "Communication with clients"] },
  { match: /(design|art|creat|media|video|film)/i, suggestions: ["Visual design", "Storytelling", "Production tools", "Audience research", "Project delivery"] },
  { match: /(construct|build|trade|electric|plumb|carpent)/i, suggestions: ["Site safety", "Materials & tools", "Reading plans / drawings", "Estimation", "Customer communication"] },
  { match: /(law|legal|policy|govern)/i, suggestions: ["Legal research", "Policy analysis", "Written communication", "Negotiation", "Public engagement"] },
];

const DEFAULT_PATHWAY_KEY = "grow:career-pathway";

interface SkillRating { id: string; category: string; rating: number; notes: string | null; }
interface AptitudeRow { id: string; category: string; score: number; total: number; level: AptitudeLevel; created_at: string; skill_input: string | null; }
interface PortfolioRow {
  id: string; title: string; description: string | null; sdg_number: number | null;
  skill_focus: string | null; status: "planned" | "in_progress" | "done";
  started_on: string | null; completed_on: string | null; external_link: string | null;
  reflection: string | null; evidence_paths: string[]; created_at: string;
  skill_tags: string[]; is_public: boolean; share_slug: string | null;
}
interface SdgRanked { n: number; title: string; tags: string[]; priority: number; }

export default function GrowPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const form = useAppStore((s) => s.form);
  const setForm = useAppStore((s) => s.setForm);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);
  const setMappedAt = useAppStore((s) => s.setMappedAt);
  const country = useActiveCountry();
  const [mapping, setMapping] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_TABS = ["skills", "resiliency", "risk"] as const;
  const tabParam = searchParams.get("tab");
  const tab = (VALID_TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as string) : "skills";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    if (next === "skills") sp.delete("tab"); else sp.set("tab", next);
    setSearchParams(sp, { replace: false });
  };

  /**
   * Aggregate Profile-Input form + Grow data (self-rated skills, aptitude
   * attempts) into a single enriched form, then run the AI mapper so the
   * Skills Signal page renders a concrete profile derived from BOTH sources.
   */
  const handleMapMySkills = async () => {
    if (mapping) return;
    setMapping(true);
    try {
      let aggregatedSkills: string[] = [...(form.skills ?? [])];
      let descriptionAdditions: string[] = [];

      if (user?.id) {
        const [{ data: ratingsData }, { data: aptData }] = await Promise.all([
          supabase
            .from("user_skill_ratings")
            .select("category, rating, notes")
            .eq("user_id", user.id),
          supabase
            .from("aptitude_attempts")
            .select("category, score, total, level, skill_input, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

        const ratings = (ratingsData ?? []) as { category: string; rating: number; notes: string | null }[];
        const attempts = (aptData ?? []) as { category: string; score: number; total: number; level: string; skill_input: string | null }[];

        // Strong self-rated skills (≥3) feed straight into the skills array
        ratings.filter((r) => r.rating >= 3).forEach((r) => {
          if (!aggregatedSkills.find((s) => s.toLowerCase() === r.category.toLowerCase())) {
            aggregatedSkills.push(r.category);
          }
        });

        // Aptitude-verified skills (Proficient / Advanced) become demonstrated skills
        const verified = attempts.filter((a) => a.level === "Proficient" || a.level === "Advanced");
        verified.forEach((a) => {
          const label = a.skill_input?.trim() || a.category;
          if (!aggregatedSkills.find((s) => s.toLowerCase() === label.toLowerCase())) {
            aggregatedSkills.push(label);
          }
        });

        if (ratings.length > 0) {
          const top = ratings.filter((r) => r.rating >= 4).map((r) => r.category).slice(0, 5);
          if (top.length) descriptionAdditions.push(`Self-rates strongest in: ${top.join(", ")}.`);
        }
        if (verified.length > 0) {
          const verifiedLabels = Array.from(new Set(verified.slice(0, 5).map((a) => `${a.skill_input?.trim() || a.category} (${a.level})`)));
          descriptionAdditions.push(`Aptitude-verified: ${verifiedLabels.join(", ")}.`);
        }
      }

      const enrichedForm = {
        ...form,
        skills: aggregatedSkills,
        description: [form.description?.trim(), ...descriptionAdditions].filter(Boolean).join(" "),
      };

      // Persist the aggregation back to the form so Profile Input reflects it too
      setForm(enrichedForm);

      const mapped = await mapProfileWithClaude(enrichedForm, country);
      setActiveProfile(mapped);
      setMappedAt(new Date().toISOString());
      nav("/app/skills");
    } catch (e: any) {
      toast({
        title: "Couldn't map your skills",
        description: e?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setMapping(false);
    }
  };


  // Portfolio now lives on the Opportunity Match page; forward draft events there.
  useEffect(() => {
    function onDraft() {
      try { window.location.assign("/app/match?tab=portfolio"); } catch { /* ignore */ }
    }
    window.addEventListener("grow:portfolio-draft", onDraft);
    return () => window.removeEventListener("grow:portfolio-draft", onDraft);
  }, []);

  return (
    <AppLayout>
      <main className="p-6 md:p-10 pb-24 md:pb-10 max-w-6xl">
        <div className="mb-6">
          <div className="label-mono mb-1">Strengths · Resiliency · Risk</div>
          <h1 className="font-display text-3xl text-text">Assess Your Skill Sets</h1>
          <p className="text-text-muted mt-2 max-w-2xl">
            Combine aptitude tests with self-rated skills to find your strengths and gaps
          </p>
        </div>

        {user && <GrowProfileSync userId={user.id} />}

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-xl">
            <TabsTrigger value="skills">Strengths & gaps</TabsTrigger>
            <TabsTrigger value="resiliency">Resiliency Score</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="skills" className="mt-6">
            {user ? <SkillsTab userId={user.id} countryCode={profile?.country_code ?? null} /> : null}
          </TabsContent>
          <TabsContent value="resiliency" className="mt-6">
            <ResiliencySection />
          </TabsContent>
          <TabsContent value="risk" className="mt-6">
            <RiskSection />
          </TabsContent>
        </Tabs>

        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          <div>
            <div className="label-mono mb-1">Ready to see your results?</div>
            <p className="text-sm text-text-muted">Combine your profile and Grow data into your Skills Signal.</p>
          </div>
          <button
            onClick={handleMapMySkills}
            disabled={mapping}
            className="bg-brand text-bg px-6 py-3 rounded-sm font-medium text-sm hover:opacity-90 inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {mapping ? (<><Loader2 size={14} className="animate-spin" /> Mapping…</>) : (<>Map My Skills →</>)}
          </button>
        </div>
      </main>
    </AppLayout>
  );
}

/* ============================================================
   STRENGTHS & GAPS TAB — self-ratings + aptitude history overlay
   ============================================================ */

function SkillsTab({ userId, countryCode }: { userId: string; countryCode: string | null }) {
  const { toast } = useToast();
  const [ratings, setRatings] = useState<Record<string, SkillRating>>({});
  const [attempts, setAttempts] = useState<AptitudeRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Customizable categories — falls back to SKILL_CATEGORIES if none saved
  const [categories, setCategories] = useState<{ id: string; label: string; position: number }[]>([]);
  const [customizing, setCustomizing] = useState(false);
  const [pathway, setPathway] = useState<string>(() => {
    try { return localStorage.getItem(DEFAULT_PATHWAY_KEY) ?? ""; } catch { return ""; }
  });

  // aptitude test runner state
  const [skillInput, setSkillInput] = useState("");
  const [running, setRunning] = useState(false);
  const [questions, setQuestions] = useState<TriviaQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  /** Suggested defaults derived from the user's country + pathway selections.
   *  Used whenever the user hasn't explicitly saved a custom category list. */
  const suggestedDefaults = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (s: string) => { if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
    // Pathway hints first (most specific to user's career intent)
    if (pathway) {
      const hit = CAREER_PATHWAY_HINTS.find((h) => h.match.test(pathway));
      hit?.suggestions.forEach(push);
    }
    // Then country-flavoured hints
    if (countryCode && COUNTRY_CATEGORY_HINTS[countryCode]) {
      COUNTRY_CATEGORY_HINTS[countryCode].forEach(push);
    }
    // Fall back to generic defaults if we have nothing context-specific
    if (out.length === 0) SKILL_CATEGORIES.forEach(push);
    return out.slice(0, 8);
  }, [countryCode, pathway]);

  /** Effective list — user's customized categories, or the suggested defaults if empty. */
  const effectiveCategories = useMemo(
    () => (categories.length > 0 ? categories.map((c) => c.label) : suggestedDefaults),
    [categories, suggestedDefaults],
  );

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: a }, { data: c }] = await Promise.all([
      supabase.from("user_skill_ratings").select("id, category, rating, notes").eq("user_id", userId),
      supabase.from("aptitude_attempts")
        .select("id, category, score, total, level, created_at, skill_input")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("user_skill_categories")
        .select("id, label, position").eq("user_id", userId).order("position", { ascending: true }),
    ]);
    const map: Record<string, SkillRating> = {};
    (r ?? []).forEach((row) => { map[row.category] = row as SkillRating; });
    setRatings(map);
    setAttempts((a ?? []) as AptitudeRow[]);
    setCategories((c ?? []) as { id: string; label: string; position: number }[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId]);

  async function setRating(category: string, rating: number) {
    const existing = ratings[category];
    setRatings((p) => ({ ...p, [category]: { ...(existing ?? { id: "", notes: null }), category, rating } as SkillRating }));
    const { error } = await supabase
      .from("user_skill_ratings")
      .upsert({ user_id: userId, category, rating, country_code: countryCode ?? null }, { onConflict: "user_id,category" });
    if (error) toast({ title: "Failed to save rating", description: error.message, variant: "destructive" });
    else load();
  }

  /** Replace the user's category list with `next` (positions reassigned). */
  async function persistCategories(next: string[]) {
    const trimmed = Array.from(new Set(next.map((s) => s.trim()).filter(Boolean)));
    if (trimmed.length === 0) {
      // Clear all → reverts to defaults via effectiveCategories
      const { error } = await supabase.from("user_skill_categories").delete().eq("user_id", userId);
      if (error) { toast({ title: "Reset failed", description: error.message, variant: "destructive" }); return; }
      setCategories([]);
      toast({ title: "Reverted to default categories" });
      return;
    }
    if (trimmed.length > 16) {
      toast({ title: "Too many categories", description: "Keep it under 16 for clarity.", variant: "destructive" });
      return;
    }
    // Wipe + reinsert keeps logic simple and ordering deterministic.
    const { error: delErr } = await supabase.from("user_skill_categories").delete().eq("user_id", userId);
    if (delErr) { toast({ title: "Save failed", description: delErr.message, variant: "destructive" }); return; }
    const rows = trimmed.map((label, i) => ({ user_id: userId, label, position: i }));
    const { data, error } = await supabase.from("user_skill_categories")
      .insert(rows).select("id, label, position");
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setCategories((data ?? []) as { id: string; label: string; position: number }[]);
    toast({ title: "Categories updated" });
  }

  // Compute combined strengths/gaps
  const summary = useMemo(() => {
    const byCat: Record<string, { rating?: number; bestApt?: AptitudeLevel; combined: number }> = {};
    effectiveCategories.forEach((c) => { byCat[c] = { combined: 0 }; });
    for (const r of Object.values(ratings)) {
      const cat = byCat[r.category] ?? (byCat[r.category] = { combined: 0 });
      cat.rating = r.rating;
    }
    const aptScore: Record<AptitudeLevel, number> = { Novice: 1, Proficient: 3, Advanced: 5 };
    for (const a of attempts) {
      const cat = byCat[a.category] ?? (byCat[a.category] = { combined: 0 });
      const s = aptScore[a.level];
      if (!cat.bestApt || aptScore[cat.bestApt] < s) cat.bestApt = a.level;
    }
    Object.values(byCat).forEach((v) => {
      const r = v.rating ?? 0;
      const a = v.bestApt ? aptScore[v.bestApt] : 0;
      v.combined = (r * 0.5) + (a * 0.5); // 0..5
    });
    const rows = Object.entries(byCat).map(([cat, v]) => ({ category: cat, ...v }));
    const rated = rows.filter((r) => r.rating || r.bestApt);
    const strengths = [...rated].filter((r) => r.combined >= 3.5).sort((a, b) => b.combined - a.combined);
    const gaps = [...rated].filter((r) => r.combined > 0 && r.combined < 2.5).sort((a, b) => a.combined - b.combined);
    return { rows, strengths, gaps };
  }, [ratings, attempts, effectiveCategories]);

  async function runAptitude() {
    if (!skillInput.trim()) { toast({ title: "Enter a skill first", variant: "destructive" }); return; }
    setRunning(true); setQuestions(null); setAnswers({});
    try {
      const cat = categoryForSkill(skillInput);
      // Topic-specific questions via Lovable AI; fall back to OpenTDB trivia if it fails.
      const { data, error } = await supabase.functions.invoke("aptitude-questions", {
        body: { skill: skillInput, count: 5, category: cat.label },
      });
      if (error) throw error;
      const aiQs = (data as { questions?: TriviaQuestion[] } | null)?.questions ?? [];
      if (aiQs.length === 0) throw new Error("No questions returned");
      setQuestions(aiQs);
    } catch (e) {
      console.error("AI aptitude failed, falling back to OpenTDB", e);
      try {
        const cat = categoryForSkill(skillInput);
        const qs = await fetchQuestions(cat.id, 5);
        setQuestions(qs);
        toast({
          title: "Using general questions",
          description: "Couldn't generate topic-specific questions just now — showing related trivia instead.",
        });
      } catch (e2) {
        toast({
          title: "Could not load questions",
          description: e2 instanceof Error ? e2.message : String(e2),
          variant: "destructive",
        });
      }
    } finally { setRunning(false); }
  }

  async function submitAptitude() {
    if (!questions) return;
    let correct = 0;
    questions.forEach((q, i) => { if (answers[i] === q.correct_answer) correct++; });
    const level = scoreToAptitude(correct, questions.length);
    const cat = categoryForSkill(skillInput);
    const { error } = await supabase.from("aptitude_attempts").insert({
      user_id: userId, skill_input: skillInput, category: cat.label,
      score: correct, total: questions.length, level,
      country_code: countryCode ?? null,
    });
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: `Result: ${level}`, description: `${correct} of ${questions.length} correct in ${cat.label}` });
    setQuestions(null); setAnswers({}); setSkillInput("");
    load();
  }

  if (loading) return <div className="text-text-muted text-sm flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> Loading…</div>;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Customize categories — full width */}
      <section className="surface-elevated p-5 lg:col-span-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="label-mono mb-1 inline-flex items-center gap-1.5">
              <Settings size={11} />
            </div>
            <h2 className="font-display text-xl text-text">
              {categories.length > 0
                ? "Your custom categories"
                : (countryCode || pathway)
                  ? "Suggested categories"
                  : "Default categories"}
            </h2>
            <p className="text-xs text-text-muted mt-1">
              {categories.length > 0
                ? `${effectiveCategories.length} categories tailored to your context.`
                : (countryCode || pathway)
                  ? `Showing ${effectiveCategories.length} suggestions based on ${pathway ? `pathway "${pathway}"` : ""}${pathway && countryCode ? " and " : ""}${countryCode ?? ""}. Refine to save your own.`
                  : `Using the ${SKILL_CATEGORIES.length} default categories. Customize them to match your country and career pathway.`}
            </p>
          </div>
          <Button size="sm" variant={customizing ? "default" : "outline"} onClick={() => setCustomizing((v) => !v)}>
            <Pencil size={12} className="mr-1.5" /> {customizing ? "Close editor" : "Refine categories"}
          </Button>
        </div>

        {customizing && (
          <CategoryEditor
            current={effectiveCategories}
            isCustom={categories.length > 0}
            countryCode={countryCode}
            pathway={pathway}
            onPathwayChange={(v) => {
              setPathway(v);
              try { localStorage.setItem(DEFAULT_PATHWAY_KEY, v); } catch { /* ignore */ }
            }}
            onSave={persistCategories}
            onReset={() => persistCategories([])}
          />
        )}
      </section>

      {/* self ratings */}
      <section className="surface-elevated p-5">
        <div className="label-mono mb-1">Self-rate your skills</div>
        <h2 className="font-display text-xl text-text mb-1">How comfortable are you in each area?</h2>
        <p className="text-xs text-text-muted mb-4">1 = none · 5 = expert. Saved instantly.</p>
        <div className="space-y-4">
          {effectiveCategories.map((c) => {
            const v = ratings[c]?.rating ?? 0;
            return (
              <div key={c} className="flex items-center gap-3">
                <div className="w-40 text-sm text-text truncate" title={c}>{c}</div>
                <div className="flex-1">
                  <Slider value={[v]} min={0} max={5} step={1} onValueChange={(val) => setRating(c, val[0])} />
                </div>
                <div className="w-6 text-right font-mono text-xs text-text-muted">{v}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* aptitude runner + history */}
      <section className="surface-elevated p-5">
        <div className="label-mono mb-1">Aptitude check</div>
        <h2 className="font-display text-xl text-text mb-1">Test yourself in 5 questions</h2>
        <p className="text-xs text-text-muted mb-4">Type any skill or topic — we'll generate 5 questions tailored to it.</p>

        {!questions && (
          <div className="flex gap-2">
            <Input placeholder="e.g. Python, accounting, sewing…" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} maxLength={80} />
            <Button onClick={runAptitude} disabled={running}>
              {running ? <Loader2 className="animate-spin" size={14} /> : "Start"}
            </Button>
          </div>
        )}

        {questions && (
          <div className="space-y-4">
            {questions.map((q, i) => (
              <div key={i} className="surface2 p-3 rounded-sm">
                <div className="text-sm text-text mb-2">{i + 1}. {q.question}</div>
                <div className="grid gap-1.5">
                  {q.choices.map((c) => (
                    <label key={c} className={`flex items-center gap-2 text-xs p-2 rounded-sm cursor-pointer border ${answers[i] === c ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"}`}>
                      <input type="radio" name={`q-${i}`} checked={answers[i] === c} onChange={() => setAnswers((p) => ({ ...p, [i]: c }))} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={submitAptitude} disabled={Object.keys(answers).length < questions.length}>Submit</Button>
              <Button variant="outline" onClick={() => { setQuestions(null); setAnswers({}); }}>Cancel</Button>
            </div>
          </div>
        )}

        {attempts.length > 0 && (
          <div className="mt-6">
            <div className="label-mono mb-2">Recent attempts</div>
            <div className="space-y-1.5 max-h-60 overflow-auto">
              {attempts.slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-text-muted">{new Date(a.created_at).toLocaleDateString()} · {a.category}</span>
                  <Badge variant={a.level === "Advanced" ? "default" : a.level === "Proficient" ? "secondary" : "outline"}>
                    {a.level} ({a.score}/{a.total})
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* combined summary spans both columns */}
      <section className="surface-elevated p-5 lg:col-span-2">
        <div className="label-mono mb-1">Your profile</div>
        <h2 className="font-display text-xl text-text mb-3">Strengths & gaps (combined)</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <SummaryCol title="Strengths" empty="Rate yourself or take an aptitude test to see strengths." rows={summary.strengths} kind="strength" countryCode={countryCode} pathway={pathway} />
          <SummaryCol title="Gaps to upskill" empty="Once we have a few signals we'll suggest where to grow." rows={summary.gaps} kind="gap" countryCode={countryCode} pathway={pathway} />
        </div>
      </section>
    </div>
  );
}

interface RoadmapModule {
  step: number; title: string; focus: string;
  activities: string[]; resources: string[];
  weeks: number; level_after: AptitudeLevel;
}
interface Roadmap {
  overview: string;
  current_level: AptitudeLevel;
  target_level: "Proficient" | "Advanced";
  total_weeks: number;
  modules: RoadmapModule[];
}

function SummaryCol({ title, empty, rows, kind, countryCode, pathway }: {
  title: string; empty: string; kind: "strength" | "gap";
  rows: { category: string; combined: number; rating?: number; bestApt?: AptitudeLevel }[];
  countryCode: string | null;
  pathway: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [roadmaps, setRoadmaps] = useState<Record<string, Roadmap>>({});

  async function loadRoadmap(category: string, currentLevel?: AptitudeLevel, rating?: number) {
    if (open === category) { setOpen(null); return; }
    setOpen(category);
    if (roadmaps[category]) return;
    setLoading(category);
    const { data, error } = await supabase.functions.invoke("skill-roadmap", {
      body: {
        category,
        currentLevel: currentLevel ?? null,
        selfRating: rating ?? null,
        targetLevel: "Advanced",
        countryCode,
        pathway: pathway || null,
      },
    });
    setLoading(null);
    if (error) {
      toast({ title: "Couldn't generate roadmap", description: error.message, variant: "destructive" });
      setOpen(null);
      return;
    }
    const payload = data as { roadmap?: Roadmap; error?: string };
    if (payload.error || !payload.roadmap) {
      toast({ title: "Roadmap unavailable", description: payload.error ?? "Try again.", variant: "destructive" });
      setOpen(null);
      return;
    }
    setRoadmaps((r) => ({ ...r, [category]: payload.roadmap! }));
  }

  return (
    <div className="surface2 p-4 rounded-sm">
      <div className="font-mono text-xs text-text mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-text-muted">{empty}</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const isOpen = open === r.category;
            const rm = roadmaps[r.category];
            return (
              <li key={r.category} className="rounded-sm">
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-text truncate">{r.category}</span>
                  <span className="flex items-center gap-2 text-xs font-mono text-text-muted shrink-0">
                    {r.bestApt && <Badge variant="outline">{r.bestApt}</Badge>}
                    {r.rating ? <span>self {r.rating}/5</span> : null}
                    <span className={`w-2 h-2 rounded-full ${kind === "strength" ? "bg-teal" : "bg-accent"}`} />
                    <Button
                      size="sm" variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => loadRoadmap(r.category, r.bestApt, r.rating)}
                      disabled={loading === r.category}
                    >
                      {loading === r.category
                        ? <Loader2 className="animate-spin" size={11} />
                        : isOpen ? <>Hide <X size={10} className="ml-1" /></>
                        : <>Roadmap <Sparkles size={10} className="ml-1" /></>}
                    </Button>
                  </span>
                </div>
                {isOpen && rm && (
                  <div className="mt-2 surface p-3 rounded-sm border-l-2 border-accent">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <div className="text-xs text-text-muted">{rm.overview}</div>
                      <div className="text-right">
                        <div className="data-num text-lg text-accent leading-none">~{rm.total_weeks}w</div>
                        <div className="text-[10px] font-mono text-text-muted">to {rm.target_level}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted mb-2">
                      <Badge variant="outline" className="text-[10px]">From {rm.current_level}</Badge>
                      <span>→</span>
                      <Badge variant="outline" className="text-[10px]">To {rm.target_level}</Badge>
                    </div>
                    <ol className="space-y-2">
                      {rm.modules.map((m) => (
                        <li key={m.step} className="surface2 p-2.5 rounded-sm">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="font-mono text-[11px] text-text">
                              <span className="text-accent">Step {m.step}</span> · {m.title}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted">
                              <Badge variant="outline" className="text-[10px]">{m.weeks}w</Badge>
                              <Badge variant="secondary" className="text-[10px]">→ {m.level_after}</Badge>
                            </div>
                          </div>
                          <div className="text-xs text-text-muted mt-1">{m.focus}</div>
                          {m.activities?.length > 0 && (
                            <ul className="mt-1.5 list-disc pl-4 text-xs text-text space-y-0.5">
                              {m.activities.map((a, i) => <li key={i}>{a}</li>)}
                            </ul>
                          )}
                          {m.resources?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {m.resources.map((res, i) => (
                                <Badge key={i} variant="outline" className="text-[10px]">{res}</Badge>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ----- CategoryEditor: refine the 8 skill categories ----- */

function CategoryEditor({
  current, isCustom, countryCode, pathway, onPathwayChange, onSave, onReset,
}: {
  current: string[];
  isCustom: boolean;
  countryCode: string | null;
  pathway: string;
  onPathwayChange: (v: string) => void;
  onSave: (next: string[]) => void | Promise<void>;
  onReset: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<string[]>(current);
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(current); }, [current]);

  const countrySuggestions = useMemo(() => {
    if (!countryCode) return [] as string[];
    return COUNTRY_CATEGORY_HINTS[countryCode.toUpperCase()] ?? [];
  }, [countryCode]);

  const pathwaySuggestions = useMemo(() => {
    if (!pathway.trim()) return [] as string[];
    const out = new Set<string>();
    CAREER_PATHWAY_HINTS.forEach((h) => {
      if (h.match.test(pathway)) h.suggestions.forEach((s) => out.add(s));
    });
    return Array.from(out);
  }, [pathway]);

  const allSuggestions = useMemo(() => {
    const seen = new Set(draft.map((d) => d.toLowerCase()));
    return [...countrySuggestions, ...pathwaySuggestions].filter((s) => !seen.has(s.toLowerCase()));
  }, [countrySuggestions, pathwaySuggestions, draft]);

  function add(label: string) {
    const v = label.trim();
    if (!v) return;
    if (draft.some((d) => d.toLowerCase() === v.toLowerCase())) return;
    setDraft((d) => [...d, v]);
    setNewCat("");
  }

  function remove(idx: number) { setDraft((d) => d.filter((_, i) => i !== idx)); }

  function move(idx: number, dir: -1 | 1) {
    setDraft((d) => {
      const next = [...d];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return d;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try { await onSave(draft); } finally { setBusy(false); }
  }

  async function reset() {
    if (!confirm("Revert to the default 8 categories? Saved ratings stay; only those matching the active list will appear.")) return;
    setBusy(true);
    try { await onReset(); } finally { setBusy(false); }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(current);

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="label-mono">Country (from your profile)</Label>
          <div className="text-sm text-text mt-1">
            {countryCode ? (
              <span className="font-mono">{countryCode.toUpperCase()}</span>
            ) : (
              <span className="text-text-muted">Set a country in your profile to unlock local suggestions.</span>
            )}
          </div>
        </div>
        <div>
          <Label className="label-mono">Career pathway (free text)</Label>
          <Input
            value={pathway}
            onChange={(e) => onPathwayChange(e.target.value)}
            placeholder="e.g. nursing, software engineering, agribusiness"
            maxLength={120}
          />
        </div>
      </div>

      <div>
        <div className="label-mono mb-2">Your categories ({draft.length})</div>
        {draft.length === 0 ? (
          <div className="surface2 p-3 rounded-sm text-xs text-text-muted">
            No categories yet — saving an empty list reverts to the defaults.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {draft.map((label, i) => (
              <li key={`${label}-${i}`} className="flex items-center gap-2 surface2 px-2.5 py-1.5 rounded-sm">
                <GripVertical size={12} className="text-text-muted shrink-0" />
                <span className="flex-1 text-sm text-text truncate">{label}</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp size={12} />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => move(i, 1)} disabled={i === draft.length - 1}>
                  <ArrowDown size={12} />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(i)}>
                  <X size={12} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Label className="label-mono">Add a category</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="e.g. Mobile money, Swahili communication, Nursing fundamentals…"
            maxLength={60}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(newCat); } }}
          />
          <Button size="sm" onClick={() => add(newCat)} disabled={!newCat.trim() || draft.length >= 16}>
            <Plus size={12} className="mr-1.5" /> Add
          </Button>
        </div>
        {draft.length >= 16 && (
          <div className="text-[11px] text-warn mt-1">Limit of 16 categories reached.</div>
        )}
      </div>

      {allSuggestions.length > 0 && (
        <div>
          <div className="label-mono mb-2 inline-flex items-center gap-1.5">
            <Wand2 size={11} /> Suggestions for {countryCode ? countryCode.toUpperCase() : "your context"}
            {pathway.trim() && <span className="text-text-muted">· {pathway.trim()}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                disabled={draft.length >= 16}
                className="text-[11px] font-mono px-2 py-1 rounded-sm border border-border hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {countryCode && countrySuggestions.length === 0 && (
        <p className="text-[11px] text-text-muted">
          No country-specific suggestions yet for {countryCode.toUpperCase()} — add your own based on local industries.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" onClick={save} disabled={!dirty || busy || draft.length === 0}>
          {busy ? <Loader2 className="animate-spin" size={14} /> : <><Check size={12} className="mr-1.5" /> Save categories</>}
        </Button>
        {isCustom && (
          <Button size="sm" variant="outline" onClick={reset} disabled={busy}>
            <RotateCcw size={12} className="mr-1.5" /> Revert to defaults
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setDraft(current)} disabled={!dirty || busy}>
          Discard changes
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   LOCAL OPPORTUNITIES TAB — SDG ranking + Tavily search
   ============================================================ */

interface ProjectPrompt {
  title: string;
  summary: string;
  steps: string[];
  skills_built: string[];
  effort: "weekend" | "1-2 weeks" | "1 month" | "ongoing";
  evidence: string;
}

const DRAFT_KEY = "grow:portfolio-draft";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function LocalOpportunitiesTab({ countryCode, userId }: { countryCode: string | null; userId: string | null }) {
  const { toast } = useToast();
  const [country, setCountry] = useState(countryCode ?? "");
  const [city, setCity] = useState("");
  const [skill, setSkill] = useState("");
  const [loading, setLoading] = useState(false);
  const [ranked, setRanked] = useState<SdgRanked[] | null>(null);
  const [activeSdg, setActiveSdg] = useState<SdgRanked | null>(null);
  const [tavily, setTavily] = useState<{ answer?: string; results?: { title: string; url: string; content: string }[] } | null>(null);
  const [searching, setSearching] = useState(false);
  // SDG issue filter for the local opportunity search panel
  const [issueFilter, setIssueFilter] = useState<string>("all");
  // Project-prompt generation state
  const [promptSdg, setPromptSdg] = useState<SdgRanked | null>(null);
  const [generating, setGenerating] = useState(false);
  const [prompts, setPrompts] = useState<ProjectPrompt[] | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  // Opportunity Match panel state
  const [signals, setSignals] = useState<{ skillGaps: string[]; strengths: string[] } | null>(null);

  /** Pull the user's strongest signals + weakest signals to ground the AI in real data. */
  async function fetchUserSignals(): Promise<{ skillGaps: string[]; strengths: string[] }> {
    if (!userId) return { skillGaps: skill ? [skill] : [], strengths: [] };
    const [{ data: ratings }, { data: attempts }] = await Promise.all([
      supabase.from("user_skill_ratings").select("category, rating").eq("user_id", userId),
      supabase.from("aptitude_attempts")
        .select("category, level, score, total, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    ]);

    const gapSet = new Set<string>();
    const strengthSet = new Set<string>();
    (ratings ?? []).forEach((r) => {
      if (r.rating != null && r.rating <= 2) gapSet.add(r.category);
      if (r.rating != null && r.rating >= 4) strengthSet.add(r.category);
    });
    // best aptitude per category
    const bestByCat: Record<string, string> = {};
    (attempts ?? []).forEach((a) => {
      if (!bestByCat[a.category]) bestByCat[a.category] = a.level;
    });
    Object.entries(bestByCat).forEach(([cat, lvl]) => {
      if (lvl === "Novice") gapSet.add(cat);
      if (lvl === "Advanced") strengthSet.add(cat);
    });
    if (skill.trim()) gapSet.add(skill.trim());
    return { skillGaps: Array.from(gapSet).slice(0, 8), strengths: Array.from(strengthSet).slice(0, 8) };
  }

  async function loadRanked() {
    if (!country.trim()) { toast({ title: "Country code required", variant: "destructive" }); return; }
    setLoading(true);
    const [{ data, error }, sig] = await Promise.all([
      supabase.functions.invoke("local-opportunities", {
        body: { countryCode: country.trim().toUpperCase() },
      }),
      fetchUserSignals(),
    ]);
    setLoading(false);
    if (error) { toast({ title: "Failed to rank SDGs", description: error.message, variant: "destructive" }); return; }
    setRanked((data as { ranked: SdgRanked[] }).ranked);
    setSignals(sig);
  }

  async function searchSdg(sdg: SdgRanked) {
    setActiveSdg(sdg); setSearching(true); setTavily(null);
    const { data, error } = await supabase.functions.invoke("local-opportunities", {
      body: {
        countryCode: country.trim().toUpperCase(),
        countryName: country, city, skillFocus: skill,
        sdgNumber: sdg.n, sdgTitle: sdg.title, search: true,
      },
    });
    setSearching(false);
    if (error) { toast({ title: "Search failed", description: error.message, variant: "destructive" }); return; }
    const t = (data as { tavily?: { answer?: string; results?: { title: string; url: string; content: string }[] } }).tavily ?? null;
    setTavily(t);
  }

  async function generatePrompts(sdg: SdgRanked) {
    setPromptSdg(sdg); setGenerating(true); setPrompts(null); setPromptError(null);
    const { skillGaps, strengths } = await fetchUserSignals();
    const { data, error } = await supabase.functions.invoke("local-opportunities", {
      body: {
        mode: "prompts",
        countryCode: country.trim().toUpperCase(),
        countryName: country, city,
        sdgNumber: sdg.n, sdgTitle: sdg.title,
        skillGaps, strengths,
      },
    });
    setGenerating(false);
    if (error) {
      setPromptError(error.message);
      toast({ title: "Couldn't generate ideas", description: error.message, variant: "destructive" });
      return;
    }
    const payload = data as { prompts?: ProjectPrompt[]; error?: string };
    if (payload.error) { setPromptError(payload.error); return; }
    setPrompts(payload.prompts ?? []);
  }

  function addToPortfolio(p: ProjectPrompt) {
    if (!promptSdg) return;
    const description = `${p.summary}\n\nSteps:\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nEvidence to capture: ${p.evidence}`;
    const draft = {
      title: p.title,
      description,
      sdg_number: promptSdg.n,
      skill_focus: p.skills_built[0] ?? skill ?? "",
      skill_tags: p.skills_built,
      status: "planned" as const,
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("grow:portfolio-draft"));
    toast({ title: "Added to portfolio", description: "Switch to My Portfolio to refine and save." });
  }

  /** Persist a local-opportunity search snapshot for later review. */
  async function saveSearch(sdg: SdgRanked) {
    if (!userId) { toast({ title: "Sign in to save searches", variant: "destructive" }); return; }
    const label = `SDG ${sdg.n} · ${sdg.title}${city ? ` — ${city}` : ""}${country ? `, ${country.toUpperCase()}` : ""}`;
    const { error } = await supabase.from("saved_grow_items").insert({
      user_id: userId, kind: "search", label,
      country_code: country.trim().toUpperCase() || null,
      city: city || null, skill_focus: skill || null,
      sdg_number: sdg.n, sdg_title: sdg.title,
      payload: {
        tavily_answer: tavily?.answer ?? null,
        results: tavily?.results?.slice(0, 10) ?? [],
      },
    });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Search saved", description: "Find it under the Saved tab." });
  }

  /** Persist an AI project recommendation. */
  async function saveRecommendation(p: ProjectPrompt, sdg: SdgRanked) {
    if (!userId) { toast({ title: "Sign in to save recommendations", variant: "destructive" }); return; }
    const { error } = await supabase.from("saved_grow_items").insert({
      user_id: userId, kind: "recommendation", label: p.title,
      country_code: country.trim().toUpperCase() || null,
      city: city || null,
      skill_focus: p.skills_built[0] ?? skill ?? null,
      sdg_number: sdg.n, sdg_title: sdg.title,
      gap_area: p.skills_built[0] ?? null,
      recommendation: p.summary,
      payload: { steps: p.steps, skills_built: p.skills_built, effort: p.effort, evidence: p.evidence },
    });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Recommendation saved" });
  }

  /** Persist an Opportunity Match SDG with its "why it fits" reasons. */
  async function saveMatch(sdg: SdgRanked, fitScore: number, reasons: string[]) {
    if (!userId) { toast({ title: "Sign in to save matches", variant: "destructive" }); return; }
    const { error } = await supabase.from("saved_grow_items").insert({
      user_id: userId, kind: "recommendation",
      label: `SDG ${sdg.n} · ${sdg.title}`,
      country_code: country.trim().toUpperCase() || null,
      city: city || null, skill_focus: skill || null,
      sdg_number: sdg.n, sdg_title: sdg.title,
      recommendation: reasons.join(" · "),
      payload: { fit_score: fitScore, reasons, kind: "opportunity_match" },
    });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Match saved" });
  }

  // ---- Opportunity Match: rank SDGs by relevance to the user's gaps ----
  const matches = useMemo(() => {
    if (!ranked || !signals) return null;
    const gaps = signals.skillGaps.map((g) => g.toLowerCase());
    const strengths = signals.strengths.map((s) => s.toLowerCase());
    if (gaps.length === 0) return [];

    // Hand-tuned: which gap categories naturally line up with which SDGs.
    // Keys are lower-cased substrings of the user's gap labels.
    const SDG_GAP_AFFINITY: Record<number, string[]> = {
      1: ["finance", "business", "entrepreneur", "economic"],
      2: ["agriculture", "food", "science", "biology", "nature"],
      3: ["health", "biology", "science", "care", "psychology"],
      4: ["education", "teaching", "communication", "writing", "general knowledge"],
      5: ["communication", "leadership", "advocacy", "policy"],
      6: ["engineering", "science", "geography", "environment"],
      7: ["energy", "engineering", "science", "computers", "mathematics"],
      8: ["business", "data", "computers", "mathematics", "finance", "communication"],
      9: ["computers", "engineering", "mathematics", "design", "innovation", "data"],
      10: ["policy", "communication", "advocacy", "data", "research"],
      11: ["geography", "design", "urban", "art", "community"],
      12: ["data", "research", "science", "supply chain"],
      13: ["science", "data", "geography", "climate", "engineering"],
      14: ["science", "biology", "nature", "geography"],
      15: ["science", "biology", "nature", "geography", "art"],
      16: ["history", "communication", "law", "policy", "writing"],
      17: ["communication", "leadership", "partnerships", "general knowledge"],
    };

    return ranked
      .map((sdg) => {
        const affinity = SDG_GAP_AFFINITY[sdg.n] ?? [];
        const matchedGaps = gaps.filter((g) =>
          affinity.some((a) => g.includes(a) || a.includes(g)) ||
          sdg.tags.some((t) => g.includes(t.toLowerCase()) || t.toLowerCase().includes(g)),
        );
        const matchedStrengths = strengths.filter((s) =>
          affinity.some((a) => s.includes(a) || a.includes(s)),
        );
        // Final score: 60% country priority, 40% gap-fit (capped at 3 gaps)
        const gapFit = Math.min(matchedGaps.length, 3) / 3;
        const fitScore = sdg.priority * 0.6 + gapFit * 0.4;
        // "Why" explanation
        const reasons: string[] = [];
        if (matchedGaps.length > 0) {
          reasons.push(`Builds your gap area${matchedGaps.length > 1 ? "s" : ""}: ${matchedGaps.slice(0, 3).join(", ")}`);
        }
        if (sdg.priority >= 0.6) {
          reasons.push(`High local need in ${country.toUpperCase()} (priority ${Math.round(sdg.priority * 100)})`);
        } else if (sdg.priority >= 0.45) {
          reasons.push(`Moderate local need in ${country.toUpperCase()}`);
        }
        if (matchedStrengths.length > 0) {
          reasons.push(`Leverages your strength${matchedStrengths.length > 1 ? "s" : ""} in ${matchedStrengths.slice(0, 2).join(", ")}`);
        }
        return { sdg, fitScore, matchedGaps, matchedStrengths, reasons };
      })
      .filter((m) => m.matchedGaps.length > 0)
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 4);
  }, [ranked, signals, country]);

  return (
    <div className="space-y-6">
      <div className="surface-elevated p-5">
        <div className="label-mono mb-2">Local context</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label className="label-mono">Country code (ISO-3)</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={3} placeholder="KEN" />
          </div>
          <div>
            <Label className="label-mono">City (optional)</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="Nairobi" />
          </div>
          <div>
            <Label className="label-mono">Skill focus (optional)</Label>
            <Input value={skill} onChange={(e) => setSkill(e.target.value)} maxLength={80} placeholder="data, agriculture, …" />
          </div>
        </div>
        <Button className="mt-4" onClick={loadRanked} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={14} /> : "Rank UN SDGs for this country"}
        </Button>
      </div>

      {ranked && signals && matches !== null && (
        <div className="surface-elevated p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="label-mono inline-flex items-center gap-1.5">
                <Target size={11} /> Opportunity match
              </div>
              <h2 className="font-display text-xl text-text mt-1">
                Top {matches.length || 0} SDG{matches.length === 1 ? "" : "s"} that fit your gap areas
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Combines {country.toUpperCase()} local priority with affinity to your skill gaps
                {signals.skillGaps.length > 0 && <> ({signals.skillGaps.slice(0, 4).join(", ")}{signals.skillGaps.length > 4 ? "…" : ""})</>}.
              </p>
            </div>
          </div>

          {signals.skillGaps.length === 0 && (
            <div className="surface2 p-3 rounded-sm text-sm text-text-muted">
              Add some self-ratings or take an aptitude test in <em>Strengths &amp; gaps</em> to see personalized matches.
            </div>
          )}

          {signals.skillGaps.length > 0 && matches.length === 0 && (
            <div className="surface2 p-3 rounded-sm text-sm text-text-muted">
              No strong matches yet. Try broadening your gap categories or rank a different country.
            </div>
          )}

          {matches.length > 0 && (
            <div className="grid md:grid-cols-2 gap-3">
              {matches.map(({ sdg, fitScore, reasons }) => (
                <div key={sdg.n} className="surface2 p-4 rounded-sm flex flex-col border-l-2 border-accent">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="label-mono">SDG {sdg.n}</div>
                      <div className="font-display text-base text-text">{sdg.title}</div>
                    </div>
                    <div className="text-right">
                      <div className="data-num text-2xl text-accent leading-none">{Math.round(fitScore * 100)}</div>
                      <div className="text-[10px] font-mono text-text-muted">fit</div>
                    </div>
                  </div>
                  {reasons.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {reasons.map((r, i) => (
                        <li key={i} className="text-xs text-text-muted flex items-start gap-1.5">
                          <Check size={11} className="text-accent mt-0.5 shrink-0" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => searchSdg(sdg)}>
                      <Search size={12} className="mr-1.5" /> Find local projects
                    </Button>
                    <Button size="sm" onClick={() => generatePrompts(sdg)}>
                      <Sparkles size={12} className="mr-1.5" /> Generate ideas
                    </Button>
                    {(() => {
                      const m = (matches ?? []).find((x) => x.sdg.n === sdg.n);
                      return (
                        <Button size="sm" variant="ghost" onClick={() => saveMatch(sdg, m?.fitScore ?? sdg.priority, m?.reasons ?? [])}>
                          <BookmarkPlus size={12} className="mr-1.5" /> Save
                        </Button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ranked && (
        <div className="surface-elevated p-5">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <div className="label-mono inline-flex items-center gap-1.5">
                <Search size={11} /> Local opportunity search
              </div>
              <h2 className="font-display text-xl text-text mt-1">
                Filter by SDG issue {country && <span className="text-text-muted text-sm font-sans">· {country.toUpperCase()}</span>}
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Pick an SDG to scope the list and pull live community projects from {country ? country.toUpperCase() : "the selected country"}.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={issueFilter}
                onValueChange={(v) => {
                  setIssueFilter(v);
                  if (v !== "all") {
                    const sdg = ranked.find((s) => String(s.n) === v);
                    if (sdg) searchSdg(sdg);
                  }
                }}
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="All SDG issues" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All SDG issues</SelectItem>
                  {ranked.map((s) => (
                    <SelectItem key={s.n} value={String(s.n)}>SDG {s.n} · {s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {issueFilter !== "all" && (
                <Button size="sm" variant="ghost" onClick={() => { setIssueFilter("all"); setActiveSdg(null); setTavily(null); }}>
                  <X size={12} className="mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {ranked
              .filter((sdg) => issueFilter === "all" || String(sdg.n) === issueFilter)
              .map((sdg) => (
            <div key={sdg.n} className="surface p-4 rounded-sm flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="label-mono">SDG {sdg.n}</div>
                  <div className="font-display text-lg text-text">{sdg.title}</div>
                </div>
                <div className="data-num text-2xl text-accent">{Math.round(sdg.priority * 100)}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {sdg.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => searchSdg(sdg)}>
                  <Search size={12} className="mr-1.5" /> Find local projects
                </Button>
                <Button size="sm" onClick={() => generatePrompts(sdg)}>
                  <Sparkles size={12} className="mr-1.5" /> Generate project ideas
                </Button>
              </div>
            </div>
          ))}
          </div>
          {ranked.filter((sdg) => issueFilter === "all" || String(sdg.n) === issueFilter).length === 0 && (
            <div className="surface2 p-3 rounded-sm text-sm text-text-muted">No SDGs match this filter.</div>
          )}
        </div>
      )}

      {activeSdg && (
        <div className="surface-elevated p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="label-mono">Search results · SDG {activeSdg.n}</div>
              <div className="font-display text-lg text-text">{activeSdg.title}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => saveSearch(activeSdg)} disabled={searching}>
                <BookmarkPlus size={12} className="mr-1.5" /> Save search
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setActiveSdg(null); setTavily(null); }}>
                <X size={14} />
              </Button>
            </div>
          </div>
          {searching && <div className="text-text-muted text-sm flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> Searching the web…</div>}
          {tavily?.answer && (
            <div className="surface2 p-3 rounded-sm text-sm text-text-muted mb-3">{tavily.answer}</div>
          )}
          {tavily?.results && tavily.results.length > 0 && (
            <ul className="space-y-3">
              {tavily.results.map((r) => (
                <li key={r.url} className="border-l-2 border-accent pl-3">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-sm text-text hover:underline inline-flex items-center gap-1">
                    {r.title} <ExternalLink size={11} />
                  </a>
                  <div className="text-xs text-text-muted mt-1 line-clamp-3">{r.content}</div>
                </li>
              ))}
            </ul>
          )}
          {!searching && tavily && !tavily.results?.length && (
            <div className="text-text-muted text-sm">No results found — try a city or different skill focus.</div>
          )}
        </div>
      )}

      {promptSdg && (
        <div className="surface-elevated p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="label-mono">Project ideas · SDG {promptSdg.n}</div>
              <div className="font-display text-lg text-text">{promptSdg.title}</div>
              <p className="text-xs text-text-muted mt-1">
                Briefs grounded in {country.toUpperCase()} World Bank indicators and your skill gaps.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setPromptSdg(null); setPrompts(null); setPromptError(null); }}>
              <X size={14} />
            </Button>
          </div>

          {generating && (
            <div className="text-text-muted text-sm flex items-center gap-2">
              <Loader2 className="animate-spin" size={14} /> Drafting project briefs…
            </div>
          )}

          {promptError && !generating && (
            <div className="surface2 p-3 rounded-sm text-sm text-warn">{promptError}</div>
          )}

          {prompts && prompts.length > 0 && (
            <div className="grid md:grid-cols-2 gap-3">
              {prompts.map((p, i) => (
                <div key={i} className="surface2 p-4 rounded-sm flex flex-col">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className="text-[10px]">{p.effort}</Badge>
                    <Badge variant="outline" className="text-[10px]">SDG {promptSdg.n}</Badge>
                  </div>
                  <div className="font-display text-base text-text">{p.title}</div>
                  <p className="text-sm text-text-muted mt-1">{p.summary}</p>
                  {p.steps?.length > 0 && (
                    <ol className="mt-2 space-y-1 text-xs text-text list-decimal pl-4">
                      {p.steps.map((s, j) => <li key={j}>{s}</li>)}
                    </ol>
                  )}
                  {p.skills_built?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.skills_built.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] font-mono text-text-muted">
                    <span className="label-mono">Sources</span> · {p.evidence}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => addToPortfolio(p)}>
                      <Plus size={12} className="mr-1.5" /> Add to portfolio
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => promptSdg && saveRecommendation(p, promptSdg)}>
                      <BookmarkPlus size={12} className="mr-1.5" /> Save
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!generating && prompts && prompts.length === 0 && !promptError && (
            <div className="text-text-muted text-sm">No briefs generated. Try again.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PORTFOLIO TAB — CRUD + evidence file uploads
   ============================================================ */

interface PortfolioDraft {
  title: string;
  description: string;
  sdg_number: number | null;
  skill_focus: string;
  skill_tags: string[];
  status: PortfolioRow["status"];
}

export function PortfolioTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PortfolioRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PortfolioDraft | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("portfolio_projects")
      .select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load portfolio", description: error.message, variant: "destructive" });
    setItems((data ?? []) as PortfolioRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId]);

  // Pull a queued draft (from the Local opportunities tab) and open the form prefilled
  useEffect(() => {
    function consumeDraft() {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw) as PortfolioDraft;
        localStorage.removeItem(DRAFT_KEY);
        setDraft(d);
        setCreating(true);
        setEditing(null);
      } catch { /* ignore */ }
    }
    consumeDraft();
    window.addEventListener("grow:portfolio-draft", consumeDraft);
    return () => window.removeEventListener("grow:portfolio-draft", consumeDraft);
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this project?")) return;
    const item = items.find((i) => i.id === id);
    if (item?.evidence_paths?.length) {
      await supabase.storage.from("portfolio-evidence").remove(item.evidence_paths);
    }
    const { error } = await supabase.from("portfolio_projects").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    load();
  }

  if (loading) return <div className="text-text-muted text-sm flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <div className="label-mono">{items.length} project{items.length === 1 ? "" : "s"}</div>
          <h2 className="font-display text-xl text-text">Portfolio of community projects</h2>
        </div>
        <Button onClick={() => { setCreating(true); setEditing(null); setDraft(null); }}>
          <Plus size={14} className="mr-1.5" /> New project
        </Button>
      </div>

      {(creating || editing) && (
        <PortfolioForm
          userId={userId}
          initial={editing}
          prefill={editing ? null : draft}
          onCancel={() => { setCreating(false); setEditing(null); setDraft(null); }}
          onSaved={() => { setCreating(false); setEditing(null); setDraft(null); load(); }}
        />
      )}

      {items.length === 0 && !creating ? (
        <div className="surface p-8 text-center text-text-muted text-sm">
          No projects yet. Hit <em>New project</em> to log your first SDG-aligned initiative.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((p) => (
            <div key={p.id} className="surface-elevated p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {p.sdg_number && <Badge variant="outline">SDG {p.sdg_number}</Badge>}
                  <Badge variant={p.status === "done" ? "default" : p.status === "in_progress" ? "secondary" : "outline"}>
                    {p.status.replace("_", " ")}
                  </Badge>
                  {p.skill_focus && <span className="text-xs font-mono text-text-muted">{p.skill_focus}</span>}
                  {p.is_public && (
                    <Badge variant="secondary" className="text-[10px] inline-flex items-center gap-1">
                      <Globe size={10} /> shared
                    </Badge>
                  )}
                </div>
                <div className="font-display text-lg text-text mt-1">{p.title}</div>
                {p.description && <p className="text-sm text-text-muted mt-1 line-clamp-3">{p.description}</p>}
                {p.skill_tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.skill_tags.slice(0, 8).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                    {p.skill_tags.length > 8 && (
                      <span className="text-[10px] font-mono text-text-muted">+{p.skill_tags.length - 8}</span>
                    )}
                  </div>
                )}
                <div className="text-xs font-mono text-text-muted mt-2 flex flex-wrap gap-3">
                  {p.started_on && <span>Started {p.started_on}</span>}
                  {p.completed_on && <span>Done {p.completed_on}</span>}
                  {p.external_link && (
                    <a href={p.external_link} target="_blank" rel="noreferrer" className="hover:text-text inline-flex items-center gap-1">
                      Link <ExternalLink size={10} />
                    </a>
                  )}
                  {p.evidence_paths.length > 0 && <span>{p.evidence_paths.length} file(s)</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                <ShareButton project={p} onChange={load} />
                <Button size="sm" variant="outline" onClick={() => { setEditing(p); setCreating(false); }}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)} aria-label="Delete">
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Share / Unshare with copy-link */
function ShareButton({ project, onChange }: { project: PortfolioRow; onChange: () => void; }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = project.share_slug
    ? `${window.location.origin}/share/portfolio/${project.share_slug}`
    : null;

  async function toggle() {
    setBusy(true);
    const { error } = await supabase
      .from("portfolio_projects")
      .update({ is_public: !project.is_public })
      .eq("id", project.id);
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't update sharing", description: error.message, variant: "destructive" });
      return;
    }
    if (!project.is_public && shareUrl) {
      try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
      toast({ title: "Project shared", description: "Public link copied to clipboard." });
    } else {
      toast({ title: "Sharing disabled", description: "Link no longer works." });
    }
    onChange();
  }

  async function copyLink() {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  if (project.is_public) {
    return (
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" onClick={copyLink} title={shareUrl ?? ""}>
          {copied ? <Check size={13} className="mr-1" /> : <Copy size={13} className="mr-1" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button size="sm" variant="ghost" onClick={toggle} disabled={busy} aria-label="Make private">
          {busy ? <Loader2 className="animate-spin" size={13} /> : <Lock size={13} />}
        </Button>
      </div>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={busy}>
      {busy ? <Loader2 className="animate-spin mr-1" size={13} /> : <Share2 className="mr-1" size={13} />}
      Share
    </Button>
  );
}

function PortfolioForm({ userId, initial, prefill, onCancel, onSaved }: {
  userId: string;
  initial: PortfolioRow | null;
  prefill?: PortfolioDraft | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? prefill?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? prefill?.description ?? "");
  const [sdg, setSdg] = useState<string>(
    initial?.sdg_number ? String(initial.sdg_number)
      : prefill?.sdg_number ? String(prefill.sdg_number) : "",
  );
  const [skillFocus, setSkillFocus] = useState(initial?.skill_focus ?? prefill?.skill_focus ?? "");
  const [status, setStatus] = useState<PortfolioRow["status"]>(initial?.status ?? prefill?.status ?? "planned");
  const [startedOn, setStartedOn] = useState(initial?.started_on ?? "");
  const [completedOn, setCompletedOn] = useState(initial?.completed_on ?? "");
  const [externalLink, setExternalLink] = useState(initial?.external_link ?? "");
  const [reflection, setReflection] = useState(initial?.reflection ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [existingPaths, setExistingPaths] = useState<string[]>(initial?.evidence_paths ?? []);
  const [skillTags, setSkillTags] = useState<string[]>(initial?.skill_tags ?? prefill?.skill_tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB per file
  const MAX_FILES = 10;
  const ACCEPTED_HINT = "PDF, image, doc, video, code — up to 20MB each, 10 files max";

  // Pull skills from the user's mapping (ESCO + assessed) for one-click tagging
  const mappedSkills = useAppStore((s) => s.activeProfile?.esco_skills ?? []);
  const assessments = useAppStore((s) => s.assessments);
  const formSkills = useAppStore((s) => s.form.skills);
  const skillSuggestions = useMemo(() => {
    const set = new Set<string>();
    mappedSkills.forEach((s) => s.label && set.add(s.label));
    assessments.forEach((a) => a.skill && set.add(a.skill));
    formSkills.forEach((s) => s && set.add(s));
    skillTags.forEach((s) => set.delete(s));
    return Array.from(set).slice(0, 30);
  }, [mappedSkills, assessments, formSkills, skillTags]);

  function addTag(label: string) {
    const v = label.trim();
    if (!v) return;
    if (skillTags.includes(v)) return;
    setSkillTags((p) => [...p, v]);
    setTagInput("");
  }
  function removeTag(label: string) {
    setSkillTags((p) => p.filter((s) => s !== label));
  }

  async function uploadFiles(): Promise<string[]> {
    const uploaded: string[] = [];
    for (const f of files) {
      const safe = f.name.replace(/[^\w.\-]+/g, "_");
      const path = `${userId}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from("portfolio-evidence").upload(path, f, { upsert: false });
      if (error) throw new Error(`Upload failed for ${f.name}: ${error.message}`);
      uploaded.push(path);
    }
    return uploaded;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const newPaths = files.length ? await uploadFiles() : [];
      const payload = {
        user_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        sdg_number: sdg ? Number(sdg) : null,
        skill_focus: skillFocus.trim() || null,
        status,
        started_on: startedOn || null,
        completed_on: completedOn || null,
        external_link: externalLink.trim() || null,
        reflection: reflection.trim() || null,
        evidence_paths: [...existingPaths, ...newPaths],
        skill_tags: skillTags,
      };
      const { error } = initial
        ? await supabase.from("portfolio_projects").update(payload).eq("id", initial.id)
        : await supabase.from("portfolio_projects").insert(payload);
      if (error) throw error;
      toast({ title: initial ? "Project updated" : "Project added" });
      onSaved();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function removeExistingFile(path: string) {
    await supabase.storage.from("portfolio-evidence").remove([path]);
    setExistingPaths((p) => p.filter((x) => x !== path));
  }

  /** Validate, dedupe, and append files to the queue. */
  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return;
    const arr = Array.from(incoming);
    const existingTotal = files.length + existingPaths.length;
    const remainingSlots = Math.max(0, MAX_FILES - existingTotal);
    if (remainingSlots <= 0) {
      toast({ title: "File limit reached", description: `Max ${MAX_FILES} files per project.`, variant: "destructive" });
      return;
    }
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of arr.slice(0, remainingSlots)) {
      if (f.size > MAX_FILE_BYTES) {
        rejected.push(`${f.name} (${formatBytes(f.size)})`);
        continue;
      }
      // Skip duplicates by name+size
      if (files.some((x) => x.name === f.name && x.size === f.size)) continue;
      accepted.push(f);
    }
    if (accepted.length) setFiles((p) => [...p, ...accepted]);
    if (rejected.length) {
      toast({
        title: `Skipped ${rejected.length} oversized file${rejected.length > 1 ? "s" : ""}`,
        description: `Limit is 20MB. ${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? "…" : ""}`,
        variant: "destructive",
      });
    }
  }

  function removeQueued(idx: number) {
    setFiles((p) => p.filter((_, i) => i !== idx));
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <form onSubmit={onSubmit} className="surface-elevated p-5 space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="label-mono">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
        </div>
        <div>
          <Label className="label-mono">SDG</Label>
          <Select value={sdg} onValueChange={setSdg}>
            <SelectTrigger><SelectValue placeholder="Select SDG (optional)" /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 17 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>SDG {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="label-mono">Skill focus (gap you're closing)</Label>
          <Input value={skillFocus} onChange={(e) => setSkillFocus(e.target.value)} maxLength={120} placeholder="e.g. data analysis" />
        </div>
        <div>
          <Label className="label-mono">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as PortfolioRow["status"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="label-mono">Started on</Label>
          <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </div>
        <div>
          <Label className="label-mono">Completed on</Label>
          <Input type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} />
        </div>
      </div>

      <div>
        <Label className="label-mono">Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
      </div>
      <div>
        <Label className="label-mono">External link</Label>
        <Input value={externalLink} onChange={(e) => setExternalLink(e.target.value)} maxLength={500} placeholder="https://…" />
      </div>
      <div>
        <Label className="label-mono">Reflection / what you learned</Label>
        <Textarea value={reflection} onChange={(e) => setReflection(e.target.value)} rows={3} maxLength={2000} />
      </div>

      <div>
        <Label className="label-mono">Skills demonstrated</Label>
        <p className="text-[11px] text-text-muted mb-2">
          Tag the skills this project shows. Suggestions come from your skill mapping.
        </p>
        {skillTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {skillTags.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs inline-flex items-center gap-1 pr-1">
                {s}
                <button type="button" onClick={() => removeTag(s)} aria-label={`Remove ${s}`} className="hover:text-text">
                  <X size={10} />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
            placeholder="Add a custom skill and press Enter"
            maxLength={80}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => addTag(tagInput)}>Add</Button>
        </div>
        {skillSuggestions.length > 0 && (
          <div className="mt-2">
            <div className="label-mono mb-1">From your mapping</div>
            <div className="flex flex-wrap gap-1.5">
              {skillSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addTag(s)}
                  className="text-[11px] font-mono px-2 py-1 rounded-sm border border-border text-text-muted hover:text-text hover:border-accent transition-colors"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <Label className="label-mono">Source files</Label>
          <span className="text-[10px] font-mono text-text-muted">{ACCEPTED_HINT}</span>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); if (fileInput.current) fileInput.current.value = ""; }}
        />

        <div
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mt-1.5 cursor-pointer border-2 border-dashed rounded-sm p-5 text-center transition-colors ${
            dragOver ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"
          }`}
        >
          <Upload size={18} className="mx-auto mb-1.5 text-text-muted" />
          <div className="text-sm text-text">
            Drop files here or <span className="text-accent">browse</span>
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            Attach screenshots, PDFs, datasets, prototypes — anything that proves your work.
          </div>
        </div>

        {(files.length > 0 || existingPaths.length > 0) && (
          <ul className="mt-3 space-y-1.5">
            {existingPaths.map((p) => (
              <li key={p} className="flex items-center justify-between gap-2 text-xs surface2 px-2.5 py-1.5 rounded-sm">
                <span className="font-mono text-text truncate flex-1">📎 {p.split("/").pop()}</span>
                <Badge variant="outline" className="text-[10px]">saved</Badge>
                <button
                  type="button"
                  onClick={() => removeExistingFile(p)}
                  className="text-text-muted hover:text-warn"
                  aria-label="Remove saved file"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-xs surface2 px-2.5 py-1.5 rounded-sm">
                <span className="font-mono text-text truncate flex-1">📎 {f.name}</span>
                <span className="text-text-muted text-[10px] font-mono">{formatBytes(f.size)}</span>
                <Badge variant="secondary" className="text-[10px]">ready</Badge>
                <button
                  type="button"
                  onClick={() => removeQueued(i)}
                  className="text-text-muted hover:text-warn"
                  aria-label={`Remove ${f.name}`}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="text-[11px] font-mono text-text-muted mt-2">
          {files.length + existingPaths.length} / {MAX_FILES} files
          {files.length > 0 && (
            <> · {formatBytes(files.reduce((acc, f) => acc + f.size, 0))} pending upload</>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={14} /> : initial ? "Save changes" : "Create project"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/* ============================================================
   SAVED TAB — saved searches & upskilling recommendations
   ============================================================ */

interface SavedRow {
  id: string;
  kind: "search" | "recommendation";
  label: string;
  country_code: string | null;
  city: string | null;
  skill_focus: string | null;
  sdg_number: number | null;
  sdg_title: string | null;
  gap_area: string | null;
  recommendation: string | null;
  payload: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
}

export function SavedTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "search" | "recommendation">("all");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("saved_grow_items")
      .select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load saved items", description: error.message, variant: "destructive" });
    setItems((data ?? []) as unknown as SavedRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId]);

  async function remove(id: string) {
    if (!confirm("Remove this saved item?")) return;
    const { error } = await supabase.from("saved_grow_items").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  /** Convert a saved recommendation into a portfolio draft and route to My Portfolio (where evidence can be uploaded). */
  function addItemToPortfolio(item: SavedRow) {
    const steps = (item.payload as { steps?: string[] } | null)?.steps ?? [];
    const skillsBuilt = (item.payload as { skills_built?: string[] } | null)?.skills_built ?? [];
    const evidenceHint = (item.payload as { evidence?: string } | null)?.evidence;
    const reasons = (item.payload as { reasons?: string[] } | null)?.reasons ?? [];
    const parts: string[] = [];
    if (item.recommendation) parts.push(item.recommendation);
    if (steps.length) parts.push(`Steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
    if (reasons.length) parts.push(`Why this fits:\n${reasons.map((r) => `• ${r}`).join("\n")}`);
    if (evidenceHint) parts.push(`Evidence to capture: ${evidenceHint}`);
    const draft: PortfolioDraft = {
      title: item.label,
      description: parts.join("\n\n"),
      sdg_number: item.sdg_number ?? null,
      skill_focus: item.skill_focus ?? skillsBuilt[0] ?? "",
      skill_tags: skillsBuilt,
      status: "planned",
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("grow:portfolio-draft"));
    toast({ title: "Opened in My Portfolio", description: "Attach evidence files there to complete the project." });
  }

  if (loading) {
    return <div className="text-text-muted text-sm flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> Loading…</div>;
  }

  const visible = items.filter((i) => filter === "all" || i.kind === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="label-mono">{items.length} saved item{items.length === 1 ? "" : "s"}</div>
          <h2 className="font-display text-xl text-text">Your saved searches & recommendations</h2>
        </div>
        <div className="flex gap-1">
          {(["all", "search", "recommendation"] as const).map((k) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
              {k === "all" ? "All" : k === "search" ? "Searches" : "Recommendations"}
            </Button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="surface p-8 text-center text-text-muted text-sm">
          Nothing saved yet. Use the <BookmarkPlus size={12} className="inline -mt-0.5" /> Save buttons in
          {" "}<em>Local opportunities</em> to bookmark searches and recommendations for later review.
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((it) => <SavedItemCard key={it.id} item={it} onDelete={() => remove(it.id)} onAddToPortfolio={addItemToPortfolio} />)}
        </div>
      )}
    </div>
  );
}

function SavedItemCard({ item, onDelete, onAddToPortfolio }: { item: SavedRow; onDelete: () => void; onAddToPortfolio: (item: SavedRow) => void }) {
  const date = new Date(item.created_at).toLocaleDateString();
  const results = (item.payload as { results?: { title: string; url: string; content: string }[] } | null)?.results ?? [];
  const reasons = (item.payload as { reasons?: string[] } | null)?.reasons ?? [];
  const steps = (item.payload as { steps?: string[] } | null)?.steps ?? [];
  const skillsBuilt = (item.payload as { skills_built?: string[] } | null)?.skills_built ?? [];
  const effort = (item.payload as { effort?: string } | null)?.effort;
  const evidence = (item.payload as { evidence?: string } | null)?.evidence;
  const fitScore = (item.payload as { fit_score?: number } | null)?.fit_score;

  return (
    <div className="surface-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={item.kind === "search" ? "outline" : "secondary"} className="text-[10px] inline-flex items-center gap-1">
              <Bookmark size={10} /> {item.kind === "search" ? "Search" : "Recommendation"}
            </Badge>
            {item.sdg_number != null && <Badge variant="outline" className="text-[10px]">SDG {item.sdg_number}</Badge>}
            {item.country_code && <span className="text-[10px] font-mono text-text-muted">{item.country_code}{item.city ? ` · ${item.city}` : ""}</span>}
            {effort && <Badge variant="outline" className="text-[10px]">{effort}</Badge>}
            {fitScore != null && <span className="text-[10px] font-mono text-accent">fit {Math.round(fitScore * 100)}</span>}
            <span className="text-[10px] font-mono text-text-muted ml-auto">{date}</span>
          </div>
          <div className="font-display text-base text-text mt-1">{item.label}</div>
          {item.skill_focus && <div className="text-[11px] font-mono text-text-muted mt-0.5">skill focus · {item.skill_focus}</div>}
          {item.recommendation && <p className="text-sm text-text-muted mt-2">{item.recommendation}</p>}
          {reasons.length > 0 && (
            <ul className="mt-2 space-y-1">
              {reasons.map((r, i) => (
                <li key={i} className="text-xs text-text-muted flex items-start gap-1.5">
                  <Check size={11} className="text-accent mt-0.5 shrink-0" /><span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {steps.length > 0 && (
            <ol className="mt-2 space-y-1 text-xs text-text list-decimal pl-4">
              {steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {skillsBuilt.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skillsBuilt.map((s) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
            </div>
          )}
          {evidence && (
            <div className="mt-2 text-[11px] font-mono text-text-muted">
              <span className="label-mono">Sources</span> · {evidence}
            </div>
          )}
          {results.length > 0 && (
            <ul className="mt-3 space-y-2">
              {results.slice(0, 5).map((r) => (
                <li key={r.url} className="border-l-2 border-accent pl-3">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-sm text-text hover:underline inline-flex items-center gap-1">
                    {r.title} <ExternalLink size={11} />
                  </a>
                  <div className="text-xs text-text-muted mt-1 line-clamp-2">{r.content}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {item.kind === "recommendation" && (
            <Button size="sm" variant="outline" onClick={() => onAddToPortfolio(item)} title="Create a portfolio project from this recommendation and attach evidence">
              <Plus size={12} className="mr-1.5" /> Add to portfolio
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
