import { useState } from "react";
import { ChevronDown, Calculator } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useActiveCountry, useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import SourceYearToggle from "./SourceYearToggle";

/** Build the exact World Bank API URL the edge function calls for a given indicator. */
function wbApiUrl(iso3: string, indicator: string, exactYear: number | null) {
  const dateRange = exactYear ? `${exactYear}:${exactYear}` : "2014:2024";
  return `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&per_page=10&date=${dateRange}`;
}

/**
 * Expandable panel showing the EXACT numeric values used in the calibration
 * pipeline for the active country:
 *
 *   calibrated = base_FO × lmic_calibration × informality_dampener × wage_factor
 *
 * Each factor is shown with its formula, the inputs that fed it, the resolved
 * numeric value, and the data source (live World Bank vs. static fallback).
 */
export default function CalibrationFactorsBreakdown() {
  const c = useActiveCountry();
  const yearMode = useAppStore((s) => s.sourceYearMode);
  const exactYear = useAppStore((s) => s.exactYear);
  const apiYear = yearMode === "exact" ? exactYear : null;
  const informalityUrl = wbApiUrl(c.code, "SL.ISV.IFRM.ZS", apiYear);
  const gdpUrl = wbApiUrl(c.code, "NY.GDP.PCAP.CD", apiYear);
  const [open, setOpen] = useState(false);

  const lmic = c.lmic_calibration;

  const informalityPct = c.informal_employment_pct;
  const informalityDampener = 1 - (informalityPct / 100) * 0.45;
  const informalityLive = (c as any)._provenance?.informal_employment_pct?.source === "live";

  const gdp = (c as any).gdp_per_capita_usd ?? 3000;
  const gdpLive = (c as any)._provenance?.gdp_per_capita_usd?.source === "live";
  const wageFactorRaw = Math.log10(gdp + 1) / 4.5;
  const wageFactor = Math.min(1, Math.max(0.55, wageFactorRaw));
  const wageClamped =
    wageFactorRaw < 0.55 ? "clamped to 0.55 (floor)"
    : wageFactorRaw > 1 ? "clamped to 1.00 (ceiling)"
    : "within [0.55, 1.00]";

  const productOfFactors = lmic * informalityDampener * wageFactor;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="surface rounded-sm">
      <div className="flex items-stretch">
        <CollapsibleTrigger asChild>
          <button
            className="flex-1 flex items-center justify-between p-4 text-left hover:bg-surface2/40 rounded-sm transition-colors"
            aria-label="Toggle calibration factors breakdown"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Calculator className="w-4 h-4 text-brand shrink-0" />
              <div className="min-w-0">
                <div className="label-mono text-text">CALIBRATION DELTA · exact numeric values</div>
                <div className="text-[11px] text-text-muted mt-0.5 font-mono truncate">
                  {c.name}: ×{lmic.toFixed(2)} · ×{informalityDampener.toFixed(3)} · ×{wageFactor.toFixed(3)}
                  {" → "}
                  <span className="text-text">×{productOfFactors.toFixed(3)}</span>
                  {(c as any)._yearMode === "exact" && (c as any)._requestedYear != null && (
                    <span className="ml-2 text-warn">[pinned {(c as any)._requestedYear}]</span>
                  )}
                </div>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-text-muted shrink-0 transition-transform ml-2",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <div
          className="flex items-center pr-3 pl-1"
          onClick={(e) => e.stopPropagation()}
        >
          <SourceYearToggle compact />
        </div>
      </div>

      <CollapsibleContent className="px-4 pb-4">
        <div className="font-mono text-[11px] text-text-muted mb-3 surface2 rounded-sm p-2.5 overflow-x-auto whitespace-nowrap">
          Calibrated risk = <span className="text-text">baseline automation risk</span> ×{" "}
          <span className="text-brand">{lmic.toFixed(2)}</span> ×{" "}
          <span className="text-teal">{informalityDampener.toFixed(3)}</span> ×{" "}
          <span className="text-warn">{wageFactor.toFixed(3)}</span>
          {" = "}
          <span className="text-text">baseline automation risk × {productOfFactors.toFixed(3)}</span>
        </div>

        <div className="grid gap-2">
          <FactorPanel
            label="country adjustment"
            tone="brand"
            value={`×${lmic.toFixed(2)}`}
            formula="Country structural multiplier reflecting labor-market context"
            inputs={[`country = ${c.code} (${c.name})`]}
            rationale={c.calibration_rationale}
            source="Static country config (calibrated against ILO/WB structural indicators)"
            live={false}
            fallbackOk
          />

          <FactorPanel
            label="INFORMAL EMPLOYMENT"
            tone="teal"
            value={`×${informalityDampener.toFixed(3)}`}
            formula="Informal work resists large-scale automation, 1 − (informal % × 0.45)"
            inputs={[
              `informal_employment_pct = ${informalityPct.toFixed(2)}%`,
              `→ 1 − (${informalityPct.toFixed(2)} / 100) × 0.45`,
              `→ 1 − ${((informalityPct / 100) * 0.45).toFixed(3)}`,
              `→ ${informalityDampener.toFixed(3)}`,
            ]}
            rationale="Informal work resists large-scale automation."
            source="WB WDI · SL.ISV.IFRM.ZS"
            sourceUrl={informalityUrl}
            live={informalityLive}
          />

          <FactorPanel
            label="wage adjustment"
            tone="warn"
            value={`×${wageFactor.toFixed(3)}`}
            formula="Automation cost-competitiveness, lower wages reduce automation incentive (machine cost / wage ratio, WB WDI)"
            inputs={[
              `gdp_per_capita_usd = $${Math.round(gdp).toLocaleString()}${gdpLive ? " (live)" : " (fallback $3,000)"}`,
              `→ log₁₀(${Math.round(gdp).toLocaleString()} + 1) = ${Math.log10(gdp + 1).toFixed(4)}`,
              `→ ÷ 4.5 = ${wageFactorRaw.toFixed(4)}  (${wageClamped})`,
              `→ ${wageFactor.toFixed(3)}`,
            ]}
            rationale="Automation cost-competitiveness."
            source="WB WDI · NY.GDP.PCAP.CD"
            sourceUrl={gdpUrl}
            live={gdpLive}
          />
        </div>

        <div className="mt-3 text-[10px] font-mono text-text-muted leading-relaxed">
          Combined multiplier ×{productOfFactors.toFixed(3)} is applied identically to every ISCO major group.
          Sector-level differences come from the <span className="text-text">baseline automation risk</span> term.
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FactorPanel({
  label,
  tone,
  value,
  formula,
  inputs,
  rationale,
  source,
  sourceUrl,
  live,
  fallbackOk,
}: {
  label: string;
  tone: "brand" | "teal" | "warn";
  value: string;
  formula: string;
  inputs: string[];
  rationale: string;
  source: string;
  sourceUrl?: string;
  live: boolean;
  fallbackOk?: boolean;
}) {
  const toneCls = tone === "brand" ? "text-brand" : tone === "teal" ? "text-teal" : "text-warn";
  const borderCls = tone === "brand" ? "border-brand" : tone === "teal" ? "border-teal" : "border-warn";
  const sourceTag = live ? "[live]" : fallbackOk ? "[config]" : "[fallback]";
  const sourceTone = live ? "text-brand" : fallbackOk ? "text-text-muted" : "text-warn";

  return (
    <div className={cn("surface2 rounded-sm p-3 border-l-2", borderCls)}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className={cn("font-mono text-[11px]", toneCls)}>{label}</span>
        <span className={cn("font-mono text-sm", toneCls)}>{value}</span>
      </div>

      <div className="font-mono text-[10px] text-text-muted mb-1.5">
        formula: <span className="text-text">{formula}</span>
      </div>

      <div className="font-mono text-[10px] text-text-muted leading-relaxed">
        {inputs.map((line) => (
          <div key={line} className="whitespace-pre-wrap">
            <span className="text-text">{line}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[11px] text-text-muted leading-snug">{rationale}</div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] font-mono">
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-brand truncate inline-flex items-center gap-1 group"
            title={`Open exact World Bank API query · ${sourceUrl}`}
          >
            <span className="truncate">{source}</span>
            <ExternalLink className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100" />
          </a>
        ) : (
          <span className="text-text-muted truncate" title={source}>{source}</span>
        )}
        <span className={sourceTone}>{sourceTag}</span>
      </div>
    </div>
  );
}
