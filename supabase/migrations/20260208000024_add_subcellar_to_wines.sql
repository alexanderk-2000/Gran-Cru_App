-- Enable sub-cellar organization inside main cellar.
ALTER TABLE public.wines
  ADD COLUMN IF NOT EXISTS subcellar TEXT;

CREATE INDEX IF NOT EXISTS idx_wines_user_subcellar
  ON public.wines(user_id, subcellar);
