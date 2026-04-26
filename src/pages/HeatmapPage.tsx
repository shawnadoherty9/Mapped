import { useMemo, useState } from "react";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { CountryKey, countryConfigs, countryKeys } from "@/data/countryConfigs";
import { iscoMajorGroups, calibrateRisk, riskBand, bandRationale } from "@/data/freyOsborne";
import BandLogicLink from "@/components/BandLogicLink";
import { useAllCountryStats, mergeWithStats } from "@/hooks/useWorldBankStats";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import DataProvenance from "@/components/DataProvenance";
import { useCalibratedRisk, formatCalibrationDeltaPp } from "@/hooks/useCalibratedRisk";
import CountryComparison from "@/components/CountryComparison";
import { Download } from "lucide-react";
import { buildAndDownloadIscoCsv, downloadCsv, formatBytes, provenanceFromMergedCountry } from "@/lib/csvExport";
import { toast } from "sonner";
import GlobalRiskChoropleth from "@/components/GlobalRiskChoropleth";

// Demo countries highlighted per the brief's localizability narrative
const DEMO_PAIR: CountryKey[] = ["ghana", "bangladesh"];

function riskColor(risk: number): string {
  // green (low) → amber → red (high), HSL only per design system.
  // Calibrated risks rarely exceed ~50% in LMIC contexts, so we anchor the
  // top of the visual scale at 0.5 to make the spectrum legible across the
  // table (anything ≥50% reads as fully red).
  const t = Math.max(0, Math.min(1, risk / 0.5));
  const hue = 140 - t * 140; // 140 → 0
  const sat = 65;
  const light = 38 - t * 8;  // darker as risk rises
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

export default function HeatmapPage() {
  const activeCountry = useAppStore((s) => s.country);
  const setCountry = useAppStore((s) => s.setCountry);
  const { map: statsMap, loading } = useAllCountryStats();
  const [region, setRegion] = useState<string>("all");
  const [highlightDemo, setHighlightDemo] = useState(true);

  const regions = useMemo(() => {
    const set = new Set(countryKeys.map((k) => countryConfigs[k].region));
    return ["all", ...Array.from(set)];
  }, []);

  const rows = useMemo(() => {
    return countryKeys
      .filter((k) => region === "all" || countryConfigs[k].region === region)
      .map((k) => {
        const merged = mergeWithStats(k, statsMap[countryConfigs[k].code] ?? null);
        const cells = iscoMajorGroups.map((g) => {
          const calibrated = calibrateRisk(g.base_risk, {
            lmic_calibration: merged.lmic_calibration,
            informality_pct: merged.informal_employment_pct,
            gdp_per_capita_usd: (merged as any).gdp_per_capita_usd ?? null,
          });
          return { group: g, calibrated };
        });
        return { key: k, cfg: merged, cells };
      });
  }, [statsMap, region]);

  // Active-country signals via the reusable hook
  const {
    country: activeMerged,
    rows: activeRows,
    meanBase,
    meanCalibrated,
    calibrationDeltaPp: calibrationDelta,
    highest: highestRow,
  } = useCalibratedRisk();
  const highest = { group: highestRow.group, risk: highestRow.calibrated };

  const downloadActiveCsv = () => {
    const filename = `calibrated-risk-${activeMerged.code}-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      const meta = [
        `# country,${activeMerged.name} (${activeMerged.code})`,
        `# lmic_calibration,${activeMerged.lmic_calibration}`,
        `# informality_pct,${activeMerged.informal_employment_pct ?? "fallback"}`,
        `# gdp_per_capita_usd,${(activeMerged as any).gdp_per_capita_usd ?? "fallback"}`,
        `# source_year,${(activeMerged as any)._sourceYear ?? "n/a"}`,
        `# fetched_at,${(activeMerged as any)._fetchedAt ?? "n/a"}`,
        `# model,Frey-Osborne (2017) × LMIC calibration (lmic × informality_dampener × wage_factor)`,
      ];
      const summary = buildAndDownloadIscoCsv(activeRows, filename, {
        meta,
        asPercent: false,
        calibrationProvenance: provenanceFromMergedCountry(activeMerged),
      });
      const desc = `${summary.rowCount} ISCO row${summary.rowCount === 1 ? "" : "s"} · ${formatBytes(summary.bytes)} · ${summary.filename}`;
      if (summary.warningCount > 0) {
        toast.warning("CSV exported with warnings", {
          description: `${desc}\n${summary.warningCount} data-quality note${summary.warningCount === 1 ? "" : "s"} embedded in the file header.`,
        });
      } else {
        toast.success("CSV exported", { description: desc });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[downloadActiveCsv] unexpected error", err);
      downloadCsv(
        `# export_error,${(err as Error)?.message ?? "unknown"}\nisco_code,isco_label,base_us_risk_ratio,calibrated_risk_ratio,band,quality\n`,
        `calibrated-risk-${activeMerged.code}-error.csv`,
      );
      toast.error("CSV export failed", {
        description: `Saved a diagnostic file instead: ${(err as Error)?.message ?? "unknown error"}`,
      });
    }
  };



  return (
    <AppLayout>
      <div className="px-6 md:px-10 py-8 max-w-[1400px]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <PageHeader
            eyebrow="ISCO × COUNTRY · FREY-OSBORNE CALIBRATED"
            title="Automation risk heat map"
            sub="Frey-Osborne US automation probability for the ISCO major group, employment-weighted base scores × LMIC calibration layer (formality, wage/automation cost ratio, ILO routine task share). Real World Bank data overlays static country configs."
          />
          <button
            onClick={downloadActiveCsv}
            className="bg-brand text-bg px-4 py-2 rounded-sm text-xs font-medium flex items-center gap-2 hover:opacity-90 mt-2 shrink-0"
            title={`Download ${activeMerged.code} calibrated risk per ISCO as CSV`}
          >
            <Download size={13} /> Export {activeMerged.code} CSV
          </button>
        </div>
        {/* Econometric signal cards */}
        <div className="grid md:grid-cols-3 gap-3 mb-6">
          <Card className="bg-surface border-border">
            <CardHeader className="pb-2">
              <div className="label-mono text-text-muted">CALIBRATION DELTA</div>
              <CardTitle className="text-2xl font-display text-brand">
                {formatCalibrationDeltaPp(meanBase, meanCalibrated, 1).signed}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-text-muted">
              Mean ISCO risk in <span className="text-text">{activeMerged.name}</span> is{" "}
              {formatCalibrationDeltaPp(meanBase, meanCalibrated, 1).direction} the US baseline ({(meanBase * 100).toFixed(0)}%).
              <div className="mt-1 font-mono text-[10px]">
                Source: Frey-Osborne 2017 · ILO routine indices · WB GDP/cap
              </div>
            </CardContent>
          </Card>

          <Card className="bg-surface border-border">
            <CardHeader className="pb-2">
              <div className="label-mono text-text-muted">HIGHEST-EXPOSURE GROUP</div>
              <CardTitle className="text-2xl font-display text-text">
                ISCO-{highest.group.code} <span className="text-text-muted text-sm">· {highest.group.label}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-text-muted">
              Calibrated risk{" "}
              <span className="text-brand font-mono">{(highest.risk * 100).toFixed(0)}%</span> · base{" "}
              {(highest.group.base_risk * 100).toFixed(0)}%
              <div className="mt-1 text-[11px]">{highest.group.notes}</div>
              {(() => {
                const r = bandRationale({ calibrated: highestRow.calibrated, low: highestRow.low, high: highestRow.high });
                const tone = r.confidence === "high" ? "text-brand" : r.confidence === "medium" ? "text-warn" : "text-danger";
                return (
                  <div className="mt-1.5 text-[10px] leading-snug">
                    <span className={`font-mono ${tone}`}>conf: {r.confidence}</span>{" "}
                    <span className="text-text-muted">· {r.text}</span>
                    <div><BandLogicLink calibrated={highestRow.calibrated} low={highestRow.low} high={highestRow.high} /></div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="bg-surface border-border">
            <CardHeader className="pb-2">
              <div className="label-mono text-text-muted">INFORMAL EMPLOYMENT</div>
              <CardTitle className="text-2xl font-display text-text">
                {activeMerged.informal_employment_pct.toFixed(0)}%
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-text-muted">
              Informal employment in {activeMerged.name}. Higher informality reduces large-scale
              automation feasibility (ILO 2023).
              <div className="mt-2">
                <DataProvenance
                  indicators={["informal_employment_pct", "gdp_per_capita_usd"]}
                  compact
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="label-mono text-text-muted">Region</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="surface2 border border-border rounded-sm text-xs font-mono px-2 py-1.5 outline-none focus:border-brand"
            >
              {regions.map((r) => (
                <option key={r} value={r} className="bg-surface">
                  {r === "all" ? "All regions" : r}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={highlightDemo}
              onChange={(e) => setHighlightDemo(e.target.checked)}
              className="accent-brand"
            />
            Highlight demo pair (Ghana ↔ Bangladesh)
          </label>
          {loading && <span className="text-[10px] font-mono text-text-muted">Loading World Bank stats…</span>}

          <div className="ml-auto flex items-center gap-1 text-[10px] font-mono text-text-muted">
            <span>0%</span>
            <div
              className="w-32 h-2 rounded-sm"
              style={{
                background:
                  "linear-gradient(to right, hsl(140,65%,38%), hsl(70,65%,36%), hsl(30,65%,34%), hsl(0,65%,30%))",
              }}
            />
            <span>100%</span>
          </div>
        </div>

        {/* Risk legend — calibrated bands + actionability */}
        <Card className="bg-surface border-border mb-4">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="label-mono text-text-muted">Calibrated risk legend</div>
              <div className="ml-auto flex items-center gap-1 text-[10px] font-mono text-text-muted">
                <span>0%</span>
                <div
                  className="w-40 h-2 rounded-sm"
                  style={{
                    background:
                      "linear-gradient(to right, hsl(140,65%,38%) 0%, hsl(140,65%,38%) 20%, hsl(70,65%,36%) 20%, hsl(70,65%,36%) 40%, hsl(30,65%,34%) 40%, hsl(30,65%,34%) 60%, hsl(0,65%,30%) 60%, hsl(0,65%,30%) 100%)",
                  }}
                />
                <span>100%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                {
                  band: "Low",
                  range: "0–20%",
                  color: "hsl(140,65%,38%)",
                  meaning: "Durable role",
                  action: "Invest in deepening — career-grade pathway, formalisation support.",
                },
                {
                  band: "Moderate",
                  range: "20–40%",
                  color: "hsl(70,65%,36%)",
                  meaning: "Partial task exposure",
                  action: "Reskill toward non-routine adjacencies; monitor sector signals.",
                },
                {
                  band: "Elevated",
                  range: "40–60%",
                  color: "hsl(30,65%,34%)",
                  meaning: "Substantial automatable share",
                  action: "Active transition planning; TVET + adjacent-skill bridges within 24 mo.",
                },
                {
                  band: "High",
                  range: "60–100%",
                  color: "hsl(0,65%,30%)",
                  meaning: "Majority of tasks codifiable",
                  action: "Priority intervention — redeployment, income protection, retraining at scale.",
                },
              ].map((b) => (
                <div key={b.band} className="surface2 rounded-sm p-2.5 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: b.color }} />
                    <span className="text-text text-xs font-semibold">{b.band}</span>
                    <span className="ml-auto font-mono text-[10px] text-text-muted">{b.range}</span>
                  </div>
                  <div className="text-[11px] text-text mb-1">{b.meaning}</div>
                  <div className="text-[10px] text-text-muted leading-snug">{b.action}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-text-muted">
              Thresholds applied <span className="font-mono text-text">after</span> LMIC calibration —
              not raw Frey-Osborne scores. Bands align with{" "}
              <code className="text-text">riskBand()</code> in <code className="text-text">freyOsborne.ts</code>.
            </div>
          </CardContent>
        </Card>
        <GlobalRiskChoropleth region={region} />
        <Card className="bg-surface border-border overflow-hidden">
          <CardContent className="p-0 overflow-auto max-h-[60vh]">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-surface2">
                  <th className="text-left px-2 py-1.5 sticky left-0 bg-surface2 z-30 min-w-[130px]">
                    <div className="label-mono text-text-muted">Country</div>
                  </th>
                  {iscoMajorGroups.map((g) => (
                    <th key={g.code} className="px-1 py-1.5 text-center min-w-[44px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <div className="font-mono text-xs text-brand">{g.code}</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <div className="font-semibold mb-1">
                            ISCO-{g.code} · {g.label}
                          </div>
                          <div className="text-xs mb-1">
                            US base risk:{" "}
                            <span className="font-mono">{(g.base_risk * 100).toFixed(0)}%</span> (Frey-Osborne US automation probability for the ISCO major group, employment-weighted)
                          </div>
                          <div className="text-xs mb-1">
                            Routine share: <span className="font-mono">{(g.routine_share * 100).toFixed(0)}%</span>
                          </div>
                          <div className="text-xs text-text-muted">{g.notes}</div>
                        </TooltipContent>
                      </Tooltip>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isDemo = highlightDemo && DEMO_PAIR.includes(row.key);
                  const isActive = row.key === activeCountry;
                  return (
                    <tr key={row.key} className={cn("border-t border-border", isActive && "bg-brand/5")}>
                      <td
                        className={cn(
                          "px-2 py-0.5 sticky left-0 bg-surface z-10 cursor-pointer hover:bg-surface2/60",
                          isActive && "bg-brand/10",
                        )}
                        onClick={() => setCountry(row.key)}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-text truncate" title={`${row.cfg.name} (${row.cfg.code})`}>
                              {row.cfg.name}
                            </div>
                          </div>
                          {isDemo && (
                            <Badge variant="outline" className="text-[9px] font-mono border-brand text-brand px-1 py-0">
                              DEMO
                            </Badge>
                          )}
                        </div>
                      </td>
                      {row.cells.map(({ group, calibrated }) => {
                        const band = riskBand(calibrated);
                        return (
                          <td key={group.code} className="p-px">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={cn(
                                    "h-5 rounded-sm flex items-center justify-center font-mono text-[10px] cursor-help transition-transform hover:scale-110",
                                    isDemo && "ring-1 ring-brand/40",
                                  )}
                                  style={{
                                    backgroundColor: riskColor(calibrated),
                                    color: calibrated > 0.45 ? "white" : "hsl(0, 0%, 95%)",
                                  }}
                                >
                                  {(calibrated * 100).toFixed(0)}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm">
                                <div className="font-semibold mb-1">
                                  {row.cfg.name} · ISCO-{group.code} {group.label}
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                  <span className="text-text-muted">US base risk</span>
                                  <span className="font-mono">{(group.base_risk * 100).toFixed(0)}%</span>
                                  <span className="text-text-muted">LMIC calibration</span>
                                  <span className="font-mono">×{row.cfg.lmic_calibration.toFixed(2)}</span>
                                  <span className="text-text-muted">Informality</span>
                                  <span className="font-mono">{row.cfg.informal_employment_pct.toFixed(0)}%</span>
                                  <span className="text-text-muted">GDP/cap (WB)</span>
                                  <span className="font-mono">
                                    {(row.cfg as any).gdp_per_capita_usd
                                      ? `$${Math.round((row.cfg as any).gdp_per_capita_usd).toLocaleString()}`
                                      : "fallback"}
                                  </span>
                                  <span className="text-text-muted">Calibrated risk</span>
                                  <span className="font-mono text-brand">
                                    {(calibrated * 100).toFixed(0)}% ({band})
                                  </span>
                                </div>
                                <div className="mt-2 text-[11px] text-text-muted">
                                  Why: {row.cfg.calibration_rationale}
                                </div>
                                <div className="mt-1 text-[10px] text-text-muted">
                                  Examples: {group.example_occupations.slice(0, 3).join(", ")}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Country comparison */}
        <div className="mt-6">
          <CountryComparison />
        </div>

        {/* Methodology */}
        <Card className="bg-surface border-border mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display">Methodology</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-text-muted space-y-2">
            <p>
              <span className="text-text">Calibrated risk = baseline automation risk × country adjustment × informal economy adjustment × wage adjustment</span>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <span className="text-text">baseline automation risk</span> — Frey-Osborne (2017) probability mapped via SOC→ISCO-08 crosswalk,
                aggregated to 1-digit major groups weighted by US OES employment.
              </li>
              <li>
                <span className="text-text">country adjustment</span> — pre-computed per country from formality rate,
                robotics intensity, and wage floor (see <code>countryConfigs.ts</code>).
              </li>
              <li>
                <span className="text-text">informal economy adjustment</span> — 1 − (informal % × 0.45). Informal work resists
                large-scale automation (ILO 2023).
              </li>
              <li>
                <span className="text-text">wage adjustment</span> — log₁₀(GDP/cap)/4.5, bounded [0.55, 1.0]. Lower wages
                reduce automation incentive (machine cost / wage ratio, WB WDI).
              </li>
            </ul>
            <div className="pt-2">
              <DataProvenance
                indicators={["informal_employment_pct", "gdp_per_capita_usd", "youth_unemployment_pct"]}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
