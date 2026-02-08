-- Consolidated migration for recent planning/assignment changes
-- Safe to run multiple times (idempotent where possible).
-- Supersedes:
-- - 20260206000017_extend_occasions_repetition.sql
-- - 20260206000018_add_occasion_wine_pool_and_assignment_meta.sql

-- 1) Extend occasion series fields
ALTER TABLE public.occasions
  ADD COLUMN IF NOT EXISTS repeat_weekdays INTEGER[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_occurrences INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_occasions_repeat_rule
  ON public.occasions(repeat_rule);

-- 2) Pool of wines selected per occasion series
CREATE TABLE IF NOT EXISTS public.occasion_wine_pool (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occasion_id UUID NOT NULL REFERENCES public.occasions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  wine_id UUID NOT NULL REFERENCES public.wines(id) ON DELETE CASCADE,
  bottles_reserved INTEGER NOT NULL DEFAULT 1 CHECK (bottles_reserved > 0),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (occasion_id, wine_id)
);

CREATE INDEX IF NOT EXISTS idx_occasion_wine_pool_occasion_id
  ON public.occasion_wine_pool(occasion_id);

CREATE INDEX IF NOT EXISTS idx_occasion_wine_pool_user_id
  ON public.occasion_wine_pool(user_id);

ALTER TABLE public.occasion_wine_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "occasion_wine_pool_select_own" ON public.occasion_wine_pool;
DROP POLICY IF EXISTS "occasion_wine_pool_insert_own" ON public.occasion_wine_pool;
DROP POLICY IF EXISTS "occasion_wine_pool_update_own" ON public.occasion_wine_pool;
DROP POLICY IF EXISTS "occasion_wine_pool_delete_own" ON public.occasion_wine_pool;

CREATE POLICY "occasion_wine_pool_select_own"
ON public.occasion_wine_pool
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "occasion_wine_pool_insert_own"
ON public.occasion_wine_pool
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "occasion_wine_pool_update_own"
ON public.occasion_wine_pool
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "occasion_wine_pool_delete_own"
ON public.occasion_wine_pool
FOR DELETE
USING (auth.uid() = user_id);

-- 3) Assignment metadata on occasion instances
ALTER TABLE public.occasion_instances
  ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS assignment_score NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS assignment_reason TEXT;
