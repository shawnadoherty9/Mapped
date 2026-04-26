import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountryKey, countryConfigs, countryKeys } from "@/data/countryConfigs";
import { useCalibratedRisk } from "@/hooks/useCalibratedRisk";
import { iscoMajorGroups } from "@/data/freyOsborne";
import { ArrowRightLeft, Bookmark, BookmarkCheck, X } from "lucide-react";
import { useSavedComparisons, type SavedComparison } from "@/hooks/useSavedComparisons";
import { toast } from "@/hooks/use-toast";

type Preset = { label: string; a: CountryKey; b: CountryKey };
const PRESETS: Preset[] = [
  { label: "Ghana ↔ Kenya", a: "ghana", b: "kenya" },
  { label: "Ghana ↔ Bangladesh", a: "ghana", b: "bangladesh" },
  { label: "India ↔ Vietnam", a: "india", b: "vietnam" },
  { label: "Nigeria ↔ South Africa", a: "nigeria", b: "south_africa" },
  { label: "Brazil ↔ Mexico", a: "brazil", b: "mexico" },
];

const bandColor = (band: string) =>
  band === "low" ? "hsl(140,65%,38%)" :
  band === "moderate" ? "hsl(70,65%,36%)" :
  band === "elevated" ? "hsl(30,65%,34%)" : "hsl(0,65%,30%)";

