import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Sphere, Graticule, Marker } from "react-simple-maps";
import { X } from "lucide-react";
import { scaleLinear } from "d3-scale";
import { countryConfigs, countryKeys, CountryKey } from "@/data/countryConfigs";

/**
 * Public-landing global map showing the **top growth sector** per country
 * (colored by that sector's annual growth rate) plus the skillsets a young
 * worker would need to step into it. No auth, no Supabase reads — pulls
 * straight from `countryConfigs` so it renders for anonymous visitors.
 */

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// UN M49 numeric id → ISO3 for our configured LMICs
const M49_TO_ISO3: Record<string, string> = {
  "288": "GHA", "404": "KEN", "566": "NGA", "231": "ETH", "646": "RWA",
  "686": "SEN", "834": "TZA", "800": "UGA", "710": "ZAF",
  "050": "BGD", "356": "IND", "586": "PAK", "524": "NPL", "144": "LKA",
  "360": "IDN", "704": "VNM", "608": "PHL", "116": "KHM",
  "818": "EGY", "504": "MAR", "400": "JOR", "788": "TUN",
  "076": "BRA", "170": "COL", "604": "PER", "484": "MEX", "320": "GTM",
};

// Approximate [longitude, latitude] centroids for popup anchoring.
const COUNTRY_CENTROID: Record<string, [number, number]> = {
  GHA: [-1.2, 7.9], KEN: [37.9, 0.0], NGA: [8.7, 9.1], ETH: [40.5, 9.1],
  RWA: [29.9, -2.0], SEN: [-14.5, 14.5], TZA: [34.9, -6.4], UGA: [32.3, 1.4],
  ZAF: [22.9, -30.6], BGD: [90.4, 23.7], IND: [78.9, 22.0], PAK: [69.3, 30.4],
  NPL: [84.1, 28.4], LKA: [80.8, 7.9], IDN: [113.9, -2.5], VNM: [108.3, 14.1],
  PHL: [121.8, 12.9], KHM: [104.9, 12.6], EGY: [30.8, 26.8], MAR: [-7.1, 31.8],
  JOR: [36.2, 31.0], TUN: [9.6, 33.9], BRA: [-51.9, -14.2], COL: [-74.3, 4.6],
  PER: [-75.0, -9.2], MEX: [-102.6, 23.6], GTM: [-90.2, 15.8],
};

/** Heuristic mapping from common sector keywords → skillsets a young
 *  worker could prioritize to enter that sector. Kept short and concrete. */
const SECTOR_SKILL_HINTS: { match: RegExp; skills: string[] }[] = [
  { match: /(fintech|mobile finance|digital|ict|software|tech)/i,
    skills: ["Mobile UX", "Payments / KYC basics", "Spreadsheet & SQL", "Customer support"] },
  { match: /(agri|farm|crop|food)/i,
    skills: ["Agronomy basics", "Cooperative organizing", "Climate-smart practices", "Mobile record-keeping"] },
  { match: /(textile|garment|apparel|manufactur)/i,
    skills: ["Quality control", "Industrial sewing/CNC", "Lean production", "Workplace safety"] },
  { match: /(tourism|hospitalit)/i,
    skills: ["Guest service", "Conversational English", "Booking platforms", "Local cultural knowledge"] },
  { match: /(creative|film|media|design|nollywood)/i,
    skills: ["Storytelling", "Mobile video editing", "Social-media distribution", "Brand & client work"] },
  { match: /(health|care|nurs)/i,
    skills: ["Patient communication", "Basic clinical skills", "Health informatics", "Community outreach"] },
  { match: /(construct|build|infrastruct)/i,
    skills: ["Site safety", "Reading drawings", "Tools & materials", "Estimation basics"] },
  { match: /(oil|gas|mining|extract)/i,
    skills: ["HSE certification", "Equipment operation", "Logistics", "Technical English"] },
  { match: /(trade|retail|repair)/i,
    skills: ["Sales & negotiation", "Bookkeeping", "Inventory basics", "Customer service"] },
  { match: /(bpo|service)/i,
    skills: ["Conversational English", "CRM tools", "Active listening", "Time management"] },
];

function skillsForSector(sector: string): string[] {
  const hit = SECTOR_SKILL_HINTS.find((h) => h.match.test(sector));
  return hit?.skills ?? ["Digital literacy", "Communication", "Problem-solving", "Teamwork"];
}

interface CountrySector {
  key: CountryKey;
  code: string;
  name: string;
  topSector: string;
  growthPct: number; // %/yr
  skills: string[];
}

function colorFor(growth: number, max: number): string {
  // Teal-to-amber ramp anchored to the observed growth range
  const t = Math.max(0, Math.min(1, growth / Math.max(max, 1)));
  const hue = 180 - t * 140; // 180 (teal) → 40 (amber)
  return `hsl(${hue}, 70%, 42%)`;
}

