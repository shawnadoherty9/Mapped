import { useMemo } from "react";
import { Sparkles, Shield, AlertTriangle, Compass } from "lucide-react";
import { iscoMajorGroups } from "@/data/freyOsborne";
import type { ClaudeProfile } from "@/store/useAppStore";

/**
 * SkillMapDashboard
 * Combined visual aggregation of the user's Profile + Grow data on the
 * Skills Signal page. Three sections in one card:
 *   1. Skill radar — self-rated categories overlaid with aptitude verification
 *   2. ISCO occupational fit — confidence × Frey-Osborne automation risk
 *   3. Strengths / Adjacent / At-risk clusters — durable skills, growth edges, displaceable tasks
 */

interface GrowRating { category: string; rating: number }
interface GrowAptitude { category: string; level: "Novice" | "Proficient" | "Advanced" | string; skill_input: string | null }

interface Props {
  /** Optional — when null we derive the entire view from Grow data alone. */
  profile: ClaudeProfile | null;
  ratings: GrowRating[];
  attempts: GrowAptitude[];
}

/** Heuristic: which ISCO major group a category most resembles. Mirrors
 *  the mapping used in GrowProfileSync so the dashboard agrees with
 *  Resiliency / Risk views even before the AI mapping has been run. */
function categoryToIsco(cat: string): string {
  const s = cat.toLowerCase();
  if (/(software|cod|program|web|data|sql|comput|it|cloud|devops|ai|ml)/.test(s)) return "2";
  if (/(manage|lead|operations|business|entrepre)/.test(s)) return "1";
  if (/(engineer|technician|account|lab|analyst|design|architect)/.test(s)) return "3";
  if (/(clerk|admin|booking|secretar|reception|record)/.test(s)) return "4";
  if (/(sales|service|customer|nurs|care|hospitalit|tour|guest|bpo)/.test(s)) return "5";
  if (/(agri|farm|crop|fish|forest)/.test(s)) return "6";
  if (/(craft|sew|tailor|repair|construct|electric|plumb|carpent|trade|weld|mechan)/.test(s)) return "7";
  if (/(operator|driver|machin|plant|assembl|manufactur|logistic)/.test(s)) return "8";
  if (/(labor|elementary|cleaning|delivery|porter)/.test(s)) return "9";
  return "2";
}

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

