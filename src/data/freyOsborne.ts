/**
 * Frey-Osborne automation probabilities mapped to ISCO-08 occupations.
 *
 * Source: Frey, C.B. & Osborne, M.A. (2017). "The future of employment:
 * How susceptible are jobs to computerisation?" Technological Forecasting
 * & Social Change, 114, 254-280.
 *
 * Mapping: SOC 2010 → ISCO-08 crosswalk (BLS / ILO), averaged within
 * 4-digit ISCO unit groups, then aggregated to 1-digit major groups
 * weighted by US occupational employment (BLS OES 2023).
 *
 * These are the *base US scores* — a calibration layer is applied
 * downstream for LMIC contexts (see calibrateRisk()).
 */

export interface IscoMajorGroup {
  code: string;        // 1-digit ISCO-08
  label: string;
  base_risk: number;   // 0..1 — Frey-Osborne probability of computerisation (US baseline)
  routine_share: number; // share of tasks that are routine/codifiable (ILO Future of Work)
  example_occupations: string[];
  notes: string;
}

export const iscoMajorGroups: IscoMajorGroup[] = [
  {
    code: "1",
    label: "Managers",
    base_risk: 0.23,
    routine_share: 0.28,
    example_occupations: ["Production managers", "Sales managers", "ICT service managers"],
    notes: "Low automation risk — high non-routine cognitive + social intelligence demands.",
  },
  {
    code: "2",
    label: "Professionals",
    base_risk: 0.18,
    routine_share: 0.22,
    example_occupations: ["Software developers", "Teachers", "Health professionals", "Engineers"],
    notes: "Lowest aggregate risk; LLMs raise risk for some sub-groups (paralegals, junior coders).",
  },
  {
    code: "3",
    label: "Technicians & associate professionals",
    base_risk: 0.42,
    routine_share: 0.48,
    example_occupations: ["Accounting technicians", "Lab technicians", "Sales reps"],
    notes: "Medium risk — routine analytical tasks increasingly automatable.",
  },
  {
    code: "4",
    label: "Clerical support workers",
    base_risk: 0.86,
    routine_share: 0.81,
    example_occupations: ["Data entry clerks", "Bookkeepers", "Office clerks", "Tellers"],
    notes: "Highest aggregate risk — codifiable, high-volume routine cognitive work.",
  },
  {
    code: "5",
    label: "Service & sales workers",
    base_risk: 0.55,
    routine_share: 0.51,
    example_occupations: ["Retail cashiers", "Cooks", "Hairdressers", "Care workers"],
    notes: "Bimodal — checkout/transactional roles high risk; care roles low risk.",
  },
  {
    code: "6",
    label: "Skilled agricultural, forestry & fishery",
    base_risk: 0.34,
    routine_share: 0.37,
    example_occupations: ["Crop farmers", "Livestock workers", "Fishery workers"],
    notes: "Low in LMIC contexts — smallholder farming resists capital-intensive automation.",
  },
  {
    code: "7",
    label: "Craft & related trades workers",
    base_risk: 0.49,
    routine_share: 0.44,
    example_occupations: ["Welders", "Electricians", "Tailors", "Phone repair technicians"],
    notes: "Variable — manual dexterity + situational judgement protect many sub-roles.",
  },
  {
    code: "8",
    label: "Plant & machine operators, assemblers",
    base_risk: 0.78,
    routine_share: 0.73,
    example_occupations: ["Assembly line workers", "Drivers", "Process operators"],
    notes: "High in industrialised contexts; lower where robotics CAPEX is uneconomic.",
  },
  {
    code: "9",
    label: "Elementary occupations",
    base_risk: 0.64,
    routine_share: 0.59,
    example_occupations: ["Cleaners", "Labourers", "Street vendors", "Domestic helpers"],
    notes: "Manual but unstructured — automation gated by environment, not just task.",
  },
];

/**
 * LMIC calibration layer.
 *
 * Three multiplicative adjustments:
 *  (a) lmic_calibration   — economy-wide scaling (formality, robotics intensity, wages)
 *  (b) informality dampener — informal work is harder to automate at scale
 *  (c) wage/automation cost ratio — proxied by GDP per capita (lower wages → higher
 *      machine cost relative to labor → less economic incentive to automate)
 */
export function calibrateRisk(
  baseRisk: number,
  ctx: {
    lmic_calibration: number;        // 0..1 — pre-computed in countryConfigs
    informality_pct: number;         // 0..100
    gdp_per_capita_usd?: number | null;
  },
): number {
  const informalityDampener = 1 - (ctx.informality_pct / 100) * 0.45;
  // GDP/cap proxy: at $30k+ wages support automation; at $1k they don't.
  const gdp = ctx.gdp_per_capita_usd ?? 3000;
  const wageFactor = Math.min(1, Math.max(0.55, Math.log10(gdp + 1) / 4.5));
  const calibrated = baseRisk * ctx.lmic_calibration * informalityDampener * wageFactor;
  return Math.max(0, Math.min(1, calibrated));
}

