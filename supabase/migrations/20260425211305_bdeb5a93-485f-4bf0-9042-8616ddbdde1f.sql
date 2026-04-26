CREATE TABLE public.country_stats (
  country_code TEXT PRIMARY KEY,
  youth_unemployment_pct NUMERIC,
  informal_employment_pct NUMERIC,
  gdp_per_capita_usd NUMERIC,
  secondary_enrollment_pct NUMERIC,
  labor_force_participation_pct NUMERIC,
  source_year INTEGER,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.country_stats ENABLE ROW LEVEL SECURITY;

-- Public read access (reference data, not user-specific)
CREATE POLICY "country_stats are publicly readable"
ON public.country_stats
FOR SELECT
USING (true);

-- No client write policies — only the edge function (service role) can write,
-- which bypasses RLS by design.

CREATE INDEX idx_country_stats_fetched_at ON public.country_stats(fetched_at);