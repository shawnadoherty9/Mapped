-- Add skill tags, share slug, and public flag to portfolio_projects
ALTER TABLE public.portfolio_projects
  ADD COLUMN IF NOT EXISTS skill_tags TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_slug TEXT;

-- Backfill / generate slugs for existing rows that don't have one
UPDATE public.portfolio_projects
SET share_slug = encode(gen_random_bytes(9), 'base64')
WHERE share_slug IS NULL;

-- Sanitize slugs (base64 may contain / + = which are bad in URLs)
UPDATE public.portfolio_projects
SET share_slug = regexp_replace(share_slug, '[^a-zA-Z0-9]', '', 'g')
WHERE share_slug ~ '[^a-zA-Z0-9]';

-- Ensure uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_projects_share_slug_key
  ON public.portfolio_projects (share_slug);

-- Default slug for future inserts (URL-safe)
CREATE OR REPLACE FUNCTION public.gen_portfolio_share_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.share_slug IS NULL OR length(NEW.share_slug) = 0 THEN
    NEW.share_slug := regexp_replace(encode(gen_random_bytes(9), 'base64'), '[^a-zA-Z0-9]', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portfolio_projects_set_slug ON public.portfolio_projects;
CREATE TRIGGER portfolio_projects_set_slug
BEFORE INSERT ON public.portfolio_projects
FOR EACH ROW EXECUTE FUNCTION public.gen_portfolio_share_slug();

-- Keep updated_at fresh on edits
DROP TRIGGER IF EXISTS portfolio_projects_set_updated_at ON public.portfolio_projects;
CREATE TRIGGER portfolio_projects_set_updated_at
BEFORE UPDATE ON public.portfolio_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow anyone (anon) to read a project ONLY when explicitly made public
DROP POLICY IF EXISTS "Public can view shared portfolio projects" ON public.portfolio_projects;
CREATE POLICY "Public can view shared portfolio projects"
  ON public.portfolio_projects
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- Allow public read of evidence files for projects that are shared publicly
DROP POLICY IF EXISTS "Public can read evidence of shared projects" ON storage.objects;
CREATE POLICY "Public can read evidence of shared projects"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'portfolio-evidence'
    AND EXISTS (
      SELECT 1 FROM public.portfolio_projects p
      WHERE p.is_public = true
        AND name = ANY (p.evidence_paths)
    )
  );
