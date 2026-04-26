CREATE TYPE public.saved_grow_kind AS ENUM ('search', 'recommendation');

CREATE TABLE public.saved_grow_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind public.saved_grow_kind NOT NULL,
  label TEXT NOT NULL,
  country_code TEXT,
  city TEXT,
  skill_focus TEXT,
  sdg_number INTEGER,
  sdg_title TEXT,
  gap_area TEXT,
  recommendation TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_grow_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own saved grow items"
ON public.saved_grow_items FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own saved grow items"
ON public.saved_grow_items FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own saved grow items"
ON public.saved_grow_items FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own saved grow items"
ON public.saved_grow_items FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_saved_grow_items_user_kind ON public.saved_grow_items(user_id, kind, created_at DESC);

CREATE TRIGGER update_saved_grow_items_updated_at
BEFORE UPDATE ON public.saved_grow_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();