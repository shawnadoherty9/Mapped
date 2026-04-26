CREATE TABLE public.user_skill_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT user_skill_categories_label_chk CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  CONSTRAINT user_skill_categories_user_label_uniq UNIQUE (user_id, label)
);

ALTER TABLE public.user_skill_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own skill categories"
ON public.user_skill_categories FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own skill categories"
ON public.user_skill_categories FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own skill categories"
ON public.user_skill_categories FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own skill categories"
ON public.user_skill_categories FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_user_skill_categories_user_pos
  ON public.user_skill_categories(user_id, position);

CREATE TRIGGER update_user_skill_categories_updated_at
BEFORE UPDATE ON public.user_skill_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();