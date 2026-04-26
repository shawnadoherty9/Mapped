import { useState } from "react";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { Link } from "react-router-dom";
import { useCalibratedRisk, type CalibratedRiskRow } from "@/hooks/useCalibratedRisk";
import IscoRiskDrawer from "@/components/IscoRiskDrawer";

function ResiliencyGauge({ pct }: { pct: number }) {
  const angle = Math.PI * (pct / 100);
  const r = 90; const cx = 110; const cy = 110;
  const x = cx - r * Math.cos(angle); const y = cy - r * Math.sin(angle);
  const color = pct > 60 ? "hsl(var(--accent))" : pct > 35 ? "hsl(var(--warn))" : "hsl(var(--danger))";
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const fill = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`;
  return (
    <svg viewBox="0 0 220 130" className="w-full max-w-[260px]">
      <path d={arc} stroke="hsl(var(--surface2))" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={fill} stroke={color} strokeWidth="14" fill="none" strokeLinecap="round" />
      <text x={cx} y={cy - 10} textAnchor="middle" className="fill-text font-display" style={{ fontSize: 32, fontWeight: 300 }}>{pct.toFixed(0)}%</text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="fill-text-muted font-mono" style={{ fontSize: 9, letterSpacing: 1.4 }}>RESILIENCY SCORE</text>
    </svg>
  );
}

/**
 * Resiliency-focused section: hero gauge, durable skills, job matches,
 * adjacent skills, and most-resilient sectors. Pulls from the active
 * mapped profile (useAppStore) and active country.
 *
 * Renders a placeholder when no profile has been mapped yet.
 */
export default function ResiliencySection() {
  const profile = useAppStore((s) => s.activeProfile);
  const country = useActiveCountry();
  const { rows: iscoRows } = useCalibratedRisk();
  const [drawerRow, setDrawerRow] = useState<CalibratedRiskRow | null>(null);

  if (!profile) {
    return (
      <div className="surface rounded-sm p-6 text-text-muted text-sm">
        No profile mapped yet. <Link to="/app/profile" className="text-brand underline">Go to Profile Input →</Link>
      </div>
    );
  }

  const adjustedRisk = profile.automation_risk_raw * country.lmic_calibration;
  const resiliencyPct = (1 - adjustedRisk) * 100;
  const resilienceLevel: "high" | "moderate" | "low" =
    resiliencyPct > 60 ? "high" : resiliencyPct > 35 ? "moderate" : "low";
  const resilienceText =
    resilienceLevel === "high"
      ? "Strong position: your skills are largely durable to AI-driven shifts."
      : resilienceLevel === "moderate"
      ? "Solid foundation with room to grow — targeted upskilling will widen your edge."
      : "Significant opportunity: focused reskilling can quickly raise your resiliency.";

  const opportunities = [...(profile.opportunities ?? [])].sort((a, b) => b.match_pct - a.match_pct);

  const resiliencyRows = iscoRows
    .map((r) => ({ ...r, resiliency: 1 - r.calibrated }))
    .sort((a, b) => b.resiliency - a.resiliency);
  const topResilient = resiliencyRows.slice(0, 5);

  return (
    <>
      {/* HERO: Resiliency + interpretation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="surface rounded-sm p-6 flex flex-col items-center border-l-2 border-brand">
          <ResiliencyGauge pct={resiliencyPct} />
          <div className="mt-2 label-mono">
            Level: <span className={resilienceLevel === "high" ? "text-brand" : resilienceLevel === "moderate" ? "text-warn" : "text-danger"}>{resilienceLevel}</span>
          </div>
        </div>
        <div className="surface rounded-sm p-6">
          <div className="label-mono mb-2 text-brand">Your potential</div>
          <p className="text-text">{resilienceText}</p>
          <p className="text-text-muted text-sm mt-3">
            This reflects the share of your skill mix that complements — rather than competes with — automation. The higher the score, the better positioned you are to capture emerging opportunities.
          </p>
        </div>
      </div>

      {/* Durable skills */}
      <div className="surface rounded-sm p-5 mb-8 border-l-2 border-brand">
        <div className="label-mono mb-3 text-brand">Your durable skills — what makes you resilient</div>
        <div className="flex flex-wrap gap-1.5">
          {profile.durable_skills.map((s) => <span key={s} className="pill bg-brand/15 text-brand">{s}</span>)}
        </div>
      </div>

      {/* Job matches */}
      <div className="surface rounded-sm p-5 mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <div className="label-mono text-brand">Jobs that match your strengths</div>
          <div className="font-mono text-[10px] text-text-muted">ranked by fit</div>
        </div>
        {opportunities.length === 0 ? (
          <div className="text-text-muted text-sm">No opportunities mapped yet — revisit Profile Input to refresh matches.</div>
        ) : (
          <div className="space-y-2">
            {opportunities.map((op) => (
              <div key={op.title} className="surface2 rounded-sm p-3 flex items-start gap-3">
                <div className="flex flex-col items-center min-w-[56px]">
                  <div className="font-display text-2xl text-brand leading-none">{op.match_pct}%</div>
                  <div className="font-mono text-[9px] text-text-muted mt-0.5">MATCH</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-text">{op.title}</div>
                    <span className="pill bg-surface text-text-muted border border-border text-[10px] uppercase">{op.type.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-text-muted text-sm mt-1">{op.rationale}</p>
                  <div className="font-mono text-[11px] text-text-muted mt-1">{op.wage_range_usd_day}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skills to add */}
      <div className="surface rounded-sm p-5 mb-8">
        <div className="label-mono mb-3 text-accent">Skills that would increase your resiliency</div>
        <p className="text-text-muted text-sm mb-3">Adding any of these would meaningfully raise your resiliency score.</p>
        <div className="flex flex-wrap gap-1.5">
          {profile.adjacent_skills.map((s) => <span key={s} className="pill bg-surface2 text-text border border-border">+ {s}</span>)}
        </div>
      </div>

      {/* Most resilient sectors */}
      <div className="surface rounded-sm p-5 mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <div className="label-mono text-brand">Most resilient sectors in {country.name}</div>
          <div className="font-mono text-[10px] text-text-muted">ISCO-08 · top 5</div>
        </div>
        <p className="text-text-muted text-xs mb-3">Sectors where human skills remain highest-leverage after calibration.</p>
        <div className="space-y-1.5">
          {topResilient.map((r) => {
            const pct = r.resiliency * 100;
            return (
              <button
                key={r.group.code}
                onClick={() => setDrawerRow(r)}
                className="w-full text-left grid grid-cols-[80px_1fr_60px] gap-3 items-center cursor-pointer hover:bg-surface2/40 rounded-sm px-1 -mx-1 transition-colors"
                title={`Open breakdown for ISCO-${r.group.code}`}
              >
                <div className="font-mono text-[11px] text-brand">ISCO-{r.group.code}</div>
                <div className="relative h-6 rounded-sm bg-surface2 overflow-hidden">
                  <div className="h-full transition-all bg-brand/70" style={{ width: `${pct}%` }} />
                  <div className="absolute inset-0 flex items-center px-2 text-[11px]">
                    <span className="text-text truncate">{r.group.label}</span>
                  </div>
                </div>
                <div className="font-mono text-xs text-brand text-right">{pct.toFixed(0)}%</div>
              </button>
            );
          })}
        </div>
      </div>

      <IscoRiskDrawer
        open={!!drawerRow}
        onOpenChange={(o) => { if (!o) setDrawerRow(null); }}
        row={drawerRow}
        country={country as any}
      />
    </>
  );
}
