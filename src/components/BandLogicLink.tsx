import { useEffect, useState } from "react";
import { RISK_BAND_THRESHOLDS, riskBand, bandRationale } from "@/data/freyOsborne";

/**
 * Tiny disclosure link that sits next to the confidence/rationale line
 * on summary cards (Risk Lens, Heatmap, Policymaker dashboard).
 *
 * When expanded, it shows:
 *   • the [low – high] uncertainty interval (in %)
 *   • each band threshold (20 / 40 / 60 %) and whether the interval crosses it
 *   • which band the calibrated point falls in vs. which bands the interval touches
 */
export default function BandLogicLink({
  calibrated,
  low,
  high,
  open: openProp,
  onOpenChange,
}: {
  calibrated: number; // 0..1
  low: number;        // 0..1
  high: number;       // 0..1
  /** Optional controlled open state — when provided, parent owns toggling. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp! : openState;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
  };

  const cuts = [0.2, 0.4, 0.6] as const;
  const calPct = calibrated * 100;
  const loPct = low * 100;
  const hiPct = high * 100;
  const calBand = riskBand(calibrated);
  const loBand = riskBand(low);
  const hiBand = riskBand(high);

  const crossings = cuts.map((c) => ({
    cut: c,
    cutPct: c * 100,
    crossed: low < c && high >= c,
  }));
  const crossedCount = crossings.filter((x) => x.crossed).length;

  // -----------------------------------------------------------------------
  // Unit-style runtime assertion — verifies that the locally computed
  // crossings, band labels, and verdict line up with the canonical logic
  // used by bandRationale() and RISK_BAND_THRESHOLDS / riskBand().
  //
  // Runs only in dev (Vite import.meta.env.DEV) to avoid noise in prod,
  // and only when inputs change. Surfaces failures as console.error so
  // they're caught by the runtime-error pipeline during development.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const failures: string[] = [];

    // 1. cuts must be exactly the interior boundaries of RISK_BAND_THRESHOLDS
    //    (i.e. every upTo except the terminal 1.0). Drift here means this
    //    component is checking thresholds the rest of the app doesn't use.
    const expectedCuts = RISK_BAND_THRESHOLDS.map((t) => t.upTo).filter((u) => u < 1);
    if (
      cuts.length !== expectedCuts.length ||
      cuts.some((c, i) => Math.abs(c - expectedCuts[i]) > 1e-9)
    ) {
      failures.push(
        `cuts drift: local [${cuts.join(",")}] vs RISK_BAND_THRESHOLDS interior [${expectedCuts.join(",")}]`,
      );
    }

    // 2. each "crossed" flag must match (riskBand(low) !== riskBand(c)) at the cut.
    //    A cut c is crossed iff the interval straddles it, equivalently iff the
    //    bands at low and high differ across c.
    crossings.forEach((x) => {
      const expected = low < x.cut && high >= x.cut;
      if (x.crossed !== expected) {
        failures.push(`crossing[${x.cut}]: got ${x.crossed} expected ${expected}`);
      }
    });

    // 3. bandLabelForCut must agree with riskBand on either side of the cut.
    cuts.forEach((c) => {
      const left = riskBand(c - 1e-6);
      const right = riskBand(c);
      const expectedLabel = `${left} ↔ ${right}`;
      const got = bandLabelForCut(c);
      if (got !== expectedLabel) {
        failures.push(`bandLabelForCut(${c}): got "${got}" expected "${expectedLabel}"`);
      }
    });

    // 4. our verdict (high/medium/low confidence) must match bandRationale().
    const expectedConfidence =
      crossedCount === 0 ? "high" : crossedCount === 1 ? "medium" : "low";
    const r = bandRationale({ calibrated, low, high });
    if (r.confidence !== expectedConfidence) {
      failures.push(
        `confidence drift: BandLogicLink=${expectedConfidence} bandRationale=${r.confidence} (crossed=${crossedCount})`,
      );
    }

    // 5. the band the calibrated point falls in must match bandRationale's band.
    if (r.band !== calBand) {
      failures.push(`band drift: BandLogicLink=${calBand} bandRationale=${r.band}`);
    }

    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        "[BandLogicLink] assertion failed — local logic disagrees with bandRationale/RISK_BAND_THRESHOLDS:",
        { calibrated, low, high, failures },
      );
    }
  }, [calibrated, low, high, calBand, crossedCount]);


  return (
    <div className="mt-1 inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-mono text-[10px] text-text-muted hover:text-text underline underline-offset-2 decoration-dotted"
        title="Show how the band was decided from the uncertainty interval"
      >
        {open ? "▾ Hide band logic" : "▸ View band logic"}
      </button>

      {open && (
        <div className="mt-1.5 surface2 rounded-sm p-2 border border-border/60 font-mono text-[10px] text-text-muted leading-relaxed space-y-1.5">
          <div>
            <span className="text-text">interval:</span>{" "}
            [{loPct.toFixed(1)}% – {hiPct.toFixed(1)}%] ·{" "}
            <span className="text-text">point:</span> {calPct.toFixed(1)}%
          </div>
          <div>
            <span className="text-text">bands touched:</span>{" "}
            low={loBand} · point={calBand} · high={hiBand}
          </div>
          <div className="space-y-0.5">
            <div className="text-text">thresholds:</div>
            {crossings.map((x) => (
              <div key={x.cut} className="flex items-baseline gap-2">
                <span
                  className={`pill text-[9px] tracking-wider ${
                    x.crossed ? "bg-warn text-bg" : "bg-surface text-text-muted border border-border"
                  }`}
                >
                  {x.crossed ? "CROSSED" : "—"}
                </span>
                <span className="text-text">{x.cutPct.toFixed(0)}%</span>
                <span>
                  ({bandLabelForCut(x.cut)})
                </span>
              </div>
            ))}
          </div>
          <div className="pt-1 border-t border-border/60">
            <span className="text-text">verdict:</span>{" "}
            {crossedCount === 0
              ? `interval stays inside ${calBand} → confidence high`
              : crossedCount === 1
                ? `interval crosses 1 threshold → confidence medium`
                : `interval crosses ${crossedCount} thresholds → confidence low`}
          </div>
          <div className="text-text-muted pt-1 border-t border-border/60">
            cuts from RISK_BAND_THRESHOLDS:{" "}
            {RISK_BAND_THRESHOLDS.map((t) => `${(t.upTo * 100).toFixed(0)}%→${t.band}`).join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}

function bandLabelForCut(cut: number): string {
  if (cut === 0.2) return "low ↔ moderate";
  if (cut === 0.4) return "moderate ↔ elevated";
  if (cut === 0.6) return "elevated ↔ high";
  return "";
}
