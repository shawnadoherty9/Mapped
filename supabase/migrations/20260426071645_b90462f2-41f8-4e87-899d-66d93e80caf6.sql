-- Posting kind: a role (job opening) vs. a project (short-term initiative)
CREATE TYPE public.recruit_posting_kind AS ENUM ('role', 'project');
CREATE TYPE public.recruit_posting_status AS ENUM ('active', 'closed');

CREATE TABLE public.recruit_postings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind public.recruit_posting_kind NOT NULL DEFAULT 'role',
  status public.recruit_posting_status NOT NULL DEFAULT 'active',
  title TEXT NOT NULL,
  description TEXT,
  country_code TEXT,
  isco_group INTEGER,
  seniority TEXT,
  required_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  organization TEXT,
  external_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recruit_postings ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can browse active postings
CREATE POLICY "Authenticated users can view active postings"
ON public.recruit_postings
FOR SELECT
TO authenticated
USING (status = 'active' OR auth.uid() = user_id);

CREATE POLICY "Users insert own postings"
ON public.recruit_postings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own postings"
ON public.recruit_postings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own postings"
ON public.recruit_postings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_recruit_postings_updated_at
BEFORE UPDATE ON public.recruit_postings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_recruit_postings_country ON public.recruit_postings(country_code);
CREATE INDEX idx_recruit_postings_status ON public.recruit_postings(status);
CREATE INDEX idx_recruit_postings_user ON public.recruit_postings(user_id);

-- Discoverable opt-in for job seekers so they can be searched by recruiters
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT false;