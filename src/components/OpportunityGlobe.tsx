import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { Loader2, Search, MapPin, ExternalLink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Country centroids dataset (small built-in subset — enough for click-to-zoom)
// Using Natural Earth lite GeoJSON from a CDN for country polygons
const COUNTRIES_GEOJSON =
  "https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
  source: string;
}

interface SelectedRegion {
  countryName: string;
  lat: number;
  lng: number;
  city?: string;
  radiusKm: number;
}

export default function OpportunityGlobe({
  allSkills,
}: {
  allSkills: string[];
}) {
  const globeEl = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 480 });
  const [countries, setCountries] = useState<any[]>([]);
  const [hoverD, setHoverD] = useState<any>(null);
  const [selected, setSelected] = useState<SelectedRegion | null>(null);
  const [city, setCity] = useState("");
  const [radius, setRadius] = useState(50);

  // Skill selection mode: "all" or specific picks
  const [skillMode, setSkillMode] = useState<"all" | "custom">("all");
  const [pickedSkills, setPickedSkills] = useState<Record<string, boolean>>({});

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Responsive sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(320, r.width), h: Math.max(360, Math.min(560, r.width * 0.75)) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Load country polygons
  useEffect(() => {
    fetch(COUNTRIES_GEOJSON)
      .then((r) => r.json())
      .then((d) => setCountries(d.features ?? []))
      .catch((e) => console.error("countries load failed", e));
  }, []);

  // Auto-rotate until interaction
  useEffect(() => {
    if (!globeEl.current) return;
    const controls = globeEl.current.controls();
    if (controls) {
      controls.autoRotate = !selected;
      controls.autoRotateSpeed = 0.4;
    }
  }, [selected]);

  const activeSkills = useMemo(() => {
    if (skillMode === "all") return allSkills;
    return allSkills.filter((s) => pickedSkills[s]);
  }, [allSkills, skillMode, pickedSkills]);

  const handleCountryClick = (poly: any) => {
    if (!poly?.properties) return;
    const name = poly.properties.NAME ?? poly.properties.name ?? "Unknown";
    // Compute rough centroid from bounding box of geometry
    const coords = poly.geometry?.coordinates ?? [];
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    const walk = (arr: any) => {
      if (typeof arr[0] === "number") {
        minLng = Math.min(minLng, arr[0]); maxLng = Math.max(maxLng, arr[0]);
        minLat = Math.min(minLat, arr[1]); maxLat = Math.max(maxLat, arr[1]);
      } else arr.forEach(walk);
    };
    if (coords.length) walk(coords);
    const lat = (minLat + maxLat) / 2;
    const lng = (minLng + maxLng) / 2;
    setSelected({ countryName: name, lat, lng, radiusKm: radius });
    setResults(null);
    setAnswer(null);
    setError(null);
    setCity("");
    if (globeEl.current) {
      globeEl.current.pointOfView({ lat, lng, altitude: 1.2 }, 1200);
    }
  };

  const runSearch = async () => {
    if (!selected) return;
    if (activeSkills.length === 0) {
      setError("Pick at least one skill to search.");
      return;
    }
    setSearching(true);
    setError(null);
    setResults(null);
    setAnswer(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("tavily-jobs", {
        body: {
          skills: activeSkills,
          countryName: selected.countryName,
          city: city.trim() || undefined,
          radiusKm: city.trim() ? radius : undefined,
        },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setResults(data.results ?? []);
      setAnswer(data.answer ?? null);
    } catch (e: any) {
      console.error("Tavily search failed", e);
      setError(e?.message ?? "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      {/* Globe panel */}
      <div className="lg:col-span-3 surface rounded-sm p-3" ref={containerRef}>
        <div className="flex items-center justify-between mb-2">
          <div className="label-mono">Click a country to zoom in</div>
          {selected && (
            <button
              onClick={() => {
                setSelected(null);
                setResults(null); setAnswer(null);
                if (globeEl.current) globeEl.current.pointOfView({ altitude: 2.5 }, 1000);
              }}
              className="text-[10px] font-mono text-text-muted hover:text-warn flex items-center gap-1"
            >
              <X size={10} /> Reset view
            </button>
          )}
        </div>
        <div className="rounded-sm overflow-hidden bg-bg" style={{ height: size.h }}>
          <Globe
            ref={globeEl}
            width={size.w - 24}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            polygonsData={countries}
            polygonAltitude={(d: any) => (d === hoverD ? 0.06 : 0.01)}
            polygonCapColor={(d: any) =>
              d === hoverD
                ? "rgba(56,189,248,0.55)"
                : selected && (d.properties?.NAME ?? d.properties?.name) === selected.countryName
                  ? "rgba(45,212,191,0.55)"
                  : "rgba(99,102,241,0.18)"
            }
            polygonSideColor={() => "rgba(0,0,0,0.15)"}
            polygonStrokeColor={() => "#0f172a"}
            polygonLabel={(d: any) =>
              `<div style="background:#0f172a;color:#e2e8f0;padding:4px 8px;border-radius:3px;font-family:monospace;font-size:11px">${d.properties?.NAME ?? d.properties?.name}</div>`
            }
            onPolygonHover={setHoverD}
            onPolygonClick={handleCountryClick}
            polygonsTransitionDuration={300}
            pointsData={selected ? [selected] : []}
            pointLat={(d: any) => d.lat}
            pointLng={(d: any) => d.lng}
            pointColor={() => "#2dd4bf"}
            pointAltitude={0.02}
            pointRadius={0.6}
          />
        </div>
      </div>

      {/* Controls + results */}
      <div className="lg:col-span-2 space-y-3">
        <div className="surface rounded-sm p-4">
          <div className="label-mono mb-2">Selected region</div>
          {selected ? (
            <div className="text-sm flex items-center gap-2 mb-3">
              <MapPin size={14} className="text-teal" />
              <span className="font-medium">{selected.countryName}</span>
              <span className="font-mono text-[10px] text-text-muted">
                {selected.lat.toFixed(1)}°, {selected.lng.toFixed(1)}°
              </span>
            </div>
          ) : (
            <div className="text-text-muted text-xs mb-3">No region selected — click a country on the globe.</div>
          )}

          {selected && (
            <>
              <label className="label-mono block mb-1">City (optional)</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={`e.g. capital of ${selected.countryName}`}
                className="w-full bg-bg border border-border rounded-sm px-2 py-1.5 text-sm mb-3"
              />
              {city.trim() && (
                <>
                  <div className="flex justify-between label-mono mb-1">
                    <span>Search radius</span>
                    <span className="text-brand">{radius} km</span>
                  </div>
                  <input
                    type="range" min={5} max={500} step={5}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full mb-3 accent-teal"
                  />
                </>
              )}
            </>
          )}
        </div>

        {/* Skills selection */}
        <div className="surface rounded-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="label-mono">Skills to search</div>
            <div className="flex gap-1">
              <button
                onClick={() => setSkillMode("all")}
                className={`pill text-[10px] border ${skillMode === "all" ? "border-teal text-teal" : "border-border text-text-muted"}`}
              >All ({allSkills.length})</button>
              <button
                onClick={() => setSkillMode("custom")}
                className={`pill text-[10px] border ${skillMode === "custom" ? "border-teal text-teal" : "border-border text-text-muted"}`}
              >Custom</button>
            </div>
          </div>
          {skillMode === "all" ? (
            <p className="text-text-muted text-xs">
              Searching across all {allSkills.length} skills in your profile.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
              {allSkills.map((s) => {
                const on = pickedSkills[s];
                return (
                  <button
                    key={s}
                    onClick={() => setPickedSkills((p) => ({ ...p, [s]: !p[s] }))}
                    className={`pill text-[10px] border ${on ? "bg-teal/20 border-teal text-teal" : "border-border text-text-muted hover:border-brand"}`}
                  >
                    {s}
                  </button>
                );
              })}
              {allSkills.length === 0 && (
                <span className="text-text-muted text-xs">No skills in profile yet.</span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={runSearch}
          disabled={!selected || searching || activeSkills.length === 0}
          className="w-full bg-brand text-bg px-4 py-2.5 rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {searching ? "Searching local opportunities…" : "Search jobs in this region"}
        </button>

        {error && (
          <div className="surface2 border border-warn/40 rounded-sm p-3 text-warn text-xs">{error}</div>
        )}

        {answer && (
          <div className="surface rounded-sm p-3 border-l-2 border-teal">
            <div className="label-mono text-teal mb-1">AI summary</div>
            <p className="text-xs leading-relaxed">{answer}</p>
          </div>
        )}

        {results && results.length > 0 && (
          <div className="surface rounded-sm p-3">
            <div className="label-mono mb-2">{results.length} opportunities found</div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {results.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block surface2 rounded-sm p-2.5 border border-border hover:border-brand transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-sm font-medium leading-tight line-clamp-2">{r.title}</div>
                    <ExternalLink size={11} className="text-text-muted flex-shrink-0 mt-0.5" />
                  </div>
                  <div className="font-mono text-[9px] text-teal mb-1">{r.source}</div>
                  <p className="text-[11px] text-text-muted leading-snug line-clamp-3">{r.snippet}</p>
                </a>
              ))}
            </div>
          </div>
        )}
        {results && results.length === 0 && (
          <div className="surface rounded-sm p-4 text-text-muted text-xs text-center">
            No matches found — try a broader region or different skill mix.
          </div>
        )}
      </div>
    </div>
  );
}
