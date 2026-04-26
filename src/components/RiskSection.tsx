import { useState } from "react";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import DataProvenance from "@/components/DataProvenance";
import { useCalibratedRisk, formatCalibrationDeltaPp, type CalibratedRiskRow } from "@/hooks/useCalibratedRisk";
import { bandRationale } from "@/data/freyOsborne";
import BandLogicLink from "@/components/BandLogicLink";
import IscoRiskDrawer from "@/components/IscoRiskDrawer";
import CalibrationFactorsBreakdown from "@/components/CalibrationFactorsBreakdown";
import SourceYearToggle from "@/components/SourceYearToggle";

/**
 * Risk-focused section: at-risk tasks, calibration methodology,
 * factor breakdown, and the full sector-level exposure ranking.
 *
 * Renders a placeholder when no profile has been mapped yet.
 */
export default function RiskSection() {
  const profile = useAppStore((s) => s.activeProfile);
  const country = useActiveCountry();
  const { rows: iscoRows, meanCalibrated, meanBase, highest, lowest } = useCalibratedRisk();
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

  const wittData = [
    { name: "2024", value: country.wittgenstein_secondary_2024, key: "now" },
    { name: "2035 (proj.)", value: country.wittgenstein_secondary_2035, key: "future" },
  ];

  return (
    <>
      <div className="mb-4">
        <div className="label-mono text-text-muted mb-1">Awareness section</div>
        <h2 className="font-display text-xl text-text">Tasks and sectors with declining demand</h2>
        <p className="text-text-muted text-sm mt-1">Useful context — not a forecast about you. Pair with the upskilling suggestions in Resiliency Score.</p>
      </div>

      <div className="surface rounded-sm p-5 mb-6">
        <div className="label-mono mb-3 text-danger">At-risk tasks in your current mix</div>
        <div className="flex flex-wrap gap-1.5">
          {profile.at_risk_tasks.map((s) => <span key={s} className="pill bg-danger/15 text-danger">{s}</span>)}
        </div>
      </div>

      {/* Education context */}
      <div className="surface rounded-sm p-5 mb-8">
        <div className="label-mono mb-1">Education landscape — {country.name}</div>
        <div className="text-text-muted text-xs mb-3 font-mono">Wittgenstein Centre 2025–2035 · % of working-age with secondary completion</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={wittData} layout="vertical" margin={{ left: 60, right: 30 }}>
            <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--text-muted))" fontSize={10} />
            <YAxis type="category" dataKey="name" stroke="hsl(var(--text-muted))" fontSize={11} />
            <Tooltip cursor={{ fill: "hsl(var(--surface2))" }} contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Bar dataKey="value" radius={[0, 2, 2, 0]}>
              {wittData.map((d) => <Cell key={d.key} fill={d.key === "now" ? "hsl(var(--text-muted))" : "hsl(var(--accent))"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-text-muted text-sm mt-3">As the supply of educated workers increases, human-differentiated skills are your competitive edge.</p>
      </div>

      {/* Calibration note */}
      <div className="surface rounded-sm p-5 border-l-2 border-teal mb-8">
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div className="label-mono text-teal">Methodology · CALIBRATION DELTA</div>
          <SourceYearToggle compact />
        </div>
        <div className="font-mono text-sm text-text">
          Frey-Osborne raw {profile.automation_risk_raw.toFixed(2)} × {country.lmic_calibration.toFixed(2)} = exposure <span className="text-text">{adjustedRisk.toFixed(2)}</span> → resiliency <span className="text-brand">{resiliencyPct.toFixed(0)}%</span>
        </div>
        <p className="text-text mt-2 text-sm">Calibrated for {country.name} labor market context. <em className="text-text-muted">{country.calibration_rationale}.</em></p>
        <div className="label-mono mt-3">Models: Frey & Osborne (2013) automation scores · ILO task indices · World Bank STEP skills survey</div>
        <DataProvenance indicators={["youth_unemployment_pct", "informal_employment_pct", "labor_force_participation_pct"]} />
      </div>

      <div className="mb-10">
        <CalibrationFactorsBreakdown />
      </div>

      <div className="surface rounded-sm p-5 mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <div className="label-mono text-text-muted">Sector-level exposure</div>
          <div className="font-mono text-[10px] text-text-muted">{country.name}</div>
        </div>
        <p className="text-text-muted text-xs mb-4">
          Full sector view — calibrated automation exposure across all 9 ISCO major groups.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="surface2 rounded-sm p-3">
            <div className="label-mono mb-0.5">Mean exposure</div>
            <div className="font-display text-2xl text-text">{(meanCalibrated * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-text-muted font-mono">across 9 ISCO groups</div>
          </div>
          <div className="surface2 rounded-sm p-3">
            <div className="label-mono mb-0.5">vs US baseline</div>
            <div className="font-display text-2xl text-text">
              {formatCalibrationDeltaPp(meanBase, meanCalibrated, 1).signed}
            </div>
            <div className="text-[10px] text-text-muted font-mono" title="Global automation estimates, adjusted with real country data to reflect local labor market conditions, using Frey-Osborne US automation probability">base {(meanBase * 100).toFixed(0)}%</div>
          </div>
          <div className="surface2 rounded-sm p-3 border-l-2 border-danger">
            <div className="label-mono mb-0.5 text-danger">HIGHEST-EXPOSURE GROUP</div>
            <div className="font-mono text-sm text-text">ISCO-{highest.group.code}</div>
            <div className="text-[11px] text-text-muted truncate">{highest.group.label}</div>
            <div className="font-mono text-xs text-danger mt-0.5">{(highest.calibrated * 100).toFixed(0)}% · {highest.band}</div>
            {(() => {
              const r = bandRationale({ calibrated: highest.calibrated, low: highest.low, high: highest.high });
              const conf = r.confidence;
              const tone = conf === "high" ? "text-brand" : conf === "medium" ? "text-warn" : "text-danger";
              return (
                <div className="mt-1.5 text-[10px] leading-snug text-text-muted">
                  <span className={`font-mono ${tone}`}>conf: {conf}</span> · {r.text}
                  <div><BandLogicLink calibrated={highest.calibrated} low={highest.low} high={highest.high} /></div>
                </div>
              );
            })()}
          </div>
          <div className="surface2 rounded-sm p-3 border-l-2 border-brand">
            <div className="label-mono mb-0.5 text-brand">Most resilient</div>
            <div className="font-mono text-sm text-text">ISCO-{lowest.group.code}</div>
            <div className="text-[11px] text-text-muted truncate">{lowest.group.label}</div>
            <div className="font-mono text-xs text-brand mt-0.5">{(lowest.calibrated * 100).toFixed(0)}% · {lowest.band}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          {[...iscoRows].sort((a, b) => b.calibrated - a.calibrated).map((r) => {
            const pctVal = r.calibrated * 100;
            const basePct = r.base * 100;
            const barColor =
              r.band === "low" ? "hsl(140,65%,38%)" :
              r.band === "moderate" ? "hsl(70,65%,36%)" :
              r.band === "elevated" ? "hsl(30,65%,34%)" : "hsl(0,65%,30%)";
            return (
              <button
                key={r.group.code}
                onClick={() => setDrawerRow(r)}
                className="w-full text-left grid grid-cols-[80px_1fr_60px] gap-3 items-center cursor-pointer hover:bg-surface2/40 rounded-sm px-1 -mx-1 transition-colors"
                title={`Open calibration breakdown for ISCO-${r.group.code}`}
              >
                <div className="font-mono text-[11px]">
                  <span className="text-brand">ISCO-{r.group.code}</span>
                </div>
                <div className="relative h-6 rounded-sm bg-surface2 overflow-hidden">
                  <div
                    className="absolute top-0 bottom-0 w-px bg-text-muted/60 z-10"
                    style={{ left: `${basePct}%` }}
                    title={`US baseline ${basePct.toFixed(0)}%`}
                  />
                  <div className="h-full transition-all" style={{ width: `${pctVal}%`, backgroundColor: barColor }} />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-text/70 z-20 rounded-full"
                    style={{ left: `${r.low * 100}%`, width: `${(r.high - r.low) * 100}%` }}
                    title={`Range ${(r.low * 100).toFixed(0)}–${(r.high * 100).toFixed(0)}%`}
                  />
                  <div className="absolute inset-0 flex items-center px-2 text-[11px]">
                    <span className="text-text truncate">{r.group.label}</span>
                  </div>
                </div>
                <div className="font-mono text-xs text-text text-right">
                  {pctVal.toFixed(0)}%
                  <div className="text-[9px] text-text-muted leading-none mt-0.5">
                    ±{r.halfWidthPp.toFixed(1)}pp
                  </div>
                </div>
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