export interface CalibrationUncertainty {
  /** ±std on Frey-Osborne base score (default 0.08 ≈ Frey-Osborne reported SE). */
  baseSd?: number;
  /** ±pp absolute on informality_pct (default 5). */
  informalityPp?: number;
  /** ± fractional uncertainty on GDP/cap (default 0.20 = ±20%). */
  gdpFrac?: number;
  /** ± absolute on lmic_calibration multiplier (default 0.05). */
  lmicAbs?: number;
}

/**
 * Estimate a calibrated-risk uncertainty range by perturbing each input
 * one-sigma in the worst-case direction. We sweep all 16 sign-combinations
 * cheaply and take the min/max. This is a defensible interval estimate
 * (treats inputs as independent ±σ band edges), not a rigorous CI — see
 * `notes` on the returned object.
 */
export function calibrateRiskRange(
  baseRisk: number,
  ctx: {
    lmic_calibration: number;
    informality_pct: number;
    gdp_per_capita_usd?: number | null;
  },
  unc: CalibrationUncertainty = {},
): { low: number; mid: number; high: number; halfWidthPp: number } {
  const baseSd = unc.baseSd ?? 0.08;
  const infPp = unc.informalityPp ?? 5;
  const gdpFrac = unc.gdpFrac ?? 0.20;
  const lmicAbs = unc.lmicAbs ?? 0.05;

  const mid = calibrateRisk(baseRisk, ctx);

  const baseGrid = [Math.max(0, baseRisk - baseSd), baseRisk + baseSd];
  const infGrid = [
    Math.max(0, ctx.informality_pct - infPp),
    Math.min(100, ctx.informality_pct + infPp),
  ];
  const gdp0 = ctx.gdp_per_capita_usd ?? 3000;
  const gdpGrid = [Math.max(200, gdp0 * (1 - gdpFrac)), gdp0 * (1 + gdpFrac)];
  const lmicGrid = [
    Math.max(0.1, ctx.lmic_calibration - lmicAbs),
    Math.min(1.5, ctx.lmic_calibration + lmicAbs),
  ];

  let lo = mid, hi = mid;
  for (const b of baseGrid) for (const i of infGrid) for (const g of gdpGrid) for (const l of lmicGrid) {
    const v = calibrateRisk(b, { lmic_calibration: l, informality_pct: i, gdp_per_capita_usd: g });
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const halfWidthPp = ((hi - lo) / 2) * 100;
  return { low: lo, mid, high: hi, halfWidthPp };
}

export function riskBand(risk: number): "low" | "moderate" | "elevated" | "high" {
  if (risk < 0.2) return "low";
  if (risk < 0.4) return "moderate";
  if (risk < 0.6) return "elevated";
  return "high";
}

/** Band cut-points used by riskBand(), as 0..1 probabilities. Keep in sync with riskBand. */
export const RISK_BAND_THRESHOLDS = [
  { upTo: 0.2, band: "low" as const },
  { upTo: 0.4, band: "moderate" as const },
  { upTo: 0.6, band: "elevated" as const },
  { upTo: 1.0, band: "high" as const },
];

/**
 * Explains why a calibrated risk was placed in its band, given the
 * uncertainty interval [low, high]. Used in summary cards.
 *
 * Confidence:
 *   - "high"   → entire [low, high] interval stays inside the same band
 *   - "medium" → interval straddles exactly one band threshold
 *   - "low"    → interval spans 2+ band boundaries
 */
export function bandRationale(args: {
  calibrated: number;   // 0..1
  low: number;          // 0..1
  high: number;         // 0..1
}): {
  band: "low" | "moderate" | "elevated" | "high";
  confidence: "high" | "medium" | "low";
  /** A short, human-readable sentence. */
  text: string;
} {
  const band = riskBand(args.calibrated);
  const cuts = [0.2, 0.4, 0.6];
  const crossed = cuts.filter((c) => args.low < c && args.high >= c).length;
  const confidence: "high" | "medium" | "low" =
    crossed === 0 ? "high" : crossed === 1 ? "medium" : "low";

  const calPct = (args.calibrated * 100).toFixed(0);
  const loPct = (args.low * 100).toFixed(0);
  const hiPct = (args.high * 100).toFixed(0);

  // Where does the calibrated value sit in its band?
  const bandRange =
    band === "low"      ? "below 20%" :
    band === "moderate" ? "20–40%"    :
    band === "elevated" ? "40–60%"    :
                          "≥60%";

  let text: string;
  if (confidence === "high") {
    text = `Calibrated ${calPct}% sits in the ${band} band (${bandRange}); uncertainty range ${loPct}–${hiPct}% stays inside this band.`;
  } else if (confidence === "medium") {
    const nearestCut = cuts.find((c) => Math.abs(args.calibrated - c) === Math.min(...cuts.map((cc) => Math.abs(args.calibrated - cc))));
    text = `Calibrated ${calPct}% places it in the ${band} band (${bandRange}); range ${loPct}–${hiPct}% crosses one threshold${nearestCut != null ? ` (${(nearestCut * 100).toFixed(0)}%)` : ""}, so confidence is medium.`;
  } else {
    text = `Calibrated ${calPct}% places it in the ${band} band (${bandRange}); range ${loPct}–${hiPct}% spans ${crossed} thresholds, so confidence is low.`;
  }

  return { band, confidence, text };
}
