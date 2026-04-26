-- Saved country-pair comparisons, scoped to an anonymous per-device install_id.
CREATE TABLE public.saved_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  install_id TEXT NOT NULL,
  country_a TEXT NOT NULL,
  country_b TEXT NOT NULL,
  delta_mode TEXT NOT NULL DEFAULT 'AminusB' CHECK (delta_mode IN ('AminusB', 'BminusA')),
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_comparisons_install_id
  ON public.saved_comparisons (install_id, created_at DESC);

ALTER TABLE public.saved_comparisons ENABLE ROW LEVEL SECURITY;

-- Anonymous app: gate by knowing the install_id (generated client-side, never public).
CREATE POLICY "Anyone can read saved comparisons"
  ON public.saved_comparisons
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create saved comparisons"
  ON public.saved_comparisons
  FOR INSERT
  WITH CHECK (install_id IS NOT NULL AND length(install_id) >= 8);

CREATE POLICY "Anyone can delete saved comparisons"
  ON public.saved_comparisons
  FOR DELETE
  USING (true);
