import { useMemo } from "react";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { CountryKey, countryConfigs } from "@/data/countryConfigs";
import {
  iscoMajorGroups,
  calibrateRiskRange,
  riskBand,
  type IscoMajorGroup,
} from "@/data/freyOsborne";
import { useCountryStats, mergeWithStats } from "@/hooks/useWorldBankStats";

export interface CalibratedRiskRow {
  group: IscoMajorGroup;
  base: number;        // US Frey-Osborne base (0..1)
  calibrated: number;  // LMIC-calibrated risk (0..1)
  band: ReturnType<typeof riskBand>;
  /** Lower bound of the calibrated estimate (0..1). */
  low: number;
  /** Upper bound of the calibrated estimate (0..1). */
  high: number;
  /** Half-width of the uncertainty band in percentage points. */
  halfWidthPp: number;
}

export interface UseCalibratedRiskResult {
  country: ReturnType<typeof useActiveCountry>;
  loading: boolean;
  rows: CalibratedRiskRow[];
  /** Mean calibrated risk across all 9 ISCO major groups. */
  meanCalibrated: number;
  /** Mean US base risk across all 9 ISCO major groups (constant). */
  meanBase: number;
  /** meanBase − meanCalibrated, in percentage points. */
  calibrationDeltaPp: number;
  /** Highest calibrated-risk row. */
  highest: CalibratedRiskRow;
  /** Lowest calibrated-risk row. */
  lowest: CalibratedRiskRow;
  /** Lookup helper: get the calibrated row for a 1-digit ISCO code. */
  byIscoCode: (code: string) => CalibratedRiskRow | undefined;
}

/**
 * Calibrated automation risk per ISCO-08 major group for the active country.
 *
 * Pipeline:
 *   base_FO  ×  lmic_calibration  ×  informality_dampener  ×  wage_factor
 *
 * Live World Bank values (informality %, GDP/cap) override the static
 * fallback config when available — see useWorldBankStats.
 *
 * Pass an explicit `countryKey` to compute risk for a specific country
 * instead of the active one (useful for comparison views).
 */
export function useCalibratedRisk(countryKey?: CountryKey): UseCalibratedRiskResult {
  const activeKey = useAppStore((s) => s.country);
  const key = countryKey ?? activeKey;
  const { stats, loading } = useCountryStats(key);
  const country = useMemo(() => mergeWithStats(key, stats), [key, stats]);

  const rows = useMemo<CalibratedRiskRow[]>(() => {
    return iscoMajorGroups.map((group) => {
      const ctx = {
        lmic_calibration: country.lmic_calibration,
        informality_pct: country.informal_employment_pct,
        gdp_per_capita_usd: (country as any).gdp_per_capita_usd ?? null,
      };
      const range = calibrateRiskRange(group.base_risk, ctx);
      return {
        group,
        base: group.base_risk,
        calibrated: range.mid,
        band: riskBand(range.mid),
        low: range.low,
        high: range.high,
        halfWidthPp: range.halfWidthPp,
      };
    });
  }, [country]);

  const meanCalibrated = rows.reduce((a, r) => a + r.calibrated, 0) / rows.length;
  const meanBase = rows.reduce((a, r) => a + r.base, 0) / rows.length;
  const sorted = [...rows].sort((a, b) => b.calibrated - a.calibrated);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  const byIscoCode = (code: string) => rows.find((r) => r.group.code === code);

  // Cast `country` to satisfy the active-country return shape regardless of
  // whether the caller passed an explicit key — both branches share the
  // merged shape from mergeWithStats().
  return {
    country: country as ReturnType<typeof useActiveCountry>,
    loading,
    rows,
    meanCalibrated,
    meanBase,
    calibrationDeltaPp: calibrationDeltaPp(meanBase, meanCalibrated),
    highest,
    lowest,
    byIscoCode,
  };
}

/**
 * Canonical calibration delta convention used everywhere in the app.
 * delta_pp = (base − calibrated) × 100.
 *   • positive  → calibrated is BELOW base (country LMIC dampening) → render "−X pp"
 *   • negative  → calibrated is ABOVE base                            → render "+X pp"
 * Inputs are 0..1 probabilities (not percentages).
 */
export function calibrationDeltaPp(base: number, calibrated: number): number {
  return (base - calibrated) * 100;
}

/** Formats a calibration delta as a signed "vs base" label, e.g. "−12 pp vs base". */
export function formatCalibrationDeltaPp(
  base: number,
  calibrated: number,
  fractionDigits = 1
): { signed: string; direction: "below" | "above" | "equal"; valuePp: number } {
  const d = calibrationDeltaPp(base, calibrated);
  const direction = d > 0 ? "below" : d < 0 ? "above" : "equal";
  const sign = d > 0 ? "−" : d < 0 ? "+" : "±";
  return { signed: `${sign}${Math.abs(d).toFixed(fractionDigits)} pp`, direction, valuePp: d };
}
