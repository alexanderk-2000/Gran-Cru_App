-- occasion_wine_pool rows can be updated in place (saveOccasionWinePool
-- upserts bottles_reserved/priority onto an existing row via
-- ON CONFLICT (occasion_id, wine_id)) but the table only ever had
-- created_at - a delta-sync cursor based on created_at would silently
-- miss any such in-place update. Adds updated_at with the same
-- trigger pattern already used elsewhere (update_updated_at_column()).

ALTER TABLE public.occasion_wine_pool
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS update_occasion_wine_pool_updated_at ON public.occasion_wine_pool;
CREATE TRIGGER update_occasion_wine_pool_updated_at
  BEFORE UPDATE ON public.occasion_wine_pool
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