export default function LandingSectorMap() {
  const [hover, setHover] = useState<CountrySector | null>(null);
  const [selected, setSelected] = useState<CountrySector | null>(null);

  const data: CountrySector[] = useMemo(() => {
    return countryKeys.map((k) => {
      const c = countryConfigs[k];
      // Pick the sector with highest growth from sector_growth map; fall back to top_sectors[0]
      const entries = Object.entries(c.sector_growth);
      const best = entries.length > 0
        ? entries.reduce((a, b) => (b[1] > a[1] ? b : a))
        : [c.top_sectors[0] ?? "—", 0] as [string, number];
      return {
        key: k,
        code: c.code,
        name: c.name,
        topSector: best[0],
        growthPct: best[1],
        skills: skillsForSector(best[0]),
      };
    });
  }, []);

  const maxGrowth = useMemo(() => Math.max(...data.map((d) => d.growthPct), 1), [data]);
  const fillScale = scaleLinear<string>()
    .domain([0, maxGrowth / 2, maxGrowth])
    .range([colorFor(0, maxGrowth), colorFor(maxGrowth / 2, maxGrowth), colorFor(maxGrowth, maxGrowth)]);

  const focused = selected ?? hover;

  return (
    <div className="surface-elevated p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="label-mono mb-1">Global view · Top growth sector per country</div>
          <h3 className="font-display text-2xl text-text">Where the new jobs are — and the skills to land them</h3>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Hover or tap a highlighted country to see its fastest-growing sector and a short list of
            skills a young worker can build to step into it.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <select
            value={selected?.code ?? ""}
            onChange={(e) => {
              const code = e.target.value;
              if (!code) { setSelected(null); return; }
              const next = data.find((d) => d.code === code) ?? null;
              setSelected(next);
            }}
            className="bg-surface border border-border rounded-sm text-text text-xs font-mono px-2 py-1.5 outline-none focus:border-accent cursor-pointer hover:border-strong transition-colors"
            aria-label="Select country"
          >
            <option value="">Select a country…</option>
            {[...data].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
              <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 text-[10px] font-mono text-text-muted">
            <span>0%/yr</span>
            <div
              className="w-32 h-2 rounded-sm"
              style={{
                background: `linear-gradient(to right, ${colorFor(0, maxGrowth)}, ${colorFor(maxGrowth / 2, maxGrowth)}, ${colorFor(maxGrowth, maxGrowth)})`,
              }}
            />
            <span>{maxGrowth.toFixed(0)}%/yr</span>
          </div>
        </div>
      </div>

      <div>
        <div className="relative bg-surface2/40 rounded-sm overflow-hidden border border-border">
          <ComposableMap
            projectionConfig={{ scale: 155 }}
            width={980}
            height={460}
            style={{ width: "100%", height: "auto" }}
          >
            <Sphere id="sphere" stroke="hsl(var(--border))" strokeWidth={0.5} fill="transparent" />
            <Graticule stroke="hsl(var(--border))" strokeWidth={0.3} />
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const props = geo.properties as { name?: string };
                  const id = String(geo.id ?? "").padStart(3, "0");
                  const iso3 = M49_TO_ISO3[id];
                  const match =
                    (iso3 ? data.find((d) => d.code === iso3) : undefined) ??
                    data.find((d) => d.name.toLowerCase() === (props.name ?? "").toLowerCase());
                  const isActive = match && focused && match.code === focused.code;
                  const fill = match ? (fillScale(match.growthPct) as string) : "hsl(var(--surface2))";
                  const interactive = !!match;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={isActive ? "hsl(var(--accent))" : "hsl(var(--border))"}
                      strokeWidth={isActive ? 1.4 : 0.4}
                      onMouseEnter={() => interactive && setHover(match!)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => interactive && setSelected(match!)}
                      style={{
                        default: { outline: "none", cursor: interactive ? "pointer" : "default" },
                        hover: {
                          outline: "none",
                          fill: interactive ? colorFor(Math.min(maxGrowth, match!.growthPct + 2), maxGrowth) : fill,
                          stroke: interactive ? "hsl(var(--accent))" : "hsl(var(--border))",
                          strokeWidth: interactive ? 1 : 0.4,
                        },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>

            {/* Floating popup pinned to the selected country's centroid */}
            {selected && COUNTRY_CENTROID[selected.code] && (
              <Marker coordinates={COUNTRY_CENTROID[selected.code]}>
                {/* Connector dot */}
                <circle r={3} fill="hsl(var(--accent))" stroke="hsl(var(--background))" strokeWidth={1} />
                {/* foreignObject lets us drop in HTML for a nicely styled card */}
                <foreignObject x={10} y={-90} width={220} height={180} style={{ overflow: "visible" }}>
                  <div className="surface-elevated border border-accent/60 rounded-sm p-3 shadow-lg text-left">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelected(null); }}
                      className="absolute top-1.5 right-1.5 text-text-muted hover:text-text"
                      aria-label="Close"
                    >
                      <X size={12} />
                    </button>
                    <div className="label-mono text-text-muted text-[9px]">{selected.code} · top growth sector</div>
                    <div className="font-display text-sm text-text mt-0.5 leading-tight">{selected.name}</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="data-num text-base text-accent">{selected.growthPct.toFixed(1)}%</span>
                      <span className="text-[10px] text-text-muted">/yr</span>
                    </div>
                    <div className="text-[11px] text-text capitalize leading-tight">{selected.topSector}</div>
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="label-mono text-[9px] mb-1">Skills to land it</div>
                      <ul className="space-y-0.5">
                        {selected.skills.slice(0, 3).map((s) => (
                          <li key={s} className="text-[10px] text-text-muted flex gap-1.5 leading-snug">
                            <span className="mt-1 h-0.5 w-0.5 rounded-full bg-accent shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </foreignObject>
              </Marker>
            )}
          </ComposableMap>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-text-muted font-mono">
        Coverage: {data.length} pre-calibrated LMICs · grey countries are not yet in the dataset.
      </div>
    </div>
  );
}
