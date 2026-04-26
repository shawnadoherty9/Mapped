/**
 * Safe CSV export helpers for ISCO calibrated-risk rows.
 *
 * Goals:
 * - Never throw on missing/null/NaN/Infinite fields.
 * - Always emit a parseable CSV with the expected columns.
 * - Surface data-quality issues as `# warnings` metadata + a per-row `quality` flag
 *   ("ok" | "partial" | "fallback") so downstream consumers can audit.
 */

export type RawIscoRow = {
  code?: string | number | null;
  label?: string | null;
  // Accept either nested {group:{code,label}} or flat code/label.
  group?: { code?: string | number | null; label?: string | null } | null;
  base?: number | null;
  base_risk?: number | null;
  calibrated?: number | null;
  calibrated_risk?: number | null;
  band?: string | null;
} & Record<string, unknown>;

export type SanitizedIscoRow = {
  code: string;
  label: string;
  base: number;       // 0..1
  calibrated: number; // 0..1
  band: "Low" | "Moderate" | "Elevated" | "High";
  quality: "ok" | "partial" | "fallback";
};

const FALLBACK_CODE = "UNKNOWN";
const FALLBACK_LABEL = "Unspecified occupation";

export function bandFor(risk: number): SanitizedIscoRow["band"] {
  if (!Number.isFinite(risk)) return "Low";
  if (risk >= 0.6) return "High";
  if (risk >= 0.4) return "Elevated";
  if (risk >= 0.2) return "Moderate";
  return "Low";
}

function coerceFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Clamp a probability to [0,1]; treats >1 as already-percentage and divides by 100. */
function coerceProbability(v: unknown): number | null {
  const n = coerceFinite(v);
  if (n === null) return null;
  const p = n > 1.0001 && n <= 100 ? n / 100 : n;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

export type SanitizeResult = {
  rows: SanitizedIscoRow[];
  warnings: string[];
};

export function sanitizeIscoRows(input: unknown): SanitizeResult {
  const warnings: string[] = [];
  if (!Array.isArray(input)) {
    warnings.push("input_not_array: emitted empty dataset");
    return { rows: [], warnings };
  }

  let missingCode = 0;
  let missingLabel = 0;
  let missingBase = 0;
  let missingCalibrated = 0;
  let derivedBand = 0;
  let totalFallback = 0;

  const rows: SanitizedIscoRow[] = input.map((raw, idx) => {
    const r = (raw ?? {}) as RawIscoRow;
    const rawCode = r.code ?? r.group?.code;
    const rawLabel = r.label ?? r.group?.label;

    let quality: SanitizedIscoRow["quality"] = "ok";

    let code: string;
    if (rawCode === null || rawCode === undefined || String(rawCode).trim() === "") {
      code = `${FALLBACK_CODE}_${idx}`;
      missingCode++;
      quality = "partial";
    } else {
      code = String(rawCode);
    }

    let label: string;
    if (!rawLabel || String(rawLabel).trim() === "") {
      label = FALLBACK_LABEL;
      missingLabel++;
      quality = "partial";
    } else {
      label = String(rawLabel);
    }

    const baseSrc = r.base ?? r.base_risk;
    const calSrc = r.calibrated ?? r.calibrated_risk;

    let base = coerceProbability(baseSrc);
    let calibrated = coerceProbability(calSrc);

    if (base === null && calibrated === null) {
      // Nothing usable — emit zeroed row so CSV stays parseable.
      base = 0;
      calibrated = 0;
      missingBase++;
      missingCalibrated++;
      quality = "fallback";
      totalFallback++;
    } else if (base === null) {
      base = calibrated as number;
      missingBase++;
      quality = quality === "ok" ? "partial" : quality;
    } else if (calibrated === null) {
      calibrated = base;
      missingCalibrated++;
      quality = quality === "ok" ? "partial" : quality;
    }

    let band: SanitizedIscoRow["band"];
    const validBands: SanitizedIscoRow["band"][] = ["Low", "Moderate", "Elevated", "High"];
    if (r.band && validBands.includes(r.band as SanitizedIscoRow["band"])) {
      band = r.band as SanitizedIscoRow["band"];
    } else {
      band = bandFor(calibrated);
      derivedBand++;
      if (quality === "ok") quality = "partial";
    }

    return { code, label, base, calibrated, band, quality };
  });

  if (missingCode) warnings.push(`missing_code: ${missingCode} row(s) — substituted UNKNOWN_<index>`);
  if (missingLabel) warnings.push(`missing_label: ${missingLabel} row(s) — substituted "${FALLBACK_LABEL}"`);
  if (missingBase) warnings.push(`missing_base_risk: ${missingBase} row(s) — fell back to calibrated value`);
  if (missingCalibrated) warnings.push(`missing_calibrated_risk: ${missingCalibrated} row(s) — fell back to base value`);
  if (derivedBand) warnings.push(`band_derived_from_calibrated: ${derivedBand} row(s)`);
  if (totalFallback) warnings.push(`fully_fallback_rows: ${totalFallback} row(s) had neither base nor calibrated`);

  return { rows, warnings };
}

const csvEscape = (v: string | number) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Provenance describing exactly which inputs the calibration pipeline used.
 * Mirrors the on-screen "Calibration factors" panel so the CSV is auditable.
 *
 * Each indicator carries:
 *  - source: "live" | "fallback" | "missing"
 *  - sourceYear: WB reporting year of the observation actually used
 *  - dataset: human label of the dataset (e.g. "WB WDI · NY.GDP.PCAP.CD")
 *  - value: the numeric value the calculation actually consumed
 */
export type FieldProvenanceLite = {
  value: number | null;
  source: "live" | "fallback" | "missing";
  sourceYear: number | null;
  dataset: string;
};

export type CalibrationProvenance = {
  country: { name: string; code: string };
  /** "latest" = most recent non-null WB obs; "exact" = pinned to a specific year. */
  yearMode: "latest" | "exact";
  /** Year requested when yearMode === "exact"; null otherwise. */
  requestedYear: number | null;
  /** ISO timestamp of the WB fetch that produced these values; null when fully fallback. */
  fetchedAt: string | null;
  /** Country-level calibration constant (static config). */
  lmicCalibration: number;
  fields: {
    informal_employment_pct: FieldProvenanceLite;
    gdp_per_capita_usd: FieldProvenanceLite;
  };
};

export type IscoCsvOptions = {
  meta?: string[];          // pre-formatted "# key,value" lines (without leading #)
  asPercent?: boolean;      // emit base/calibrated as 0–100 (4dp). Default false (0–1, 4dp).
  includeQuality?: boolean; // append a per-row `quality` column. Default true.
  /** When supplied, emits standardized provenance meta + per-row provenance columns. */
  calibrationProvenance?: CalibrationProvenance;
};

/** Build the standardized "# calib_*" header rows that document calibration inputs. */
export function buildCalibrationProvenanceMeta(p: CalibrationProvenance): string[] {
  const fmt = (v: number | null) =>
    v === null || v === undefined || !Number.isFinite(v) ? "n/a" : String(v);
  const ifm = p.fields.informal_employment_pct;
  const gdp = p.fields.gdp_per_capita_usd;
  return [
    `# calib_country,${p.country.name} (${p.country.code})`,
    `# calib_year_mode,${p.yearMode}`,
    `# calib_requested_year,${p.requestedYear ?? "n/a"}`,
    `# calib_fetched_at,${p.fetchedAt ?? "n/a"}`,
    `# calib_lmic_calibration,${p.lmicCalibration}`,
    `# calib_informality_value_pct,${fmt(ifm.value)}`,
    `# calib_informality_source,${ifm.source}`,
    `# calib_informality_source_year,${ifm.sourceYear ?? "n/a"}`,
    `# calib_informality_dataset,${ifm.dataset}`,
    `# calib_gdp_per_capita_usd_value,${fmt(gdp.value)}`,
    `# calib_gdp_per_capita_usd_source,${gdp.source}`,
    `# calib_gdp_per_capita_usd_source_year,${gdp.sourceYear ?? "n/a"}`,
    `# calib_gdp_per_capita_usd_dataset,${gdp.dataset}`,
  ];
}

export function buildIscoCsv(rawRows: unknown, opts: IscoCsvOptions = {}): string {
  const { rows, warnings } = sanitizeIscoRows(rawRows);
  const asPercent = opts.asPercent ?? false;
  const includeQuality = opts.includeQuality ?? true;
  const prov = opts.calibrationProvenance;

  const fmt = (n: number) => (asPercent ? (n * 100).toFixed(4) : n.toFixed(4));
  const valueUnit = asPercent ? "pct" : "ratio";

  const headerCols = [
    "isco_code",
    "isco_label",
    `base_us_risk_${valueUnit}`,
    `calibrated_risk_${valueUnit}`,
    "band",
  ];
  if (includeQuality) headerCols.push("quality");
  if (prov) {
    // Same value repeats on every row so the CSV is self-contained per row, even
    // when filtered/joined downstream without the metadata header.
    headerCols.push(
      "calib_country_code",
      "calib_year_mode",
      "calib_source_year",
      "calib_lmic_calibration",
      "calib_informality_pct",
      "calib_informality_source",
      "calib_informality_source_year",
      "calib_gdp_per_capita_usd",
      "calib_gdp_per_capita_usd_source",
      "calib_gdp_per_capita_usd_source_year",
    );
  }

  const metaLines: string[] = [];
  (opts.meta ?? []).forEach((m) => {
    const line = m.startsWith("#") ? m : `# ${m}`;
    metaLines.push(line);
  });
  if (prov) {
    metaLines.push(...buildCalibrationProvenanceMeta(prov));
  }
  metaLines.push(`# value_unit,${valueUnit}`);
  metaLines.push(`# row_count,${rows.length}`);
  metaLines.push(`# generated_at,${new Date().toISOString()}`);
  if (warnings.length === 0) {
    metaLines.push(`# warnings,none`);
  } else {
    metaLines.push(`# warnings,${warnings.length}`);
    warnings.forEach((w) => metaLines.push(`# warning,${csvEscape(w)}`));
  }

  // Choose the "row-level source year" once: the requested year in exact mode,
  // otherwise the most recent reporting year across the two indicators.
  const rowSourceYear = prov
    ? (prov.yearMode === "exact"
        ? prov.requestedYear
        : Math.max(
            prov.fields.informal_employment_pct.sourceYear ?? 0,
            prov.fields.gdp_per_capita_usd.sourceYear ?? 0,
          ) || null)
    : null;

  const dataLines = rows.map((r) => {
    const cols: (string | number)[] = [r.code, r.label, fmt(r.base), fmt(r.calibrated), r.band];
    if (includeQuality) cols.push(r.quality);
    if (prov) {
      const ifm = prov.fields.informal_employment_pct;
      const gdp = prov.fields.gdp_per_capita_usd;
      cols.push(
        prov.country.code,
        prov.yearMode,
        rowSourceYear ?? "",
        prov.lmicCalibration,
        ifm.value ?? "",
        ifm.source,
        ifm.sourceYear ?? "",
        gdp.value ?? "",
        gdp.source,
        gdp.sourceYear ?? "",
      );
    }
    return cols.map(csvEscape).join(",");
  });

  return [...metaLines, headerCols.join(","), ...dataLines].join("\n");
}

/**
 * Build + download in one call. Returns a summary so callers can surface
 * a confirmation toast with the actual filename, row count, and warnings.
 */
export type IscoExportSummary = {
  filename: string;
  rowCount: number;
  warningCount: number;
  warnings: string[];
  bytes: number;
};

export function buildAndDownloadIscoCsv(
  rawRows: unknown,
  filename: string,
  opts: IscoCsvOptions = {},
): IscoExportSummary {
  const { rows, warnings } = sanitizeIscoRows(rawRows);
  // Re-run buildIscoCsv to keep formatting identical (cheap; rows already validated).
  const csv = buildIscoCsv(rawRows, opts);
  downloadCsv(csv, filename);
  return {
    filename,
    rowCount: rows.length,
    warningCount: warnings.length,
    warnings,
    bytes: csv.length,
  };
}

export function downloadCsv(csv: string, filename: string): void {
  try {
    const blob = new Blob([csv ?? ""], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    // Last-resort fallback: open as data URI so the download still completes.
    // eslint-disable-next-line no-console
    console.error("[csvExport] Blob download failed, falling back to data URI", err);
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv ?? "")}`;
    a.download = filename;
    a.click();
  }
}

/** Format byte size for human-readable toast descriptions. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Extract a CalibrationProvenance object from the merged-country shape returned
 * by `useActiveCountry()` (i.e. the result of `mergeWithStats`). Tolerant of
 * missing `_provenance` — falls back to "fallback" sources.
 */
export function provenanceFromMergedCountry(c: any): CalibrationProvenance {
  const p = c?._provenance ?? {};
  const ifm = p.informal_employment_pct ?? {
    value: c?.informal_employment_pct ?? null,
    source: "fallback",
    sourceYear: null,
    dataset: "Static country config",
  };
  const gdp = p.gdp_per_capita_usd ?? {
    value: c?.gdp_per_capita_usd ?? null,
    source: "fallback",
    sourceYear: null,
    dataset: "Static / hardcoded fallback",
  };
  return {
    country: { name: c?.name ?? "Unknown", code: c?.code ?? "??" },
    yearMode: c?._yearMode ?? "latest",
    requestedYear: c?._requestedYear ?? null,
    fetchedAt: c?._fetchedAt ?? null,
    lmicCalibration: c?.lmic_calibration ?? 1,
    fields: {
      informal_employment_pct: {
        value: ifm.value ?? null,
        source: ifm.source ?? "missing",
        sourceYear: ifm.sourceYear ?? null,
        dataset: ifm.dataset ?? "",
      },
      gdp_per_capita_usd: {
        value: gdp.value ?? null,
        source: gdp.source ?? "missing",
        sourceYear: gdp.sourceYear ?? null,
        dataset: gdp.dataset ?? "",
      },
    },
  };
}

