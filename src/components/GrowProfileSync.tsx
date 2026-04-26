import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore, type ClaudeProfile } from "@/store/useAppStore";
import { iscoMajorGroups } from "@/data/freyOsborne";

/**
 * GrowProfileSync — synthesizes a lightweight `ClaudeProfile` from the user's
 * actual Grow data (self-rated skills + aptitude attempt history) and pushes
 * it into the global app store so the shared `<ResiliencySection />` and
 * `<RiskSection />` components have something concrete to render on the
 * Grow page (without requiring a full Profile-Input mapping).
 *
 * On unmount it restores whatever profile was previously active so it doesn't
 * pollute other pages.
 */

interface RatingRow { category: string; rating: number }
interface AptRow { category: string; level: "Novice" | "Proficient" | "Advanced"; score: number; total: number }

/** Heuristic: which ISCO major group a category most resembles, used to
 *  derive a per-user automation-risk baseline from the categories they're
 *  strongest in. Falls back to "general professional" risk when unsure. */
function categoryToIsco(cat: string): string {
  const s = cat.toLowerCase();
  if (/(software|cod|program|web|data|sql|comput|it|cloud|devops|ai|ml)/.test(s)) return "2"; // Professionals
  if (/(manage|lead|operations|business|entrepre)/.test(s)) return "1"; // Managers
  if (/(engineer|technician|account|lab|analyst|design|architect)/.test(s)) return "3"; // Associate prof
  if (/(clerk|admin|booking|secretar|reception|record)/.test(s)) return "4"; // Clerical
  if (/(sales|service|customer|nurs|care|hospitalit|tour|guest|bpo)/.test(s)) return "5"; // Services & sales
  if (/(agri|farm|crop|fish|forest)/.test(s)) return "6"; // Skilled agri
  if (/(craft|sew|tailor|repair|construct|electric|plumb|carpent|trade|weld|mechan)/.test(s)) return "7"; // Crafts & trades
  if (/(operator|driver|machin|plant|assembl|manufactur|logistic)/.test(s)) return "8"; // Plant operators
  if (/(labor|elementary|cleaning|delivery|porter)/.test(s)) return "9"; // Elementary
  return "2"; // default to "Professionals" — broad knowledge worker bucket
}

/** Tasks commonly displaced by automation in each ISCO major group, used to
 *  populate the "at-risk tasks" pills when a user has no formal profile. */
const AT_RISK_BY_ISCO: Record<string, string[]> = {
  "1": ["routine reporting", "scheduling coordination"],
  "2": ["boilerplate code", "first-draft writing", "basic data analysis"],
  "3": ["data entry", "standardized testing", "routine bookkeeping"],
  "4": ["filing & records", "form processing", "basic correspondence"],
  "5": ["scripted customer answers", "checkout & cashiering", "basic order intake"],
  "6": ["manual harvest sorting", "routine irrigation checks"],
  "7": ["repetitive assembly", "standard finishing work"],
  "8": ["routine machine monitoring", "simple driving routes"],
  "9": ["repetitive cleaning routes", "basic delivery sorting"],
};

interface Props { userId: string }

export default function GrowProfileSync({ userId }: Props) {
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);

  useEffect(() => {
    let cancelled = false;
    const previous = useAppStore.getState().activeProfile;

    (async () => {
      const [{ data: r }, { data: a }] = await Promise.all([
        supabase.from("user_skill_ratings").select("category, rating").eq("user_id", userId),
        supabase.from("aptitude_attempts")
          .select("category, level, score, total")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      ]);
      if (cancelled) return;

      const ratings = (r ?? []) as RatingRow[];
      const attempts = (a ?? []) as AptRow[];

      // Strengths = self-rating ≥ 4 OR most-recent aptitude == Advanced/Proficient
      const bestApt = new Map<string, AptRow>();
      attempts.forEach((row) => { if (!bestApt.has(row.category)) bestApt.set(row.category, row); });

      const strongCategories = new Set<string>();
      const weakCategories = new Set<string>();
      ratings.forEach((row) => {
        if (row.rating >= 4) strongCategories.add(row.category);
        else if (row.rating > 0 && row.rating < 3) weakCategories.add(row.category);
      });
      bestApt.forEach((row, cat) => {
        if (row.level === "Advanced") strongCategories.add(cat);
        if (row.level === "Novice" && row.total > 0) weakCategories.add(cat);
      });

      // Build durable & adjacent skill lists
      const durable_skills = Array.from(strongCategories);
      const adjacent_skills = Array.from(weakCategories).slice(0, 8);

      // ISCO mapping → weighted average automation risk across user's strongest categories
      const targetIscos = (durable_skills.length > 0 ? durable_skills : ratings.map((r) => r.category))
        .map(categoryToIsco);
      const iscoMap = new Map(iscoMajorGroups.map((g) => [g.code, g]));
      const baseRisks = targetIscos
        .map((c) => iscoMap.get(c)?.base_risk)
        .filter((v): v is number => typeof v === "number");
      const automation_risk_raw = baseRisks.length > 0
        ? baseRisks.reduce((s, x) => s + x, 0) / baseRisks.length
        : 0.45; // sensible mid-band fallback

      // At-risk tasks: union of tasks for the dominant ISCO groups touched
      const at_risk_tasks = Array.from(new Set(targetIscos.flatMap((c) => AT_RISK_BY_ISCO[c] ?? []))).slice(0, 8);

      // Risk level bands
      const risk_level: ClaudeProfile["risk_level"] =
        automation_risk_raw < 0.3 ? "low" : automation_risk_raw < 0.55 ? "moderate" : "high";

      // ISCO matches list (top 3 distinct)
      const iscoCounts = new Map<string, number>();
      targetIscos.forEach((c) => iscoCounts.set(c, (iscoCounts.get(c) ?? 0) + 1));
      const totalIsco = Array.from(iscoCounts.values()).reduce((s, x) => s + x, 0) || 1;
      const isco_matches = Array.from(iscoCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([code, cnt]) => ({
          code,
          label: iscoMap.get(code)?.label ?? code,
          confidence: Math.round((cnt / totalIsco) * 100) / 100,
        }));

      const synth: ClaudeProfile = {
        plain_summary:
          durable_skills.length > 0
            ? `Synthesized from ${ratings.length} self-ratings and ${attempts.length} aptitude attempts.`
            : `Take a few aptitude tests or self-rate your skills above to personalize this view.`,
        isco_matches,
        esco_skills: durable_skills.map((label) => ({ label, type: "demonstrated" as const })),
        automation_risk_raw,
        durable_skills,
        at_risk_tasks,
        adjacent_skills,
        opportunities: [], // intentionally empty — Grow page focuses on skills, not job listings
        risk_level,
      };

      setActiveProfile(synth);
    })();

    return () => {
      cancelled = true;
      // Restore prior profile so other pages aren't affected
      setActiveProfile(previous);
    };
  }, [userId, setActiveProfile]);

  return null;
}
