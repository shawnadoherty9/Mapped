import { useEffect, useMemo, useState } from "react";
import { History, Filter, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Level = "Novice" | "Developing" | "Proficient" | "Advanced";
const LEVEL_SCORE: Record<string, number> = { Novice: 1, Developing: 2, Proficient: 3, Advanced: 4 };

interface Attempt {
  id: string;
  category: string;
  level: Level;
  score: number;
  total: number;
  skill_input: string | null;
  country_code: string | null;
  created_at: string;
}

interface Rating {
  category: string;
  rating: number;
  country_code: string | null;
  updated_at: string;
}

/** Combined per-category signal (rating + best aptitude → 1–5 scale). */
function signalForCategory(rating?: number, bestApt?: Level): number | null {
  const aptScore = bestApt ? (LEVEL_SCORE[bestApt] / 4) * 5 : null;
  const parts = [rating, aptScore].filter((x): x is number => typeof x === "number");
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function AttemptRow({ a }: { a: Attempt }) {
  const cls =
    a.level === "Advanced" ? "bg-teal/15 text-teal" :
    a.level === "Proficient" ? "bg-brand/15 text-brand" :
    a.level === "Developing" ? "bg-warn/15 text-warn" :
    "bg-danger/15 text-danger";
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-3 font-mono text-xs text-text-muted">{new Date(a.created_at).toLocaleDateString()}</td>
      <td className="py-2 pr-3 text-text">{a.category}</td>
      <td className="py-2 pr-3 text-text-muted text-xs">{a.skill_input ?? "—"}</td>
      <td className="py-2 pr-3"><span className={`pill ${cls}`}>{a.level}</span></td>
      <td className="py-2 pr-3 font-mono text-xs">{a.score}/{a.total}</td>
      <td className="py-2 pr-0 font-mono text-xs text-text-muted">{a.country_code ?? "—"}</td>
    </tr>
  );
}

export default function AssessmentHistoryPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [countryFilter, setCountryFilter] = useState<string>("all");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: r }] = await Promise.all([
        supabase.from("aptitude_attempts")
          .select("id, category, level, score, total, skill_input, country_code, created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
        supabase.from("user_skill_ratings")
          .select("category, rating, country_code, updated_at")
          .eq("user_id", user.id),
      ]);
      if (cancelled) return;
      setAttempts((a as Attempt[] | null) ?? []);
      setRatings((r as Rating[] | null) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    attempts.forEach((a) => a.country_code && set.add(a.country_code));
    ratings.forEach((r) => r.country_code && set.add(r.country_code));
    return Array.from(set).sort();
  }, [attempts, ratings]);

  const filteredAttempts = useMemo(
    () => attempts.filter((a) => countryFilter === "all" || a.country_code === countryFilter),
    [attempts, countryFilter],
  );
  const filteredRatings = useMemo(
    () => ratings.filter((r) => countryFilter === "all" || r.country_code === countryFilter),
    [ratings, countryFilter],
  );

  /** Compare current vs first-known signal per category to detect movement. */
  const trends = useMemo(() => {
    type Snap = { rating?: number; bestApt?: Level };
    const earliest = new Map<string, Snap>();
    const latest = new Map<string, Snap>();

    // Walk attempts oldest → newest
    [...filteredAttempts].reverse().forEach((a) => {
      if (!earliest.has(a.category)) earliest.set(a.category, {});
      const e = earliest.get(a.category)!;
      if (!e.bestApt || LEVEL_SCORE[a.level] > LEVEL_SCORE[e.bestApt]) e.bestApt = a.level;
      const l = latest.get(a.category) ?? {};
      if (!l.bestApt || LEVEL_SCORE[a.level] >= LEVEL_SCORE[l.bestApt]) l.bestApt = a.level;
      latest.set(a.category, l);
    });
    // Latest takes the most recent attempt instead of the best so we can show movement
    filteredAttempts.forEach((a) => {
      const l = latest.get(a.category) ?? {};
      if (!l.bestApt) { l.bestApt = a.level; latest.set(a.category, l); }
    });
    // Ratings: only "latest" since we only store current value
    filteredRatings.forEach((r) => {
      const l = latest.get(r.category) ?? {};
      l.rating = r.rating;
      latest.set(r.category, l);
      if (!earliest.has(r.category)) earliest.set(r.category, { rating: r.rating });
    });

    const cats = Array.from(new Set([...earliest.keys(), ...latest.keys()]));
    return cats.map((cat) => {
      const e = signalForCategory(earliest.get(cat)?.rating, earliest.get(cat)?.bestApt);
      const n = signalForCategory(latest.get(cat)?.rating, latest.get(cat)?.bestApt);
      const delta = e != null && n != null ? n - e : null;
      const kind: "strength" | "gap" | "neutral" =
        n == null ? "neutral" : n >= 3.5 ? "strength" : n < 2.5 ? "gap" : "neutral";
      return { category: cat, earliest: e, latest: n, delta, kind };
    }).sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0));
  }, [filteredAttempts, filteredRatings]);

  if (!user?.id) return null;

  return (
    <div className="surface rounded-md p-5 mb-8" id="history">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <History size={14} className="text-brand" />
          <div className="label-mono">Assessment history · strengths & gaps over time</div>
        </div>
        {countries.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <Filter size={11} className="text-text-muted" />
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="bg-surface2 border border-border rounded-sm px-2 py-1 font-mono text-xs"
            >
              <option value="all">All countries</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="animate-spin" size={14} /> Loading history…
        </div>
      ) : attempts.length === 0 && ratings.length === 0 ? (
        <div className="surface2 p-4 rounded-sm text-sm text-text-muted">
          No history yet. Take an aptitude test or self-rate skills in <a href="/app/grow" className="text-brand underline">Grow</a> to start tracking.
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Trends per category */}
          <div className="surface2 p-4 rounded-sm">
            <div className="label-mono mb-3">Movement by category</div>
            {trends.length === 0 ? (
              <div className="text-xs text-text-muted">No data for this country.</div>
            ) : (
              <ul className="space-y-2">
                {trends.map((t) => {
                  const Icon = t.delta == null || Math.abs(t.delta) < 0.25 ? Minus
                    : t.delta > 0 ? TrendingUp : TrendingDown;
                  const cls = t.delta == null ? "text-text-muted"
                    : t.delta >= 0.25 ? "text-teal"
                    : t.delta <= -0.25 ? "text-danger" : "text-text-muted";
                  const dot = t.kind === "strength" ? "bg-teal" : t.kind === "gap" ? "bg-warn" : "bg-border-strong";
                  return (
                    <li key={t.category} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className={`w-2 h-2 rounded-full ${dot}`} />
                        <span className="text-text truncate">{t.category}</span>
                      </span>
                      <span className="flex items-center gap-2 font-mono text-xs text-text-muted shrink-0">
                        <span>{t.earliest != null ? t.earliest.toFixed(1) : "—"}</span>
                        <span>→</span>
                        <span className="text-text">{t.latest != null ? t.latest.toFixed(1) : "—"}</span>
                        <Icon size={12} className={cls} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 pt-3 border-t border-border text-[10px] font-mono text-text-muted">
              Scale 1–5 · combines self-rating and best aptitude · {countryFilter === "all" ? "all countries" : countryFilter}
            </div>
          </div>

          {/* Attempts log */}
          <div className="surface2 p-4 rounded-sm">
            <div className="label-mono mb-3">Past assessments ({filteredAttempts.length})</div>
            {filteredAttempts.length === 0 ? (
              <div className="text-xs text-text-muted">No assessments for this country yet.</div>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-surface2">
                    <tr className="text-left">
                      <th className="label-mono pb-2 pr-3">Date</th>
                      <th className="label-mono pb-2 pr-3">Category</th>
                      <th className="label-mono pb-2 pr-3">Skill</th>
                      <th className="label-mono pb-2 pr-3">Level</th>
                      <th className="label-mono pb-2 pr-3">Score</th>
                      <th className="label-mono pb-2">Country</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttempts.map((a) => <AttemptRow key={a.id} a={a} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