export default function SkillMapDashboard({ profile, ratings, attempts }: Props) {
  // Derive a fallback profile-shape from Grow data when no AI profile exists yet.
  const effectiveProfile = useMemo(() => {
    if (profile) return profile;
    const strong = new Set<string>();
    const weak = new Set<string>();
    ratings.forEach((r) => {
      if (r.rating >= 4) strong.add(r.category);
      else if (r.rating > 0 && r.rating < 3) weak.add(r.category);
    });
    attempts.forEach((a) => {
      const label = a.skill_input || a.category;
      if (a.level === "Advanced") strong.add(label);
      if (a.level === "Novice") weak.add(label);
    });
    const durable = Array.from(strong);
    const adjacent = Array.from(weak).slice(0, 8);
    const targetIscos = (durable.length > 0 ? durable : ratings.map((r) => r.category)).map(categoryToIsco);
    const lookup = new Map(iscoMajorGroups.map((g) => [g.code, g]));
    const counts = new Map<string, number>();
    targetIscos.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
    const total = Array.from(counts.values()).reduce((s, x) => s + x, 0) || 1;
    const isco_matches = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code, cnt]) => ({
        code,
        label: lookup.get(code)?.label ?? code,
        confidence: Math.round((cnt / total) * 100) / 100,
      }));
    const baseRisks = targetIscos.map((c) => lookup.get(c)?.base_risk).filter((v): v is number => typeof v === "number");
    const automation_risk_raw = baseRisks.length > 0 ? baseRisks.reduce((s, x) => s + x, 0) / baseRisks.length : 0.45;
    const at_risk_tasks = Array.from(new Set(targetIscos.flatMap((c) => AT_RISK_BY_ISCO[c] ?? []))).slice(0, 8);
    return {
      plain_summary: "",
      isco_matches,
      esco_skills: durable.map((label) => ({ label, type: "demonstrated" as const })),
      automation_risk_raw,
      durable_skills: durable,
      at_risk_tasks,
      adjacent_skills: adjacent,
      opportunities: [],
      risk_level: (automation_risk_raw < 0.3 ? "low" : automation_risk_raw < 0.55 ? "moderate" : "high") as ClaudeProfile["risk_level"],
    } as ClaudeProfile;
  }, [profile, ratings, attempts]);

  // ------------------------------------------------------------------
  // 1. Radar data — merge self-ratings with aptitude verification overlay
  // ------------------------------------------------------------------
  const radarPoints = useMemo(() => {
    const map = new Map<string, { label: string; rating: number; aptitude: 0 | 1 | 2 | 3 }>();
    ratings.forEach((r) => {
      if (r.rating > 0) map.set(r.category.toLowerCase(), { label: r.category, rating: r.rating, aptitude: 0 });
    });
    // Best aptitude per category
    const bestApt = new Map<string, GrowAptitude>();
    attempts.forEach((a) => {
      const key = (a.skill_input || a.category).toLowerCase();
      const score = a.level === "Advanced" ? 3 : a.level === "Proficient" ? 2 : 1;
      const current = bestApt.get(key);
      const currentScore = current
        ? current.level === "Advanced" ? 3 : current.level === "Proficient" ? 2 : 1
        : 0;
      if (score > currentScore) bestApt.set(key, a);
    });
    bestApt.forEach((a, key) => {
      const label = a.skill_input || a.category;
      const aptScore = (a.level === "Advanced" ? 3 : a.level === "Proficient" ? 2 : 1) as 1 | 2 | 3;
      const existing = map.get(key);
      if (existing) {
        existing.aptitude = aptScore;
      } else {
        // Pure aptitude entry (no self-rating)
        map.set(key, { label, rating: aptScore + 1, aptitude: aptScore });
      }
    });
    return Array.from(map.values()).slice(0, 8);
  }, [ratings, attempts]);

  // ------------------------------------------------------------------
  // 2. ISCO matches × Frey-Osborne automation risk
  // ------------------------------------------------------------------
  const iscoBreakdown = useMemo(() => {
    const lookup = new Map(iscoMajorGroups.map((g) => [g.code, g]));
    return effectiveProfile.isco_matches.map((m) => {
      const meta = lookup.get(m.code);
      return {
        code: m.code,
        label: m.label,
        confidence: m.confidence,
        risk: meta?.base_risk ?? 0.45,
        notes: meta?.notes ?? "",
      };
    });
  }, [effectiveProfile.isco_matches]);

  // Average risk weighted by confidence — used for the headline band
  const weightedRisk = useMemo(() => {
    if (iscoBreakdown.length === 0) return effectiveProfile.automation_risk_raw;
    const total = iscoBreakdown.reduce((s, x) => s + x.confidence, 0) || 1;
    return iscoBreakdown.reduce((s, x) => s + x.risk * x.confidence, 0) / total;
  }, [iscoBreakdown, effectiveProfile.automation_risk_raw]);

  const riskBand = weightedRisk < 0.3 ? "Low" : weightedRisk < 0.55 ? "Moderate" : "High";
  const riskColor = weightedRisk < 0.3 ? "text-teal" : weightedRisk < 0.55 ? "text-brand" : "text-warn";

  // ------------------------------------------------------------------
  // 3. Radar geometry
  // ------------------------------------------------------------------
  const radarSvg = useMemo(() => {
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.38;
    const n = Math.max(radarPoints.length, 3);
    const points = radarPoints.length >= 3 ? radarPoints : [];
    const polar = (i: number, r: number) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    };
    const ratingPoly = points
      .map((p, i) => {
        const r = (Math.min(p.rating, 5) / 5) * radius;
        const { x, y } = polar(i, r);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const aptitudePoly = points
      .map((p, i) => {
        const r = (p.aptitude / 3) * radius;
        const { x, y } = polar(i, r);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { size, cx, cy, radius, n, points, polar, ratingPoly, aptitudePoly };
  }, [radarPoints]);

  return (
    <div className="surface rounded-sm p-5 mb-8 border-l-2 border-brand">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} className="text-brand" />
        <div className="label-mono">Aggregated skill map</div>
        <span className="ml-auto font-mono text-[10px] text-text-muted">
          Profile Input + Grow data, mapped to ISCO-08 & Automation Risk Heat Map
        </span>
      </div>
      <p className="text-text-muted text-xs mb-5">
        A combined dashboard of where you stand: rated vs. verified skills, occupational fit,
        and which of your strengths are durable in an AI-augmented labor market.
      </p>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ----------- RADAR ----------- */}
        <div className="surface2 rounded-sm p-4">
          <div className="label-mono mb-2 flex items-center gap-1.5">
            <Compass size={11} className="text-brand" /> Skill radar
          </div>
          {radarSvg.points.length >= 3 ? (
            <>
              <svg viewBox={`0 0 ${radarSvg.size} ${radarSvg.size}`} className="w-full h-auto">
                {/* concentric grid */}
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <polygon
                    key={f}
                    points={Array.from({ length: radarSvg.n }, (_, i) => {
                      const { x, y } = radarSvg.polar(i, radarSvg.radius * f);
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(" ")}
                    fill="none"
                    stroke="hsl(var(--border))"
                    strokeWidth="0.6"
                  />
                ))}
                {/* axes */}
                {radarSvg.points.map((_, i) => {
                  const { x, y } = radarSvg.polar(i, radarSvg.radius);
                  return (
                    <line
                      key={i}
                      x1={radarSvg.cx}
                      y1={radarSvg.cy}
                      x2={x}
                      y2={y}
                      stroke="hsl(var(--border))"
                      strokeWidth="0.4"
                    />
                  );
                })}
                {/* self-rating polygon */}
                <polygon
                  points={radarSvg.ratingPoly}
                  fill="hsl(var(--brand) / 0.18)"
                  stroke="hsl(var(--brand))"
                  strokeWidth="1.2"
                />
                {/* aptitude polygon (verified overlay) */}
                {radarSvg.aptitudePoly && (
                  <polygon
                    points={radarSvg.aptitudePoly}
                    fill="hsl(var(--teal) / 0.18)"
                    stroke="hsl(var(--teal))"
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                  />
                )}
                {/* labels */}
                {radarSvg.points.map((p, i) => {
                  const { x, y } = radarSvg.polar(i, radarSvg.radius + 14);
                  return (
                    <text
                      key={i}
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-text-muted"
                      style={{ fontSize: 8, fontFamily: "ui-monospace, monospace" }}
                    >
                      {p.label.length > 14 ? p.label.slice(0, 13) + "…" : p.label}
                    </text>
                  );
                })}
              </svg>
              <div className="flex flex-wrap gap-3 label-mono mt-2 text-[9px]">
                <span className="flex items-center gap-1">
                  <i className="w-2 h-2 inline-block" style={{ background: "hsl(var(--brand))" }} />
                  self-rated
                </span>
                <span className="flex items-center gap-1">
                  <i className="w-2 h-2 inline-block border border-dashed" style={{ background: "hsl(var(--teal) / 0.3)", borderColor: "hsl(var(--teal))" }} />
                  aptitude-verified
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted">
              Rate at least 3 skill categories or take 3 aptitude tests in Grow to draw a radar.
            </p>
          )}
        </div>

        {/* ----------- ISCO FIT × RISK ----------- */}
        <div className="surface2 rounded-sm p-4">
          <div className="label-mono mb-2 flex items-center gap-1.5">
            <Shield size={11} className="text-teal" /> Occupational fit × automation risk
          </div>
          <div className="space-y-3">
            {iscoBreakdown.length === 0 ? (
              <p className="text-xs text-text-muted">No ISCO matches yet — re-run Map My Skills with more inputs.</p>
            ) : (
              iscoBreakdown.map((g) => (
                <div key={g.code}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <div className="text-xs text-text truncate">
                      <span className="font-mono text-teal mr-1.5">{g.code}</span>{g.label}
                    </div>
                    <div className="font-mono text-[10px] text-text-muted shrink-0">
                      {Math.round(g.confidence * 100)}% fit
                    </div>
                  </div>
                  {/* Two stacked bars: confidence (teal) + risk (warn) */}
                  <div className="space-y-1">
                    <div className="h-1.5 bg-bg rounded-full overflow-hidden">
                      <div className="h-full bg-teal" style={{ width: `${Math.round(g.confidence * 100)}%` }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
                        <div
                          className={`h-full ${g.risk < 0.3 ? "bg-teal" : g.risk < 0.55 ? "bg-brand" : "bg-warn"}`}
                          style={{ width: `${Math.round(g.risk * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-text-muted w-16 text-right">
                        risk {Math.round(g.risk * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="label-mono">Weighted risk band</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`font-display text-2xl ${riskColor}`} style={{ fontWeight: 600 }}>
                {riskBand}
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                {Math.round(weightedRisk * 100)}% across your top occupational matches
              </span>
            </div>
          </div>
        </div>

        {/* ----------- CLUSTERS ----------- */}
        <div className="surface2 rounded-sm p-4">
          <div className="label-mono mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-warn" /> Strengths · adjacent · at-risk
          </div>
          <div className="space-y-3 text-xs">
            <Cluster
              title="Durable strengths"
              tone="teal"
              items={effectiveProfile.durable_skills}
              empty="Add ratings ≥ 4 in Grow to populate."
            />
            <Cluster
              title="Adjacent growth edges"
              tone="brand"
              items={effectiveProfile.adjacent_skills}
              empty="Aptitude attempts at Novice/Proficient feed this list."
            />
            <Cluster
              title="At-risk tasks"
              tone="warn"
              items={effectiveProfile.at_risk_tasks}
              empty="No flagged tasks for your current ISCO mix."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Cluster({ title, items, tone, empty }: { title: string; items: string[]; tone: "teal" | "brand" | "warn"; empty: string }) {
  const cls =
    tone === "teal" ? "bg-teal/15 text-teal"
    : tone === "brand" ? "bg-brand/15 text-brand"
    : "bg-warn/15 text-warn";
  return (
    <div>
      <div className="text-text-muted mb-1.5">{title} <span className="font-mono text-[10px]">({items.length})</span></div>
      {items.length === 0 ? (
        <p className="text-[10px] text-text-muted italic">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.slice(0, 12).map((s, i) => (
            <span key={i} className={`pill ${cls}`}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}
