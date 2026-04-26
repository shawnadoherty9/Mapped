ALTER TABLE public.aptitude_attempts ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE public.user_skill_ratings ADD COLUMN IF NOT EXISTS country_code TEXT;
CREATE INDEX IF NOT EXISTS idx_aptitude_attempts_user_country_created ON public.aptitude_attempts (user_id, country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_skill_ratings_user_country ON public.user_skill_ratings (user_id, country_code);