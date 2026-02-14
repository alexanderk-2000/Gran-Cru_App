-- Continuous synchronization from inventory table (wines) to shared master table (wine_catalog)
-- Includes:
-- 1) normalization helper
-- 2) row-level sync trigger on INSERT/UPDATE
-- 3) one-time backfill for existing rows

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Ensure inferred_fields column exists on wine_catalog
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wine_catalog'
      AND column_name = 'inferred_fields'
  ) THEN
    ALTER TABLE public.wine_catalog ADD COLUMN inferred_fields JSONB DEFAULT '[]'::jsonb;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.normalize_catalog_token(input_text TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT regexp_replace(
    trim(
      regexp_replace(
        unaccent(lower(coalesce(input_text, ''))),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ),
    '\s+',
    ' ',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_wine_row_to_catalog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name_norm TEXT;
  v_producer_norm TEXT;
  v_canonical_key TEXT;
  v_vinification JSONB;
  v_details JSONB;
BEGIN
  v_name_norm := public.normalize_catalog_token(NEW.name);
  IF v_name_norm = '' THEN
    RETURN NEW;
  END IF;

  v_producer_norm := public.normalize_catalog_token(NEW.producer);
  v_canonical_key := array_to_string(
    ARRAY[
      coalesce(NEW.vintage::TEXT, 'nv'),
      nullif(v_producer_norm, ''),
      v_name_norm
    ],
    '::'
  );

  v_details := CASE
    WHEN jsonb_typeof(NEW.ai_details) = 'object' THEN NEW.ai_details
    ELSE '{}'::jsonb
  END;

  v_vinification := (
    CASE
      WHEN jsonb_typeof(v_details->'vinification') = 'object' THEN v_details->'vinification'
      ELSE '{}'::jsonb
    END
  ) || jsonb_strip_nulls(
    jsonb_build_object(
      'fermentation_vessel', nullif(trim(coalesce(NEW.fermentation, '')), ''),
      'aging_vessel', nullif(trim(coalesce(NEW.aging_process, '')), '')
    )
  );

  INSERT INTO public.wine_catalog (
    canonical_key,
    name,
    producer,
    vintage,
    region,
    country,
    appellation,
    vineyard,
    wine_type,
    grapes,
    alcohol_percent,
    drink_start,
    peak_year,
    drink_end,
    aromas,
    structure,
    pairings,
    vinification,
    scores,
    details,
    sources,
    confidence,
    missing_fields,
    inferred_fields,
    name_norm,
    producer_norm,
    search_norm,
    updated_at
  ) VALUES (
    v_canonical_key,
    trim(NEW.name),
    nullif(trim(coalesce(NEW.producer, '')), ''),
    NEW.vintage,
    nullif(trim(coalesce(NEW.region, '')), ''),
    nullif(trim(coalesce(NEW.country, '')), ''),
    nullif(trim(coalesce(NEW.appellation, '')), ''),
    nullif(trim(coalesce(NEW.vineyard, '')), ''),
    nullif(trim(coalesce(NEW.wine_type, '')), ''),
    coalesce(NEW.grapes, '[]'::jsonb),
    NEW.alcohol_percent,
    NEW.drink_start,
    NEW.peak_year,
    NEW.drink_end,
    coalesce(NEW.aromas, '[]'::jsonb),
    coalesce(NEW.structure, '{}'::jsonb),
    coalesce(NEW.pairings, '[]'::jsonb),
    v_vinification,
    coalesce(NEW.scores, '[]'::jsonb),
    v_details,
    coalesce(NEW.ai_sources, '[]'::jsonb),
    CASE lower(coalesce(NEW.confidence, 'medium'))
      WHEN 'high' THEN 90
      WHEN 'low' THEN 40
      ELSE 65
    END,
    coalesce(NEW.missing_fields, '[]'::jsonb),
    '[]'::jsonb,
    v_name_norm,
    v_producer_norm,
    trim(
      concat_ws(
        ' ',
        v_name_norm,
        nullif(v_producer_norm, ''),
        coalesce(NEW.vintage::TEXT, '')
      )
    ),
    NOW()
  )
  ON CONFLICT (canonical_key)
  DO UPDATE SET
    name = EXCLUDED.name,
    producer = EXCLUDED.producer,
    vintage = EXCLUDED.vintage,
    region = EXCLUDED.region,
    country = EXCLUDED.country,
    appellation = EXCLUDED.appellation,
    vineyard = EXCLUDED.vineyard,
    wine_type = EXCLUDED.wine_type,
    grapes = EXCLUDED.grapes,
    alcohol_percent = EXCLUDED.alcohol_percent,
    drink_start = EXCLUDED.drink_start,
    peak_year = EXCLUDED.peak_year,
    drink_end = EXCLUDED.drink_end,
    aromas = EXCLUDED.aromas,
    structure = EXCLUDED.structure,
    pairings = EXCLUDED.pairings,
    vinification = EXCLUDED.vinification,
    scores = EXCLUDED.scores,
    details = EXCLUDED.details,
    sources = EXCLUDED.sources,
    confidence = EXCLUDED.confidence,
    missing_fields = EXCLUDED.missing_fields,
    name_norm = EXCLUDED.name_norm,
    producer_norm = EXCLUDED.producer_norm,
    search_norm = EXCLUDED.search_norm,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_wines_to_catalog_after_write ON public.wines;
CREATE TRIGGER sync_wines_to_catalog_after_write
AFTER INSERT OR UPDATE
ON public.wines
FOR EACH ROW
EXECUTE FUNCTION public.sync_wine_row_to_catalog();

-- One-time reconcile/backfill for existing data
WITH source_rows AS (
  SELECT
    w.*,
    public.normalize_catalog_token(w.name) AS name_norm_calc,
    public.normalize_catalog_token(w.producer) AS producer_norm_calc
  FROM public.wines w
),
prepared AS (
  SELECT
    array_to_string(
      ARRAY[
        coalesce(s.vintage::TEXT, 'nv'),
        nullif(s.producer_norm_calc, ''),
        s.name_norm_calc
      ],
      '::'
    ) AS canonical_key,
    trim(s.name) AS name,
    nullif(trim(coalesce(s.producer, '')), '') AS producer,
    s.vintage,
    nullif(trim(coalesce(s.region, '')), '') AS region,
    nullif(trim(coalesce(s.country, '')), '') AS country,
    nullif(trim(coalesce(s.appellation, '')), '') AS appellation,
    nullif(trim(coalesce(s.vineyard, '')), '') AS vineyard,
    nullif(trim(coalesce(s.wine_type, '')), '') AS wine_type,
    coalesce(s.grapes, '[]'::jsonb) AS grapes,
    s.alcohol_percent,
    s.drink_start,
    s.peak_year,
    s.drink_end,
    coalesce(s.aromas, '[]'::jsonb) AS aromas,
    coalesce(s.structure, '{}'::jsonb) AS structure,
    coalesce(s.pairings, '[]'::jsonb) AS pairings,
    (
      CASE
        WHEN jsonb_typeof(s.ai_details) = 'object' AND jsonb_typeof(s.ai_details->'vinification') = 'object'
          THEN s.ai_details->'vinification'
        ELSE '{}'::jsonb
      END
    ) || jsonb_strip_nulls(
      jsonb_build_object(
        'fermentation_vessel', nullif(trim(coalesce(s.fermentation, '')), ''),
        'aging_vessel', nullif(trim(coalesce(s.aging_process, '')), '')
      )
    ) AS vinification,
    CASE
      WHEN jsonb_typeof(s.ai_details) = 'object' THEN s.ai_details
      ELSE '{}'::jsonb
    END AS details,
    coalesce(s.ai_sources, '[]'::jsonb) AS sources,
    coalesce(s.scores, '[]'::jsonb) AS scores,
    CASE lower(coalesce(s.confidence, 'medium'))
      WHEN 'high' THEN 90
      WHEN 'low' THEN 40
      ELSE 65
    END AS confidence,
    coalesce(s.missing_fields, '[]'::jsonb) AS missing_fields,
    s.name_norm_calc AS name_norm,
    s.producer_norm_calc AS producer_norm,
    trim(
      concat_ws(
        ' ',
        s.name_norm_calc,
        nullif(s.producer_norm_calc, ''),
        coalesce(s.vintage::TEXT, '')
      )
    ) AS search_norm
  FROM source_rows s
  WHERE s.name_norm_calc <> ''
),
deduped AS (
  SELECT DISTINCT ON (canonical_key) *
  FROM prepared
  ORDER BY canonical_key, name
)
INSERT INTO public.wine_catalog (
  canonical_key,
  name,
  producer,
  vintage,
  region,
  country,
  appellation,
  vineyard,
  wine_type,
  grapes,
  alcohol_percent,
  drink_start,
  peak_year,
  drink_end,
  aromas,
  structure,
  pairings,
  vinification,
  scores,
  details,
  sources,
  confidence,
  missing_fields,
  inferred_fields,
  name_norm,
  producer_norm,
  search_norm,
  updated_at
)
SELECT
  p.canonical_key,
  p.name,
  p.producer,
  p.vintage,
  p.region,
  p.country,
  p.appellation,
  p.vineyard,
  p.wine_type,
  p.grapes,
  p.alcohol_percent,
  p.drink_start,
  p.peak_year,
  p.drink_end,
  p.aromas,
  p.structure,
  p.pairings,
  p.vinification,
  p.scores,
  p.details,
  p.sources,
  p.confidence,
  p.missing_fields,
  '[]'::jsonb AS inferred_fields,
  p.name_norm,
  p.producer_norm,
  p.search_norm,
  NOW()
FROM deduped p
ON CONFLICT (canonical_key)
DO UPDATE SET
  name = EXCLUDED.name,
  producer = EXCLUDED.producer,
  vintage = EXCLUDED.vintage,
  region = EXCLUDED.region,
  country = EXCLUDED.country,
  appellation = EXCLUDED.appellation,
  vineyard = EXCLUDED.vineyard,
  wine_type = EXCLUDED.wine_type,
  grapes = EXCLUDED.grapes,
  alcohol_percent = EXCLUDED.alcohol_percent,
  drink_start = EXCLUDED.drink_start,
  peak_year = EXCLUDED.peak_year,
  drink_end = EXCLUDED.drink_end,
  aromas = EXCLUDED.aromas,
  structure = EXCLUDED.structure,
  pairings = EXCLUDED.pairings,
  vinification = EXCLUDED.vinification,
  scores = EXCLUDED.scores,
  details = EXCLUDED.details,
  sources = EXCLUDED.sources,
  confidence = EXCLUDED.confidence,
  missing_fields = EXCLUDED.missing_fields,
  name_norm = EXCLUDED.name_norm,
  producer_norm = EXCLUDED.producer_norm,
  search_norm = EXCLUDED.search_norm,
  updated_at = NOW();
