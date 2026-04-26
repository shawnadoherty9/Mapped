import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, ReferenceLine, LabelList,
} from "recharts";
import type { CalibratedRiskRow } from "@/hooks/useCalibratedRisk";
import { formatCalibrationDeltaPp, calibrationDeltaPp } from "@/hooks/useCalibratedRisk";
import { riskBand, RISK_BAND_THRESHOLDS } from "@/data/freyOsborne";
import type { CountryConfig } from "@/data/countryConfigs";
import type { FieldProvenance } from "@/hooks/useWorldBankStats";
import BandLogicLink from "@/components/BandLogicLink";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: CalibratedRiskRow | null;
  country: CountryConfig & {
    gdp_per_capita_usd?: number | null;
    _sourceYear?: number | null;
    _fetchedAt?: string | null;
    _provenance?: {
      informal_employment_pct: FieldProvenance;
      gdp_per_capita_usd: FieldProvenance;
      base_FO: FieldProvenance;
    };
  };
}

const bandStyles: Record<string, { color: string; bg: string; label: string }> = {
  low:       { color: "hsl(140,65%,55%)", bg: "hsl(140,65%,38%)", label: "Low · durable role" },
  moderate:  { color: "hsl(70,65%,55%)",  bg: "hsl(70,65%,36%)",  label: "Moderate · partial exposure" },
  elevated:  { color: "hsl(30,65%,60%)",  bg: "hsl(30,65%,34%)",  label: "Elevated · transition planning" },
  high:      { color: "hsl(0,75%,65%)",   bg: "hsl(0,65%,30%)",   label: "High · priority intervention" },
};

const bandAction: Record<string, string> = {
  low: "Invest in deepening — career-grade pathway, formalisation support.",
  moderate: "Reskill toward non-routine adjacencies; monitor sector signals.",
  elevated: "Active transition planning; TVET + adjacent-skill bridges within 24 mo.",
  high: "Priority intervention — redeployment, income protection, retraining at scale.",
};

