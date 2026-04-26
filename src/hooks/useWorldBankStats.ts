import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { countryConfigs, CountryKey, countryKeys } from "@/data/countryConfigs";

export interface CountryStats {
  country_code: string;
  youth_unemployment_pct: number | null;
  informal_employment_pct: number | null;
  gdp_per_capita_usd: number | null;
  secondary_enrollment_pct: number | null;
  labor_force_participation_pct: number | null;
  source_year: number | null;
  fetched_at: string;
  /** Only present in exact-year responses: actual reporting year per indicator. */
  per_field_years?: Record<string, number | null>;
  /** Only present in exact-year responses: the year the caller requested. */
  requested_year?: number;
}

let cache: Record<string, CountryStats> | null = null;
let inflight: Promise<Record<string, CountryStats>> | null = null;

async function loadAll(): Promise<Record<string, CountryStats>> {
  if (cache) return cache;
  if (inflight) return inflight;

  const codes = countryKeys.map((k) => countryConfigs[k].code);

  inflight = (async () => {
    // 1. Read whatever is in the cache table immediately
    const { data: existing } = await supabase
      .from("country_stats")
      .select("*")
      .in("country_code", codes);
    const map: Record<string, CountryStats> = {};
    (existing ?? []).forEach((r: any) => { map[r.country_code] = r as CountryStats; });

    // 2. Trigger the edge function to refresh (async — don't block page)
    //    but await on first load if nothing is cached yet
    const needsFetch = codes.filter((c) => !map[c]);
    if (needsFetch.length > 0) {
      try {
        const { data } = await supabase.functions.invoke("worldbank-stats", {
          body: { codes },
        });
        if (data?.stats) {
          for (const s of data.stats as CountryStats[]) map[s.country_code] = s;
        }
      } catch (e) {
        console.warn("World Bank fetch failed, using fallback values", e);
      }
    } else {
      // Background refresh — fire and forget
      supabase.functions.invoke("worldbank-stats", { body: { codes } }).catch(() => {});
    }

    cache = map;
    return map;
  })();

  return inflight;
}

/** Returns merged config — real World Bank values override hardcoded fallbacks. */
export function useCountryStats(key: CountryKey | null) {
  const [stats, setStats] = useState<CountryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!key) { setStats(null); setLoading(false); return; }
    let cancelled = false;
    loadAll().then((map) => {
      if (cancelled) return;
      const code = countryConfigs[key].code;
      setStats(map[code] ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [key]);

  return { stats, loading };
}

export function useAllCountryStats() {
  const [map, setMap] = useState<Record<string, CountryStats>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    loadAll().then((m) => { if (!cancelled) { setMap(m); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  return { map, loading };
}

/**
 * Fetch World Bank values for a single country PINNED to an exact year.
 * Bypasses the cache. Returns null while loading or when year is null (latest mode).
 * Each indicator is fetched fresh from WB for that exact year — values may be null
 * when no observation exists for that year.
 */
export function useCountryStatsAtYear(key: CountryKey | null, year: number | null) {
  const [stats, setStats] = useState<CountryStats | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!key || year == null) { setStats(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const code = countryConfigs[key].code;
    supabase.functions
      .invoke("worldbank-stats", { body: { codes: [code], year } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.stats?.[0]) { setStats(null); setLoading(false); return; }
        setStats(data.stats[0] as CountryStats);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setStats(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [key, year]);
  return { stats, loading };
}

/** Per-field provenance: tells the UI exactly which value the calc actually used. */
export interface FieldProvenance {
  /** The numeric value the calculation actually consumed (after fallback resolution). */
  value: number | null;
  /** "live" = live World Bank value used; "fallback" = static config used; "missing" = not available. */
  source: "live" | "fallback" | "missing";
  /** Human label of the dataset, e.g. "WB WDI · NY.GDP.PCAP.CD". */
  dataset: string;
  /** Last observation year reported by the World Bank (when source === "live"). */
  sourceYear: number | null;
  /** ISO timestamp of when the value was fetched (when source === "live"). */
  fetchedAt: string | null;
}

/** Merge real values over the static fallback config. */
export function mergeWithStats(key: CountryKey, stats: CountryStats | null) {
  const cfg = countryConfigs[key];
  const liveAt = stats?.fetched_at ?? null;
  const perField = stats?.per_field_years ?? {};
  const yearFor = (col: string): number | null => perField[col] ?? stats?.source_year ?? null;
  const exactMode = stats?.requested_year != null;

  const informalProvenance: FieldProvenance = stats?.informal_employment_pct != null
    ? { value: stats.informal_employment_pct, source: "live", dataset: "WB WDI · SL.ISV.IFRM.ZS (informal employment, % of total non-agricultural)", sourceYear: yearFor("informal_employment_pct"), fetchedAt: liveAt }
    : { value: cfg.informal_employment_pct ?? null, source: "fallback", dataset: "Static country config (ILO/national fallback)", sourceYear: null, fetchedAt: null };

  const gdpProvenance: FieldProvenance = stats?.gdp_per_capita_usd != null
    ? { value: stats.gdp_per_capita_usd, source: "live", dataset: "WB WDI · NY.GDP.PCAP.CD (GDP per capita, current US$)", sourceYear: yearFor("gdp_per_capita_usd"), fetchedAt: liveAt }
    : { value: 3000, source: "fallback", dataset: "Hardcoded fallback ($3,000)", sourceYear: null, fetchedAt: null };

  const provenance = {
    informal_employment_pct: informalProvenance,
    gdp_per_capita_usd: gdpProvenance,
    base_FO: {
      value: null,
      source: "live" as const,
      dataset: "Frey & Osborne (2017) automation probabilities, mapped to ISCO-08 major groups (employment-weighted)",
      sourceYear: 2017,
      fetchedAt: null,
    } satisfies FieldProvenance,
  };

  if (!stats) {
    return {
      ...cfg,
      gdp_per_capita_usd: gdpProvenance.value,
      _live: false as const,
      _sourceYear: null as number | null,
      _fetchedAt: null as string | null,
      _provenance: provenance,
      _yearMode: "latest" as "latest" | "exact",
      _requestedYear: null as number | null,
    };
  }
  return {
    ...cfg,
    youth_unemployment_pct: stats.youth_unemployment_pct ?? cfg.youth_unemployment_pct,
    informal_employment_pct: informalProvenance.value ?? cfg.informal_employment_pct,
    gdp_per_capita_usd: gdpProvenance.value,
    secondary_enrollment_pct: stats.secondary_enrollment_pct,
    labor_force_participation_pct: stats.labor_force_participation_pct,
    _live: stats.youth_unemployment_pct !== null || stats.informal_employment_pct !== null,
    _sourceYear: stats.source_year,
    _fetchedAt: liveAt,
    _provenance: provenance,
    _yearMode: (exactMode ? "exact" : "latest") as "latest" | "exact",
    _requestedYear: stats.requested_year ?? null,
  };
}
