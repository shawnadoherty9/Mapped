// Fetch real World Bank indicators for given country ISO3 codes.
// Caches results in public.country_stats (refreshes if older than 7 days).
// Public API — no auth needed for World Bank.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Core 5 indicators
const INDICATORS = {
  youth_unemployment_pct: "SL.UEM.1524.ZS",        // Unemployment, youth total (% ages 15-24)
  informal_employment_pct: "SL.ISV.IFRM.ZS",       // Informal employment (% of total non-agricultural employment)
  gdp_per_capita_usd: "NY.GDP.PCAP.CD",            // GDP per capita (current US$)
  secondary_enrollment_pct: "SE.SEC.NENR",         // School enrollment, secondary (% net)
  labor_force_participation_pct: "SL.TLF.CACT.ZS", // Labor force participation rate (% ages 15+)
};

const CACHE_DAYS = 7;

interface WBPoint {
  country: { id: string; value: string };
  date: string;
  value: number | null;
}

async function fetchIndicator(
  iso3: string,
  indicator: string,
  exactYear: number | null,
): Promise<{ value: number | null; year: number | null }> {
  const dateRange = exactYear ? `${exactYear}:${exactYear}` : `2014:2024`;
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&per_page=10&date=${dateRange}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { value: null, year: null };
    const json = await res.json();
    const points: WBPoint[] = Array.isArray(json) && json.length > 1 ? json[1] ?? [] : [];
    for (const p of points) {
      if (p.value !== null && p.value !== undefined) {
        return { value: Number(p.value), year: Number(p.date) };
      }
    }
    return { value: null, year: null };
  } catch (e) {
    console.error(`WB fetch failed ${iso3}/${indicator}`, e);
    return { value: null, year: null };
  }
}

async function fetchCountry(iso3: string, exactYear: number | null = null) {
  const entries = await Promise.all(
    Object.entries(INDICATORS).map(async ([col, ind]) => {
      const r = await fetchIndicator(iso3, ind, exactYear);
      return [col, r] as const;
    }),
  );
  const row: Record<string, any> = { country_code: iso3 };
  let mostRecentYear = 0;
  const perFieldYears: Record<string, number | null> = {};
  for (const [col, r] of entries) {
    row[col] = r.value;
    perFieldYears[col] = r.year;
    if (r.year && r.year > mostRecentYear) mostRecentYear = r.year;
  }
  row.source_year = mostRecentYear || null;
  row.per_field_years = perFieldYears;
  row.fetched_at = new Date().toISOString();
  row.updated_at = new Date().toISOString();
  return row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const codes: string[] = Array.isArray(body.codes) ? body.codes.map((c: string) => c.toUpperCase()) : [];
    const force: boolean = !!body.force;
    const exactYear: number | null = typeof body.year === "number" && body.year >= 2000 && body.year <= 2024
      ? Math.floor(body.year)
      : null;

    if (codes.length === 0) {
      return new Response(JSON.stringify({ error: "Provide codes: ISO3 array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // EXACT-YEAR MODE: bypass cache, fetch fresh, do NOT upsert (per-year results
    // would pollute the "latest" cache). Returns one row per requested country.
    if (exactYear !== null) {
      const rows: any[] = [];
      for (const code of codes) {
        const row = await fetchCountry(code, exactYear);
        row.requested_year = exactYear;
        rows.push(row);
      }
      return new Response(JSON.stringify({ stats: rows, mode: "exact_year", year: exactYear }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Read what's already cached
    const { data: cached } = await supabase
      .from("country_stats")
      .select("*")
      .in("country_code", codes);

    const cacheCutoff = Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000;
    const cachedMap = new Map<string, any>((cached ?? []).map((r) => [r.country_code, r]));

    // 2. Determine which need refreshing
    const toFetch = codes.filter((c) => {
      if (force) return true;
      const row = cachedMap.get(c);
      if (!row) return true;
      return new Date(row.fetched_at).getTime() < cacheCutoff;
    });

    // 3. Fetch + upsert (sequential per country, parallel indicators inside, to be polite)
    const fetched: any[] = [];
    for (const code of toFetch) {
      const row = await fetchCountry(code);
      fetched.push(row);
    }

    if (fetched.length > 0) {
      // Drop fields that aren't columns in the cache table
      const upsertRows = fetched.map(({ per_field_years, ...rest }) => rest);
      const { error: upErr } = await supabase
        .from("country_stats")
        .upsert(upsertRows, { onConflict: "country_code" });
      if (upErr) console.error("upsert error", upErr);
      for (const r of fetched) cachedMap.set(r.country_code, r);
    }

    // 4. Return everything requested
    const result = codes.map((c) => cachedMap.get(c) ?? { country_code: c, error: "no data" });
    return new Response(JSON.stringify({ stats: result, refreshed: toFetch.length, mode: "latest" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("worldbank-stats error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
