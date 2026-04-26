-- =========================================================
-- "Grow" feature: skill self-ratings, aptitude history, portfolio
-- =========================================================

-- Status enum for portfolio entries
DO $$ BEGIN
  CREATE TYPE public.portfolio_status AS ENUM ('planned', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- user_skill_ratings ----------
CREATE TABLE public.user_skill_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);
ALTER TABLE public.user_skill_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own skill ratings"
  ON public.user_skill_ratings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own skill ratings"
  ON public.user_skill_ratings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own skill ratings"
  ON public.user_skill_ratings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own skill ratings"
  ON public.user_skill_ratings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER user_skill_ratings_updated_at
  BEFORE UPDATE ON public.user_skill_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- aptitude_attempts ----------
CREATE TABLE public.aptitude_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_input  TEXT,
  category     TEXT NOT NULL,
  score        INTEGER NOT NULL CHECK (score >= 0),
  total        INTEGER NOT NULL CHECK (total > 0),
  level        TEXT NOT NULL CHECK (level IN ('Novice','Proficient','Advanced')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.aptitude_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own aptitude attempts"
  ON public.aptitude_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own aptitude attempts"
  ON public.aptitude_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own aptitude attempts"
  ON public.aptitude_attempts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_aptitude_attempts_user_created
  ON public.aptitude_attempts (user_id, created_at DESC);

-- ---------- portfolio_projects ----------
CREATE TABLE public.portfolio_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description     TEXT,
  sdg_number      INTEGER CHECK (sdg_number BETWEEN 1 AND 17),
  skill_focus     TEXT,
  status          public.portfolio_status NOT NULL DEFAULT 'planned',
  started_on      DATE,
  completed_on    DATE,
  external_link   TEXT,
  reflection      TEXT,
  evidence_paths  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.portfolio_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own portfolio"
  ON public.portfolio_projects FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own portfolio"
  ON public.portfolio_projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own portfolio"
  ON public.portfolio_projects FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own portfolio"
  ON public.portfolio_projects FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER portfolio_projects_updated_at
  BEFORE UPDATE ON public.portfolio_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_portfolio_user_created
  ON public.portfolio_projects (user_id, created_at DESC);

-- ---------- Storage bucket: portfolio-evidence (private) ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio-evidence', 'portfolio-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Each authenticated user can manage files under their own user-id folder only.
CREATE POLICY "Users read own evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'portfolio-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users upload own evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users update own evidence"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portfolio-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users delete own evidence"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );