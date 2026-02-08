-- Extensions for normalization & fuzzy search
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add normalized columns for search
ALTER TABLE public.wine_catalog
ADD COLUMN IF NOT EXISTS name_norm TEXT,
ADD COLUMN IF NOT EXISTS producer_norm TEXT,
ADD COLUMN IF NOT EXISTS search_norm TEXT;

-- Alias table for learned user queries
CREATE TABLE IF NOT EXISTS public.wine_catalog_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_norm TEXT UNIQUE NOT NULL,
  wine_id UUID NOT NULL REFERENCES public.wine_catalog(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wine_alias_norm ON public.wine_catalog_aliases(alias_norm);
CREATE INDEX IF NOT EXISTS idx_wine_catalog_name_trgm ON public.wine_catalog USING gin (name_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_wine_catalog_producer_trgm ON public.wine_catalog USING gin (producer_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_wine_catalog_search_trgm ON public.wine_catalog USING gin (search_norm gin_trgm_ops);

-- Search function (fuzzy)
CREATE OR REPLACE FUNCTION public.search_wine_catalog(
  q_name TEXT,
  q_producer TEXT,
  q_vintage INT
)
RETURNS TABLE (
  id UUID,
  score NUMERIC
) AS $$
DECLARE
  qn TEXT := unaccent(lower(trim(coalesce(q_name, ''))));
  qp TEXT := unaccent(lower(trim(coalesce(q_producer, ''))));
BEGIN
  RETURN QUERY
  SELECT
    wc.id,
    (
      0.75 * similarity(wc.name_norm, qn) +
      CASE WHEN qp <> '' THEN 0.25 * similarity(wc.producer_norm, qp) ELSE 0 END
    ) +
    CASE
      WHEN q_vintage IS NULL THEN 0
      WHEN wc.vintage = q_vintage THEN 0.05
      ELSE -0.05
    END AS score
  FROM public.wine_catalog wc
  WHERE
    (qn <> '' AND wc.name_norm % qn)
    OR (qp <> '' AND wc.producer_norm % qp)
  ORDER BY score DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;