export default function CountryComparison() {
  const [a, setA] = useState<CountryKey>("ghana");
  const [b, setB] = useState<CountryKey>("kenya");
  const [deltaMode, setDeltaMode] = useState<"AminusB" | "BminusA">("AminusB");

  const left = useCalibratedRisk(a);
  const right = useCalibratedRisk(b);

  const swap = () => { const tmp = a; setA(b); setB(tmp); };

  // Sign multiplier so the rest of the component can keep using (A − B) math.
  const sign = deltaMode === "AminusB" ? 1 : -1;
  const deltaLabel = deltaMode === "AminusB"
    ? `${left.country.code} − ${right.country.code}`
    : `${right.country.code} − ${left.country.code}`;

  // Saved comparisons (per-device).
  const { items: saved, loading: savedLoading, save, remove } = useSavedComparisons();
  const isCurrentSaved = saved.some(
    (s) => s.country_a === a && s.country_b === b && s.delta_mode === deltaMode,
  );

  const handleSave = async () => {
    const row = await save({
      country_a: a,
      country_b: b,
      delta_mode: deltaMode,
      name: `${countryConfigs[a].name} ↔ ${countryConfigs[b].name}`,
    });
    toast({
      title: row && !isCurrentSaved ? "Comparison saved" : "Already saved",
      description: `${countryConfigs[a].name} ↔ ${countryConfigs[b].name} (${deltaLabel})`,
    });
  };

  const loadSaved = (s: SavedComparison) => {
    setA(s.country_a);
    setB(s.country_b);
    setDeltaMode(s.delta_mode);
  };

  const handleRemove = async (s: SavedComparison) => {
    const ok = await remove(s.id);
    toast({
      title: ok ? "Removed from saved" : "Could not remove",
      description: `${countryConfigs[s.country_a].name} ↔ ${countryConfigs[s.country_b].name}`,
      variant: ok ? "default" : "destructive",
    });
  };

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-sm font-display">Country comparison · calibrated risk by ISCO</CardTitle>
            <p className="text-text-muted text-xs mt-1">
              Side-by-side calibrated automation risk for any two countries, per ISCO major group.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => { setA(p.a); setB(p.b); }}
                className={`pill border text-[10px] font-mono ${
                  (a === p.a && b === p.b) || (a === p.b && b === p.a)
                    ? "border-brand text-brand bg-brand/10"
                    : "border-border text-text-muted hover:text-text"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selectors */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mt-3">
          <CountrySelect value={a} onChange={setA} accent="brand" />
          <button
            onClick={swap}
            className="surface2 border border-border rounded-sm p-2 hover:border-brand transition-colors"
            title="Swap"
          >
            <ArrowRightLeft size={12} className="text-text-muted" />
          </button>
          <CountrySelect value={b} onChange={setB} accent="teal" />
        </div>

        {/* Delta direction toggle */}
        <div className="flex items-center gap-2 mt-3">
          <span className="font-mono text-[10px] text-text-muted">Δ direction</span>
          <div
            role="tablist"
            aria-label="Delta calculation direction"
            className="inline-flex rounded-sm border border-border bg-surface2 p-0.5"
          >
            <button
              role="tab"
              aria-selected={deltaMode === "AminusB"}
              onClick={() => setDeltaMode("AminusB")}
              className={`px-2.5 py-1 rounded-sm font-mono text-[10px] transition-colors ${
                deltaMode === "AminusB" ? "bg-brand/20 text-brand" : "text-text-muted hover:text-text"
              }`}
              title={`${left.country.code} − ${right.country.code}`}
            >
              {left.country.code} − {right.country.code}
            </button>
            <button
              role="tab"
              aria-selected={deltaMode === "BminusA"}
              onClick={() => setDeltaMode("BminusA")}
              className={`px-2.5 py-1 rounded-sm font-mono text-[10px] transition-colors ${
                deltaMode === "BminusA" ? "bg-teal/20 text-teal" : "text-text-muted hover:text-text"
              }`}
              title={`${right.country.code} − ${left.country.code}`}
            >
              {right.country.code} − {left.country.code}
            </button>
          </div>

          <button
            onClick={handleSave}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border font-mono text-[10px] transition-colors ${
              isCurrentSaved
                ? "border-brand bg-brand/10 text-brand"
                : "border-border bg-surface2 text-text hover:border-brand"
            }`}
            title={isCurrentSaved ? "Already in your saved comparisons" : "Save this comparison to revisit later"}
          >
            {isCurrentSaved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
            {isCurrentSaved ? "Saved" : "Save comparison"}
          </button>
        </div>

        {/* Saved comparisons (per-device) */}
        {(savedLoading || saved.length > 0) && (
          <div className="mt-3 surface2 rounded-sm p-2.5">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="label-mono text-text-muted flex items-center gap-1.5">
                <BookmarkCheck size={11} className="text-brand" />
                Saved on this device
              </div>
              <div className="font-mono text-[10px] text-text-muted">
                {savedLoading ? "loading…" : `${saved.length} saved`}
              </div>
            </div>
            {saved.length === 0 && !savedLoading ? null : (
              <div className="flex flex-wrap gap-1.5">
                {saved.map((s) => {
                  const active = s.country_a === a && s.country_b === b && s.delta_mode === deltaMode;
                  return (
                    <div
                      key={s.id}
                      className={`group inline-flex items-center gap-1 rounded-sm border pl-2 pr-1 py-0.5 font-mono text-[10px] ${
                        active
                          ? "border-brand bg-brand/10 text-brand"
                          : "border-border bg-surface text-text hover:border-brand"
                      }`}
                    >
                      <button
                        onClick={() => loadSaved(s)}
                        className="inline-flex items-center gap-1 cursor-pointer"
                        title={`Load · Δ ${s.delta_mode === "AminusB" ? `${s.country_a} − ${s.country_b}` : `${s.country_b} − ${s.country_a}`}`}
                      >
                        <span>{countryConfigs[s.country_a]?.name ?? s.country_a}</span>
                        <span className="text-text-muted">↔</span>
                        <span>{countryConfigs[s.country_b]?.name ?? s.country_b}</span>
                        <span className="text-text-muted">·</span>
                        <span className="text-text-muted">
                          {s.delta_mode === "AminusB" ? "A−B" : "B−A"}
                        </span>
                      </button>
                      <button
                        onClick={() => handleRemove(s)}
                        className="ml-0.5 p-0.5 rounded-sm text-text-muted hover:text-danger hover:bg-danger/10"
                        title="Remove"
                        aria-label={`Remove ${countryConfigs[s.country_a]?.name} ↔ ${countryConfigs[s.country_b]?.name}`}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Summary tiles — compact */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <SummaryTile
            label={`${left.country.code} · mean`}
            value={`${(left.meanCalibrated * 100).toFixed(0)}%`}
            color="hsl(var(--brand))"
          />
          <SummaryTile
            label={`Δ ${deltaLabel}`}
            value={`${((left.meanCalibrated - right.meanCalibrated) * 100 * sign).toFixed(1)} pp`}
            color="hsl(var(--text))"
          />
          <SummaryTile
            label={`${right.country.code} · mean`}
            value={`${(right.meanCalibrated * 100).toFixed(0)}%`}
            color="hsl(var(--teal))"
          />
        </div>

        {/* Compact legend — single line */}
        <div className="surface2 rounded-sm px-2.5 py-1.5 mb-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[10px] font-mono">
          <span className="text-text-muted">Risk band</span>
          <LegendSwatch color={bandColor("low")} label="Low" />
          <LegendSwatch color={bandColor("moderate")} label="Mod" />
          <LegendSwatch color={bandColor("elevated")} label="Elev" />
          <LegendSwatch color={bandColor("high")} label="High" />
          <span className="h-3 w-px bg-border mx-0.5" />
          <span className="inline-flex items-center gap-1 text-text-muted">
            <span className="inline-block w-px h-3 bg-text-muted/70" />
            US base
          </span>
          <span className="inline-flex items-center gap-1 text-text-muted">
            <span className="inline-block w-3 h-[2px] bg-text/70 rounded-full" />
            range
          </span>
        </div>

        {/* Per-ISCO comparison — vertically condensed */}
        <div className="space-y-1">
          {iscoMajorGroups.map((g) => {
            const ra = left.byIscoCode(g.code)!;
            const rb = right.byIscoCode(g.code)!;
            const aPct = ra.calibrated * 100;
            const bPct = rb.calibrated * 100;
            const delta = (aPct - bPct) * sign;
            const combinedHalfWidthPp = ra.halfWidthPp + rb.halfWidthPp;
            const significant = Math.abs(delta) > combinedHalfWidthPp;
            return (
              <div key={g.code} className="grid grid-cols-[96px_1fr_56px_1fr_46px] gap-1.5 items-center">
                <div className="font-mono text-[10px] leading-tight">
                  <span className="text-brand">ISCO-{g.code}</span>
                  <span className="text-text-muted ml-1 text-[9px]">{g.label}</span>
                </div>

                {/* A bar — right-aligned, grows leftward */}
                <div className="relative h-4 rounded-sm bg-surface2 overflow-hidden">
                  <div
                    className="absolute right-0 top-0 bottom-0 transition-all"
                    style={{ width: `${aPct}%`, backgroundColor: bandColor(ra.band) }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-px bg-text-muted/70 z-10"
                    style={{ right: `${g.base_risk * 100}%` }}
                    title={`US base ${(g.base_risk * 100).toFixed(0)}%`}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-text/70 rounded-full"
                    style={{
                      right: `${ra.low * 100}%`,
                      width: `${(ra.high - ra.low) * 100}%`,
                    }}
                    title={`Range ${(ra.low * 100).toFixed(0)}–${(ra.high * 100).toFixed(0)}%`}
                  />
                  <div className="absolute inset-0 flex items-center justify-end pr-1.5 font-mono text-[10px] text-text">
                    {aPct.toFixed(0)}%
                  </div>
                </div>

                {/* Delta — single line */}
                <div
                  className={`text-center font-mono text-[10px] leading-tight ${
                    Math.abs(delta) < 1 ? "text-text-muted" : delta > 0 ? "text-warn" : "text-teal"
                  }`}
                  title={`Δ ${delta.toFixed(1)}pp · combined uncertainty ±${combinedHalfWidthPp.toFixed(1)}pp · ${significant ? "exceeds noise" : "within noise"}`}
                >
                  <span>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}</span>
                  <span className={`ml-1 text-[9px] ${significant ? "text-text" : "text-text-muted/70"}`}>
                    {significant ? "▲" : "≈"}
                  </span>
                </div>

                {/* B bar — left-aligned */}
                <div className="relative h-4 rounded-sm bg-surface2 overflow-hidden">
                  <div
                    className="absolute left-0 top-0 bottom-0 transition-all"
                    style={{ width: `${bPct}%`, backgroundColor: bandColor(rb.band) }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-px bg-text-muted/70 z-10"
                    style={{ left: `${g.base_risk * 100}%` }}
                    title={`US base ${(g.base_risk * 100).toFixed(0)}%`}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-text/70 rounded-full"
                    style={{
                      left: `${rb.low * 100}%`,
                      width: `${(rb.high - rb.low) * 100}%`,
                    }}
                    title={`Range ${(rb.low * 100).toFixed(0)}–${(rb.high * 100).toFixed(0)}%`}
                  />
                  <div className="absolute inset-0 flex items-center pl-1.5 font-mono text-[10px] text-text">
                    {bPct.toFixed(0)}%
                  </div>
                </div>

                <div className="font-mono text-[9px] text-text-muted text-right">
                  base {(g.base_risk * 100).toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 text-[10px] text-text-muted leading-snug">
          Bar color = risk band of the calibrated value. Δ = {deltaLabel} (percentage points).
          Positive Δ means {deltaMode === "AminusB" ? left.country.code : right.country.code} has higher calibrated risk.
          Whisker = low–high uncertainty range; <span className="text-text">▲</span> exceeds combined ±range, <span className="font-mono">≈</span> falls inside it.
        </div>
      </CardContent>
    </Card>
  );
}

function CountrySelect({
  value, onChange, accent,
}: { value: CountryKey; onChange: (k: CountryKey) => void; accent: "brand" | "teal" }) {
  const cls = accent === "brand" ? "border-brand/50 text-brand" : "border-teal/50 text-teal";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CountryKey)}
      className={`w-full surface2 border ${cls} rounded-sm font-mono text-xs px-2 py-2 outline-none focus:border-brand cursor-pointer`}
    >
      {countryKeys.map((k) => (
        <option key={k} value={k} className="bg-surface text-text">
          {countryConfigs[k].code} — {countryConfigs[k].name}
        </option>
      ))}
    </select>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="surface2 rounded-sm px-2.5 py-1.5 flex items-baseline justify-between gap-2">
      <div className="label-mono truncate">{label}</div>
      <div className="font-display text-base leading-none" style={{ color }}>{value}</div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-text-muted">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