export default function IscoRiskDrawer({ open, onOpenChange, row, country }: Props) {
  // Actual factor values (used as the baseline / reset target)
  const actualLmic = country.lmic_calibration;
  const actualInformality = country.informal_employment_pct;
  const actualGdp = country.gdp_per_capita_usd ?? 3000;
  const actualWageFactor = Math.min(1, Math.max(0.55, Math.log10(actualGdp + 1) / 4.5));
  const actualInformalityDampener = 1 - (actualInformality / 100) * 0.45;

  // What-if sliders — persisted per (country, ISCO group) in localStorage so that
  // reopening the drawer for the same row restores the user's slider positions.
  // Falls back to actuals when no saved state exists or values are stale.
  const storageKey = row ? `whatif:${country.code}:${row.group.code}` : null;
  const [whatIfLmic, setWhatIfLmic] = useState(actualLmic);
  const [whatIfInformality, setWhatIfInformality] = useState(actualInformality);
  const [whatIfWageFactor, setWhatIfWageFactor] = useState(actualWageFactor);

  // Band-logic disclosure — controlled so a button on the band-preview row can open
  // it and scroll it into view. Reset whenever the active ISCO row changes.
  const [bandLogicOpen, setBandLogicOpen] = useState(false);
  const bandLogicRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setBandLogicOpen(false); }, [row?.group.code, country.code]);
  const openBandLogic = () => {
    setBandLogicOpen(true);
    // Wait a tick so the panel mounts before scrolling.
    requestAnimationFrame(() => {
      bandLogicRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  // Hydrate from localStorage when the row/country changes; otherwise reset to actuals.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { lmic?: number; informality?: number; wageFactor?: number };
        setWhatIfLmic(typeof saved.lmic === "number" ? saved.lmic : actualLmic);
        setWhatIfInformality(typeof saved.informality === "number" ? saved.informality : actualInformality);
        setWhatIfWageFactor(typeof saved.wageFactor === "number" ? saved.wageFactor : actualWageFactor);
        return;
      }
    } catch {
      /* ignore corrupt entries */
    }
    setWhatIfLmic(actualLmic);
    setWhatIfInformality(actualInformality);
    setWhatIfWageFactor(actualWageFactor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist whenever the sliders change. If sliders are at actuals, clear the entry.
  useEffect(() => {
    if (!storageKey) return;
    const dirty =
      Math.abs(whatIfLmic - actualLmic) > 1e-4 ||
      Math.abs(whatIfInformality - actualInformality) > 1e-2 ||
      Math.abs(whatIfWageFactor - actualWageFactor) > 1e-3;
    try {
      if (dirty) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ lmic: whatIfLmic, informality: whatIfInformality, wageFactor: whatIfWageFactor }),
        );
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      /* storage full or unavailable — silently ignore */
    }
  }, [storageKey, whatIfLmic, whatIfInformality, whatIfWageFactor, actualLmic, actualInformality, actualWageFactor]);

  if (!row) return null;
  const g = row.group;
  const calibratedPct = row.calibrated * 100;
  const basePct = row.base * 100;
  // Canonical convention: delta = base − calibrated (see formatCalibrationDeltaPp).
  const delta = formatCalibrationDeltaPp(row.base, row.calibrated, 0);

  // What-if recomputation — mirrors calibrateRisk() in freyOsborne.ts
  const whatIfInformalityDampener = 1 - (whatIfInformality / 100) * 0.45;
  const whatIfCalibrated = Math.min(
    1,
    Math.max(0, row.base * whatIfLmic * whatIfInformalityDampener * whatIfWageFactor)
  );
  const whatIfPct = whatIfCalibrated * 100;
  const whatIfBand = riskBand(whatIfCalibrated);
  const whatIfDelta = formatCalibrationDeltaPp(row.calibrated, whatIfCalibrated, 1); // vs current calibrated
  const isDirty =
    Math.abs(whatIfLmic - actualLmic) > 1e-4 ||
    Math.abs(whatIfInformality - actualInformality) > 1e-2 ||
    Math.abs(whatIfWageFactor - actualWageFactor) > 1e-3;
  const styles = bandStyles[isDirty ? whatIfBand : row.band];

  // Display values — sliders drive the live numbers when dirty, otherwise show actuals.
  const lmic = isDirty ? whatIfLmic : actualLmic;
  const informalityDampener = isDirty ? whatIfInformalityDampener : actualInformalityDampener;
  const wageFactor = isDirty ? whatIfWageFactor : actualWageFactor;

  const resetWhatIf = () => {
    setWhatIfLmic(actualLmic);
    setWhatIfInformality(actualInformality);
    setWhatIfWageFactor(actualWageFactor);
  };

  // -----------------------------------------------------------------------
  // Runtime integrity check — verifies that the values surfaced in the
  // Provenance section are the same numbers actually used to compute
  // wage_factor, informality_dampener, and the displayed pp delta.
  //
  // We compare against the ACTUAL (non-what-if) pipeline because the
  // Provenance panel always shows actual country/WB-derived values,
  // not the slider state. Mismatches here would indicate a stale
  // provenance object, a units mistake, or drift between the formula
  // shown to the user and the formula in freyOsborne.calibrateRisk.
  // -----------------------------------------------------------------------
  const integrityIssues = useMemo<string[]>(() => {
    const issues: string[] = [];
    const prov = country._provenance;
    const EPS_FRAC = 1e-3;   // 0.001 fractional tolerance for FP noise
    const EPS_PCT = 0.05;    // 0.05 pp tolerance for percentage-scale fields
    const EPS_USD = 1;       // $1 tolerance for GDP per capita

    // 1. Provenance.informal_employment_pct ↔ value used in informality_dampener
    if (prov?.informal_employment_pct?.value != null) {
      const provInformal = prov.informal_employment_pct.value;
      if (Math.abs(provInformal - actualInformality) > EPS_PCT) {
        issues.push(
          `informal_employment_pct: provenance shows ${provInformal.toFixed(2)}% but dampener uses ${actualInformality.toFixed(2)}%`,
        );
      }
      // Recompute dampener from provenance value and compare to displayed actual
      const provDampener = 1 - (provInformal / 100) * 0.45;
      if (Math.abs(provDampener - actualInformalityDampener) > EPS_FRAC) {
        issues.push(
          `informality_dampener: ×${actualInformalityDampener.toFixed(3)} shown, but ×${provDampener.toFixed(3)} expected from provenance`,
        );
      }
    }

    // 2. Provenance.gdp_per_capita_usd ↔ value used in wage_factor
    if (prov?.gdp_per_capita_usd?.value != null) {
      const provGdp = prov.gdp_per_capita_usd.value;
      const usedGdp = country.gdp_per_capita_usd ?? 3000;
      if (Math.abs(provGdp - usedGdp) > EPS_USD) {
        issues.push(
          `gdp_per_capita_usd: provenance shows $${Math.round(provGdp).toLocaleString()} but wage_factor uses $${Math.round(usedGdp).toLocaleString()}`,
        );
      }
      const provWage = Math.min(1, Math.max(0.55, Math.log10(provGdp + 1) / 4.5));
      if (Math.abs(provWage - actualWageFactor) > EPS_FRAC) {
        issues.push(
          `wage_factor: ×${actualWageFactor.toFixed(3)} shown, but ×${provWage.toFixed(3)} expected from provenance GDP`,
        );
      }
    }

    // 3. Provenance.base_FO ↔ row.base used in the pipeline
    if (prov?.base_FO?.value != null) {
      const provBase = prov.base_FO.value;
      if (Math.abs(provBase - row!.base) > EPS_FRAC) {
        issues.push(
          `base_FO: provenance p=${provBase.toFixed(3)} but pipeline uses p=${row!.base.toFixed(3)}`,
        );
      }
    }

    // 4. Final pp delta shown in the headline must match canonical (base − calibrated) × 100
    const expectedDeltaPp = calibrationDeltaPp(row!.base, row!.calibrated);
    if (Math.abs(expectedDeltaPp - delta.valuePp) > EPS_PCT) {
      issues.push(
        `pp delta vs base: shown ${delta.valuePp.toFixed(2)} pp but canonical formula gives ${expectedDeltaPp.toFixed(2)} pp`,
      );
    }

    // 5. Calibrated must equal base × lmic × dampener × wage_factor (clamped [0,1])
    const expectedCalibrated = Math.min(
      1,
      Math.max(0, row!.base * actualLmic * actualInformalityDampener * actualWageFactor),
    );
    if (Math.abs(expectedCalibrated - row!.calibrated) > EPS_FRAC) {
      issues.push(
        `calibrated drift: row.calibrated=${row!.calibrated.toFixed(3)} but pipeline (base × ${actualLmic.toFixed(2)} × ${actualInformalityDampener.toFixed(3)} × ${actualWageFactor.toFixed(3)}) = ${expectedCalibrated.toFixed(3)}`,
      );
    }

    return issues;
  }, [
    country._provenance,
    country.gdp_per_capita_usd,
    actualInformality,
    actualInformalityDampener,
    actualWageFactor,
    actualLmic,
    row,
    delta.valuePp,
  ]);

  // Surface mismatches to the console once per change so they show up in dev tools too.
  useEffect(() => {
    if (integrityIssues.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[IscoRiskDrawer] Provenance/pipeline integrity check failed for ${country.code} · ISCO-${row?.group.code}:`,
        integrityIssues,
      );
    }
  }, [integrityIssues, country.code, row?.group.code]);


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-surface border-border w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="label-mono text-text-muted">ISCO-{g.code} · {country.name}</div>
          <SheetTitle className="font-display text-2xl text-text">{g.label}</SheetTitle>
          <SheetDescription className="text-text-muted text-sm">{g.notes}</SheetDescription>
        </SheetHeader>

        {/* Runtime integrity check — surfaces drift between Provenance and pipeline */}
        {integrityIssues.length > 0 && <IntegrityErrorBadge issues={integrityIssues} />}

        {/* Big number — reflects what-if when sliders are dirty */}
        <div className="mt-6 surface2 rounded-sm p-5">
          <div className="flex items-baseline gap-3">
            <div className="font-display text-5xl" style={{ color: styles.color }}>
              {(isDirty ? whatIfPct : calibratedPct).toFixed(0)}%
            </div>
            <div className="flex-1">
              <div className="label-mono text-text-muted">
                {isDirty ? "What-if calibrated risk" : "Calibrated risk"}
              </div>
              <div className="text-xs font-mono mt-0.5" style={{ color: styles.color }}>
                {styles.label}
              </div>
            </div>
            {isDirty && (
              <div className="text-right">
                <div className="label-mono text-text-muted">vs actual</div>
                <div className="font-mono text-sm text-text">{whatIfDelta.signed}</div>
              </div>
            )}
          </div>
          <div className="mt-3 h-2 rounded-sm bg-bg overflow-hidden relative">
            <div
              className="absolute top-0 bottom-0 w-px bg-text-muted z-10"
              style={{ left: `${basePct}%` }}
              title={`US baseline ${basePct.toFixed(0)}%`}
            />
            {isDirty && (
              <div
                className="absolute top-0 bottom-0 w-px bg-text/50 z-10"
                style={{ left: `${calibratedPct}%` }}
                title={`Actual calibrated ${calibratedPct.toFixed(0)}%`}
              />
            )}
            <div
              className="h-full transition-all"
              style={{ width: `${isDirty ? whatIfPct : calibratedPct}%`, backgroundColor: styles.bg }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-mono text-text-muted">
            <span>0%</span>
            <span>
              US base {basePct.toFixed(0)}% · {delta.signed} vs base ({delta.direction})
              {isDirty && <> · actual {calibratedPct.toFixed(0)}%</>}
            </span>
            <span>100%</span>
          </div>
        </div>

        {/* Band preview — exact thresholds for the band the (what-if) calibrated risk lands in */}
        <BandPreviewLabel
          pct={isDirty ? whatIfPct : calibratedPct}
          band={isDirty ? whatIfBand : row.band}
          isWhatIf={isDirty}
          bandColor={styles.color}
          bandLabel={styles.label}
          onOpenBandLogic={openBandLogic}
        />

        {/* Band logic disclosure — controlled by the button on BandPreviewLabel.
            Uses the actual (not what-if) [low, high] interval from the row. */}
        <div ref={bandLogicRef} className="mt-2">
          <BandLogicLink
            calibrated={row.calibrated}
            low={row.low}
            high={row.high}
            open={bandLogicOpen}
            onOpenChange={setBandLogicOpen}
          />
        </div>


        <WhatIfComparisonChart
          basePct={basePct}
          actualPct={calibratedPct}
          whatIfPct={whatIfPct}
          isDirty={isDirty}
          actualBandColor={bandStyles[row.band].bg}
          whatIfBandColor={styles.bg}
        />

        {/* What-if sliders */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="label-mono">What-if · adjust calibration factors</div>
            {isDirty && (
              <button
                onClick={resetWhatIf}
                className="font-mono text-[10px] text-text-muted hover:text-text underline underline-offset-2"
                title="Reset all sliders to actual values"
              >
                reset
              </button>
            )}
          </div>
          <div className="surface2 rounded-sm p-3 grid gap-3">
            <SliderRow
              label="lmic_calibration"
              value={whatIfLmic}
              actual={actualLmic}
              min={0.5}
              max={1.2}
              step={0.01}
              format={(v) => `×${v.toFixed(2)}`}
              tone="brand"
              onChange={setWhatIfLmic}
              hint="Country structural multiplier reflecting labor-market context"
            />
            <SliderRow
              label="informal_employment_pct"
              value={whatIfInformality}
              actual={actualInformality}
              min={0}
              max={95}
              step={1}
              format={(v) => `${v.toFixed(0)}%`}
              tone="teal"
              onChange={setWhatIfInformality}
              hint={`Higher informality → stronger dampener (×${whatIfInformalityDampener.toFixed(3)})`}
            />
            <SliderRow
              label="wage_factor"
              value={whatIfWageFactor}
              actual={actualWageFactor}
              min={0.55}
              max={1}
              step={0.01}
              format={(v) => `×${v.toFixed(2)}`}
              tone="warn"
              onChange={setWhatIfWageFactor}
              hint="Automation cost-competitiveness."
            />
          </div>
          <p className="mt-2 text-[10px] font-mono text-text-muted leading-relaxed">
            Sliders update only this view — they do not change country config or other charts.
          </p>
        </div>

        {/* Formula */}
        <div className="mt-5">
          <div className="label-mono mb-2">Formula inputs</div>
          <div className="surface2 rounded-sm p-3 font-mono text-[11px] text-text-muted leading-relaxed overflow-x-auto whitespace-nowrap">
            <span className="text-text-muted">calibrated = </span>
            <span className="text-text">{row.base.toFixed(3)}</span>
            <span> × </span>
            <span className="text-brand">{lmic.toFixed(2)}</span>
            <span> × </span>
            <span className="text-teal">{informalityDampener.toFixed(3)}</span>
            <span> × </span>
            <span className="text-warn">{wageFactor.toFixed(3)}</span>
            <span> = </span>
            <span className="text-text">{(isDirty ? whatIfCalibrated : row.calibrated).toFixed(3)}</span>
          </div>

          {/* Compact what-if multiplier breakdown — one chip per factor with Δ vs actual */}
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <MultiplierChip
              label="lmic_calibration"
              value={whatIfLmic}
              actual={actualLmic}
              format={(v) => `×${v.toFixed(2)}`}
              tone="brand"
            />
            <MultiplierChip
              label="informality_dampener"
              value={whatIfInformalityDampener}
              actual={actualInformalityDampener}
              format={(v) => `×${v.toFixed(3)}`}
              tone="teal"
            />
            <MultiplierChip
              label="wage_factor"
              value={whatIfWageFactor}
              actual={actualWageFactor}
              format={(v) => `×${v.toFixed(3)}`}
              tone="warn"
            />
          </div>

          <div className="mt-3 grid gap-1.5">
            <FactorRow label="baseline risk" value={row.base.toFixed(3)} sub="Frey-Osborne US automation probability for the ISCO major group, employment-weighted" tone="text" />
            <FactorRow label="country adjustment" value={`×${lmic.toFixed(2)}`} sub="Country structural multiplier reflecting labor-market context" tone="brand" />
            <FactorRow
              label="informal economy adjustment"
              value={`×${informalityDampener.toFixed(3)}`}
              sub="Informal work resists large-scale automation, 1 − (informal % × 0.45)"
              tone="teal"
            />
            <FactorRow
              label="wage adjustment"
              value={`×${wageFactor.toFixed(3)}`}
              sub="Automation cost-competitiveness, lower wages reduce automation incentive (machine cost / wage ratio, WB WDI)"
              tone="warn"
            />
          </div>
        </div>

        {/* Routine task share */}
        <div className="mt-5">
          <div className="label-mono mb-2">Task composition</div>
          <div className="surface2 rounded-sm p-3">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-xs text-text">Routine / codifiable share</span>
              <span className="font-mono text-xs text-text">{(g.routine_share * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-sm bg-bg overflow-hidden">
              <div className="h-full bg-text-muted" style={{ width: `${g.routine_share * 100}%` }} />
            </div>
            <div className="mt-2 text-[11px] text-text-muted">
              ILO Future of Work task indices — share of tasks that are routine and computer-substitutable.
            </div>

            {/* Footnote: exact provenance of the routine-share weight for this ISCO group */}
            <div className="mt-2 pt-2 border-t border-border/60 text-[10px] font-mono text-text-muted leading-relaxed space-y-0.5">
              <div>
                <span className="text-text">weight source:</span>{" "}
                Autor, Levy & Murnane (2003) routine-task intensity (RTI) re-mapped to
                ISCO-08 major groups by Marcolin, Miroudot & Squicciarini (OECD STI WP
                2016/04, “The Routine Content of Occupations”).
              </div>
              <div>
                <span className="text-text">ILOSTAT fields used:</span>{" "}
                <a
                  href="https://ilostat.ilo.org/topics/employment/#"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand underline-offset-2 hover:underline"
                >
                  EMP_TEMP_SEX_OCU_NB
                </a>
                {" "}(employment by sex & ISCO-08 1-digit, A14) ·{" "}
                <a
                  href="https://ilostat.ilo.org/topics/employment/#"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand underline-offset-2 hover:underline"
                >
                  EMP_2EMP_SEX_OC2_NB
                </a>
                {" "}(employment by ISCO-08 2-digit, A02) — used to employment-weight
                the OECD RTI scores up to the 9 major groups shown here.
              </div>
              <div>
                <span className="text-text">aggregation:</span>{" "}
                routine_share<sub>g</sub> = Σ<sub>occ ∈ g</sub> (employment<sub>occ</sub> / employment<sub>g</sub>) × RTI<sub>occ</sub>,
                normalised to [0, 1].
              </div>
            </div>
          </div>
        </div>

        {/* Examples */}
        <div className="mt-5">
          <div className="label-mono mb-2">Example occupations in ISCO-{g.code}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.example_occupations.map((occ) => (
              <span key={occ} className="pill bg-surface2 text-text border border-border text-[11px]">
                {occ}
              </span>
            ))}
          </div>
        </div>

        {/* Action */}
        <div className="mt-5 surface2 rounded-sm p-3 border-l-2" style={{ borderColor: styles.bg }}>
          <div className="label-mono mb-1" style={{ color: styles.color }}>What this means · actionability</div>
          <p className="text-text text-sm leading-relaxed">{bandAction[row.band]}</p>
        </div>

        {/* Provenance — exact datasets, years, and values used by this calculation */}
        <div className="mt-5">
          <div className="label-mono mb-2">Provenance · values used in this calculation</div>
          <div className="surface2 rounded-sm overflow-hidden divide-y divide-border">
            <ProvenanceRow
              field="baseline automation risk"
              displayValue={`${(row.base * 100).toFixed(1)}%  (p=${row.base.toFixed(3)})`}
              prov={country._provenance?.base_FO}
              extra={`ISCO-${row.group.code} · ${row.group.label} · employment-weighted`}
            />
            <ProvenanceRow
              field="gdp_per_capita_usd"
              displayValue={
                country.gdp_per_capita_usd != null
                  ? `$${Math.round(country.gdp_per_capita_usd).toLocaleString()}`
                  : "$3,000 (fallback)"
              }
              prov={country._provenance?.gdp_per_capita_usd}
              extra="Drives wage adjustment = log₁₀(GDP/cap+1)/4.5, clamped [0.55, 1]"
            />
            <ProvenanceRow
              field="informal_employment_pct"
              displayValue={`${country.informal_employment_pct.toFixed(1)}%`}
              prov={country._provenance?.informal_employment_pct}
              extra="Drives informal economy adjustment = 1 − (informal_pct × 0.45)"
            />
          </div>
          <div className="mt-2 text-[10px] font-mono text-text-muted leading-relaxed">
            Pipeline: baseline risk × country adjustment × informal economy adjustment × wage adjustment
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MultiplierChip({
  label, value, actual, format, tone,
}: {
  label: string;
  value: number;
  actual: number;
  format: (v: number) => string;
  tone: "brand" | "teal" | "warn";
}) {
  const colorCls = tone === "brand" ? "text-brand" : tone === "teal" ? "text-teal" : "text-warn";
  const dirty = Math.abs(value - actual) > 1e-4;
  const delta = value - actual;
  const deltaStr = dirty
    ? `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(3)}`
    : "= actual";
  return (
    <div className="surface2 rounded-sm p-2 border border-border/60">
      <div className="font-mono text-[10px] text-text-muted truncate" title={label}>{label}</div>
      <div className={`font-mono text-sm ${colorCls} mt-0.5`}>{format(value)}</div>
      <div className={`font-mono text-[10px] mt-0.5 ${dirty ? "text-text" : "text-text-muted"}`}>
        {deltaStr}
      </div>
    </div>
  );
}

function FactorRow({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "text" | "brand" | "teal" | "warn" }) {
  const colorCls = tone === "brand" ? "text-brand" : tone === "teal" ? "text-teal" : tone === "warn" ? "text-warn" : "text-text";
  return (
    <div className="surface2 rounded-sm p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-text-muted">{label}</span>
        <span className={`font-mono text-xs ${colorCls}`}>{value}</span>
      </div>
      <div className="text-[11px] text-text-muted mt-0.5 leading-snug">{sub}</div>
    </div>
  );
}

type SliderTone = "brand" | "teal" | "warn";
function SliderRow({
  label, value, actual, min, max, step, format, tone, onChange, hint,
}: {
  label: string;
  value: number;
  actual: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  tone: SliderTone;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const colorCls = tone === "brand" ? "text-brand" : tone === "teal" ? "text-teal" : "text-warn";
  const isDirty = Math.abs(value - actual) > step / 2;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="font-mono text-[11px] text-text-muted">{label}</span>
        <span className={`font-mono text-xs ${colorCls}`}>
          {format(value)}
          {isDirty && (
            <span className="ml-1.5 text-text-muted text-[10px]">
              (was {format(actual)})
            </span>
          )}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        aria-label={`${label} what-if slider`}
      />
      {hint && <div className="text-[10px] text-text-muted mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

function ProvenanceRow({
  field,
  displayValue,
  prov,
  extra,
}: {
  field: string;
  displayValue: string;
  prov?: FieldProvenance;
  extra?: string;
}) {
  const sourceLabel =
    prov?.source === "live" ? "live" :
    prov?.source === "fallback" ? "fallback" :
    "missing";
  const sourceTone =
    prov?.source === "live" ? "text-brand" :
    prov?.source === "fallback" ? "text-warn" :
    "text-danger";
  const yearStr = prov?.sourceYear ? ` · ${prov.sourceYear}` : "";
  const fetchedStr = prov?.fetchedAt
    ? ` · fetched ${new Date(prov.fetchedAt).toISOString().slice(0, 10)}`
    : "";

  return (
    <div className="p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-text">{field}</span>
        <span className="font-mono text-xs text-text">{displayValue}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[10px] font-mono text-text-muted">
        <span className="truncate" title={prov?.dataset}>{prov?.dataset ?? "—"}</span>
        <span className={sourceTone}>
          [{sourceLabel}]{yearStr}
        </span>
      </div>
      {fetchedStr && (
        <div className="text-[10px] font-mono text-text-muted mt-0.5">{fetchedStr.replace(/^ · /, "")}</div>
      )}
      {extra && <div className="text-[10px] text-text-muted mt-1 leading-snug">{extra}</div>}
    </div>
  );
}

/**
 * Mini Recharts comparison: US base · actual calibrated · what-if calibrated.
 * The "what-if" bar updates live as the sliders move; when sliders are at
 * actual values the chart collapses to a 2-bar before/after view.
 */
function WhatIfComparisonChart({
  basePct,
  actualPct,
  whatIfPct,
  isDirty,
  actualBandColor,
  whatIfBandColor,
}: {
  basePct: number;
  actualPct: number;
  whatIfPct: number;
  isDirty: boolean;
  actualBandColor: string;
  whatIfBandColor: string;
}) {
  const data = useMemo(() => {
    const rows: { name: string; pct: number; fill: string }[] = [
      { name: "US base", pct: basePct, fill: "hsl(var(--text-muted))" },
      { name: "Calibrated", pct: actualPct, fill: actualBandColor },
    ];
    if (isDirty) {
      rows.push({ name: "What-if", pct: whatIfPct, fill: whatIfBandColor });
    }
    return rows;
  }, [basePct, actualPct, whatIfPct, isDirty, actualBandColor, whatIfBandColor]);

  const delta = whatIfPct - actualPct;
  const deltaTone = !isDirty
    ? "text-text-muted"
    : delta > 0.5 ? "text-danger" : delta < -0.5 ? "text-brand" : "text-text-muted";
  const deltaSign = delta > 0 ? "+" : "";

  return (
    <div className="mt-3 surface2 rounded-sm p-3">
      <div className="flex items-baseline justify-between mb-1">
        <div className="label-mono">Before / after · calibrated risk</div>
        <div className={`font-mono text-[11px] ${deltaTone}`}>
          {isDirty ? `Δ ${deltaSign}${delta.toFixed(1)}pp vs actual` : "drag a slider →"}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={108}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 36, bottom: 0, left: 70 }}
          barCategoryGap={6}
        >
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            stroke="hsl(var(--text-muted))"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <ReferenceLine
            x={basePct}
            stroke="hsl(var(--text-muted))"
            strokeDasharray="2 2"
            opacity={0.5}
          />
          {isDirty && (
            <ReferenceLine
              x={actualPct}
              stroke="hsl(var(--text))"
              strokeDasharray="2 2"
              opacity={0.4}
            />
          )}
          <Bar dataKey="pct" radius={[0, 2, 2, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
            <LabelList
              dataKey="pct"
              position="right"
              formatter={(v: number) => `${v.toFixed(0)}%`}
              style={{ fill: "hsl(var(--text))", fontSize: 10, fontFamily: "var(--font-mono, monospace)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 text-[10px] font-mono text-text-muted leading-relaxed">
        Dashed lines: US base{isDirty && " · actual calibrated (anchor)"}.
      </div>
    </div>
  );
}

function BandPreviewLabel({
  pct, band, isWhatIf, bandColor, bandLabel, onOpenBandLogic,
}: {
  pct: number;
  band: "low" | "moderate" | "elevated" | "high";
  isWhatIf: boolean;
  bandColor: string;
  bandLabel: string;
  /** When provided, renders a "Band logic ↓" button that opens the disclosure panel. */
  onOpenBandLogic?: () => void;
}) {
  // Resolve [lo, hi) for the current band from the canonical thresholds table.
  const idx = RISK_BAND_THRESHOLDS.findIndex((t) => t.band === band);
  const loFrac = idx === 0 ? 0 : RISK_BAND_THRESHOLDS[idx - 1].upTo;
  const hiFrac = RISK_BAND_THRESHOLDS[idx].upTo;
  const loPct = loFrac * 100;
  const hiPct = hiFrac * 100;
  const isTopBand = idx === RISK_BAND_THRESHOLDS.length - 1;
  const rangeLabel = isTopBand
    ? `≥ ${loPct.toFixed(0)}%`
    : `${loPct.toFixed(0)}% ≤ risk < ${hiPct.toFixed(0)}%`;

  // Distance to the nearest band edge — useful when sliders nudge near a threshold.
  const distToLo = pct - loPct;
  const distToHi = hiPct - pct;
  const nearest = isTopBand
    ? { edge: loPct, dist: distToLo, dir: "above" as const }
    : distToHi < distToLo
      ? { edge: hiPct, dist: distToHi, dir: "below" as const }
      : { edge: loPct, dist: distToLo, dir: "above" as const };

  return (
    <div
      className="mt-3 surface2 rounded-sm p-3 border-l-2 flex items-baseline gap-3 flex-wrap"
      style={{ borderColor: bandColor }}
    >
      <div className="label-mono text-text-muted shrink-0">
        {isWhatIf ? "what-if band" : "band"}
      </div>
      <div className="font-mono text-sm" style={{ color: bandColor }}>
        {band}
      </div>
      <div className="font-mono text-[11px] text-text-muted">
        {rangeLabel}
      </div>
      <div className="font-mono text-[11px] text-text ml-auto">
        {pct.toFixed(1)}%
        <span className="text-text-muted">
          {" "}· {nearest.dist.toFixed(1)}pp {nearest.dir} {nearest.edge.toFixed(0)}% edge
        </span>
      </div>
      <div className="basis-full text-[10px] font-mono text-text-muted leading-relaxed">
        {bandLabel}
      </div>
      {onOpenBandLogic && (
        <div className="basis-full">
          <button
            type="button"
            onClick={onOpenBandLogic}
            className="font-mono text-[10px] underline underline-offset-2 decoration-dotted hover:text-text"
            style={{ color: bandColor }}
            title="Show the uncertainty interval and which thresholds it crosses"
          >
            ↓ See band-logic thresholds for this risk
          </button>
        </div>
      )}
    </div>
  );
}

function IntegrityErrorBadge({ issues }: { issues: string[] }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-sm border border-warn/60 bg-warn/10 p-3"
    >
      <div className="flex items-baseline gap-2">
        <span
          className="pill bg-warn text-bg font-mono text-[10px] tracking-wider"
          title="Provenance values do not match the values used in the calibration pipeline"
        >
          ⚠ INTEGRITY · {issues.length} mismatch{issues.length === 1 ? "" : "es"}
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          provenance ↔ pipeline drift detected
        </span>
      </div>
      <ul className="mt-2 space-y-1 font-mono text-[11px] text-text leading-snug">
        {issues.map((msg, i) => (
          <li key={i} className="before:content-['—_'] before:text-text-muted">
            {msg}
          </li>
        ))}
      </ul>
    </div>
  );
}
