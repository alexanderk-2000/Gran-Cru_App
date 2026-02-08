-- Add deleted_by column for soft delete attribution
ALTER TABLE public.wines
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Replace generic policy with explicit select/insert/update/delete policies
ALTER TABLE public.wines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own wines" ON public.wines;
DROP POLICY IF EXISTS "wines_select_own" ON public.wines;
DROP POLICY IF EXISTS "wines_insert_own" ON public.wines;
DROP POLICY IF EXISTS "wines_update_own" ON public.wines;
DROP POLICY IF EXISTS "wines_delete_own" ON public.wines;

CREATE POLICY "wines_select_own"
ON public.wines
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "wines_insert_own"
ON public.wines
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wines_update_own"
ON public.wines
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wines_delete_own"
ON public.wines
FOR DELETE
USING (auth.uid() = user_id);
