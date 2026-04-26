import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Sphere, Graticule } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { Card, CardContent } from "@/components/ui/card";
import { countryConfigs, countryKeys, CountryKey } from "@/data/countryConfigs";
import { iscoMajorGroups, calibrateRisk } from "@/data/freyOsborne";
import { useAllCountryStats, mergeWithStats } from "@/hooks/useWorldBankStats";
import { useAppStore } from "@/store/useAppStore";

// Public world-atlas TopoJSON (countries, numeric M49 id + name in properties)
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// UN M49 numeric id → ISO3 for our configured LMICs (world-atlas uses numeric ids)
const M49_TO_ISO3: Record<string, string> = {
  "288": "GHA", "404": "KEN", "566": "NGA", "231": "ETH", "646": "RWA",
  "686": "SEN", "834": "TZA", "800": "UGA", "710": "ZAF",
  "050": "BGD", "356": "IND", "586": "PAK", "524": "NPL", "144": "LKA",
  "360": "IDN", "704": "VNM", "608": "PHL", "116": "KHM",
  "818": "EGY", "504": "MAR", "400": "JOR", "788": "TUN",
  "076": "BRA", "170": "COL", "604": "PER", "484": "MEX", "320": "GTM",
};

interface CountryRisk {
  key: CountryKey;
  code: string; // ISO3
  name: string;
  meanCalibrated: number; // 0..1
}

function colorFor(risk: number): string {
  // Same hue ramp as the table cells
  const hue = 140 - risk * 140;
  return `hsl(${hue}, 65%, 38%)`;
}

interface Props {
  /** Region filter from the parent page; "all" = no filter. Countries outside the region are dimmed. */
  region?: string;
}

export default function GlobalRiskChoropleth({ region = "all" }: Props) {
  const { map: statsMap } = useAllCountryStats();
  const setCountry = useAppStore((s) => s.setCountry);
  const activeCountry = useAppStore((s) => s.country);
  const [hover, setHover] = useState<CountryRisk | null>(null);

  const data: CountryRisk[] = useMemo(() => {
    return countryKeys.map((k) => {
      const merged = mergeWithStats(k, statsMap[countryConfigs[k].code] ?? null);
      const risks = iscoMajorGroups.map((g) =>
        calibrateRisk(g.base_risk, {
          lmic_calibration: merged.lmic_calibration,
          informality_pct: merged.informal_employment_pct,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          gdp_per_capita_usd: (merged as any).gdp_per_capita_usd ?? null,
        }),
      );
      const mean = risks.reduce((s, r) => s + r, 0) / risks.length;
      return { key: k, code: countryConfigs[k].code, name: countryConfigs[k].name, meanCalibrated: mean };
    });
  }, [statsMap]);

  // Which configured countries match the region filter
  const inRegion = useMemo(() => {
    const set = new Set<string>();
    countryKeys.forEach((k) => {
      if (region === "all" || countryConfigs[k].region === region) {
        set.add(countryConfigs[k].code);
      }
    });
    return set;
  }, [region]);

  const byIso3 = useMemo(() => {
    const m = new Map<string, CountryRisk>();
    data.forEach((d) => m.set(d.code, d));
    return m;
  }, [data]);

  const domain = useMemo(() => {
    const vals = data.map((d) => d.meanCalibrated);
    return [Math.min(...vals), Math.max(...vals)] as [number, number];
  }, [data]);

  const fillScale = scaleLinear<string>()
    .domain([domain[0], (domain[0] + domain[1]) / 2, domain[1]])
    .range([colorFor(0.15), colorFor(0.45), colorFor(0.8)]);

  return (
    <Card className="bg-surface border-border mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <div className="label-mono text-text-muted">Global view · Average calibrated automation risk</div>
            <div className="text-xs text-text-muted mt-0.5">
              Mean across all ISCO-08 major groups, calibrated for LMIC labor structure. Click a country to make it active.
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-text-muted">
            <span>{(domain[0] * 100).toFixed(0)}%</span>
            <div
              className="w-40 h-2 rounded-sm"
              style={{
                background: `linear-gradient(to right, ${colorFor(0.15)}, ${colorFor(0.45)}, ${colorFor(0.8)})`,
              }}
            />
            <span>{(domain[1] * 100).toFixed(0)}%</span>
          </div>
        </div>

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
                  // world-atlas uses numeric "id" (UN M49). We need ISO3.
                  // Properties may include name only; use a small lookup via geo.id → ISO3.
                  // Easier: match by name as fallback.
                  const props = geo.properties as { name?: string };
                  const id = String(geo.id ?? "").padStart(3, "0");
                  const iso3 = M49_TO_ISO3[id];
                  const match =
                    (iso3 ? data.find((d) => d.code === iso3) : undefined) ??
                    data.find((d) => d.name.toLowerCase() === (props.name ?? "").toLowerCase());
                  const isActive = match && match.key === activeCountry;
                  const isInRegion = match ? inRegion.has(match.code) : false;
                  // Dim countries outside selected region
                  const baseFill = match ? (fillScale(match.meanCalibrated) as string) : "hsl(var(--surface2))";
                  const fill = match && !isInRegion ? "hsl(var(--surface2))" : baseFill;
                  const opacity = match ? (isInRegion ? 1 : 0.35) : 1;
                  const interactive = !!match && isInRegion;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      opacity={opacity}
                      stroke={isActive ? "hsl(var(--brand))" : "hsl(var(--border))"}
                      strokeWidth={isActive ? 1.4 : 0.4}
                      onMouseEnter={() => interactive && setHover(match!)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => interactive && setCountry(match!.key)}
                      style={{
                        default: { outline: "none", cursor: interactive ? "pointer" : "default" },
                        hover: {
                          outline: "none",
                          fill: interactive ? colorFor(Math.min(0.95, match!.meanCalibrated + 0.05)) : fill,
                          stroke: interactive ? "hsl(var(--brand))" : "hsl(var(--border))",
                          strokeWidth: interactive ? 1 : 0.4,
                        },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>

          {hover && (
            <div className="absolute top-2 left-2 surface2 border border-border rounded-sm px-3 py-2 text-xs pointer-events-none">
              <div className="font-mono text-brand">{hover.code}</div>
              <div className="text-text font-semibold">{hover.name}</div>
              <div className="text-text-muted mt-0.5">
                Mean calibrated risk:{" "}
                <span className="text-text font-mono">{(hover.meanCalibrated * 100).toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 text-[10px] text-text-muted font-mono">
          {region === "all"
            ? `Coverage: ${data.length} configured LMICs · grey countries are not in the calibrated set.`
            : `Region: ${region} · ${inRegion.size} of ${data.length} countries highlighted.`}
        </div>
      </CardContent>
    </Card>
  );
}
