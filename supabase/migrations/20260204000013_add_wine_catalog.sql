-- Global wine catalog for AI search caching
CREATE TABLE IF NOT EXISTS public.wine_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key TEXT UNIQUE NOT NULL,

  name TEXT NOT NULL,
  producer TEXT,
  vintage INT,

  region TEXT,
  country TEXT,
  appellation TEXT,

  grapes JSONB,
  alcohol_percent NUMERIC,

  drink_start INT,
  drink_end INT,
  peak_year INT,

  aromas JSONB,
  structure JSONB,
  pairings JSONB,
  vinification JSONB,
  scores JSONB,
  details JSONB,
  sources JSONB,

  confidence INT,
  missing_fields JSONB,
  inferred_fields JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wine_catalog_key ON public.wine_catalog(canonical_key);

ALTER TABLE public.wine_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read wine_catalog" ON public.wine_catalog;
CREATE POLICY "Public can read wine_catalog" ON public.wine_catalog
  FOR SELECT USING (true);

DROP TRIGGER IF EXISTS update_wine_catalog_updated_at ON public.wine_catalog;
CREATE TRIGGER update_wine_catalog_updated_at
  BEFORE UPDATE ON public.wine_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
