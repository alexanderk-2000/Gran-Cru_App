-- ============================================
-- SEED DATA FOR DEVELOPMENT
-- ============================================

-- Note: This seed file is for LOCAL DEVELOPMENT ONLY
-- It will create demo wines for testing purposes

-- Insert demo wines (user_id will be set by the application)
-- These are examples from constants.ts converted to SQL

INSERT INTO wines (
  id,
  user_id,
  name,
  producer,
  vintage,
  region,
  country,
  category,
  quantity,
  purchase_price,
  format,
  drink_start,
  drink_end,
  alcohol_percent,
  grapes,
  aromas,
  pairings,
  scores,
  is_favorite
) VALUES
(
  uuid_generate_v4(),
  '00000000-0000-0000-0000-000000000000', -- Placeholder, will be replaced by app
  'Château Margaux',
  'Château Margaux',
  2015,
  'Bordeaux',
  'Frankreich',
  'Investment',
  6,
  1200.00,
  '0.75L',
  2030,
  2060,
  13.5,
  '[{"name": "Cabernet Sauvignon"}, {"name": "Merlot"}, {"name": "Petit Verdot"}]'::jsonb,
  '[{"tag": "Schwarze Johannisbeere", "intensity": 5}, {"tag": "Veilchen", "intensity": 4}, {"tag": "Zeder", "intensity": 4}, {"tag": "Graphit", "intensity": 3}]'::jsonb,
  '[{"item": "Lammkarree", "category": "Fleisch"}, {"item": "Wildgericht", "category": "Fleisch"}]'::jsonb,
  '[{"critic": "Robert Parker", "score": "99"}, {"critic": "James Suckling", "score": "100"}]'::jsonb,
  true
),
(
  uuid_generate_v4(),
  '00000000-0000-0000-0000-000000000000',
  'Sassicaia Tenuta San Guido',
  'Tenuta San Guido',
  2021,
  'Toskana',
  'Italien',
  'Investment',
  3,
  320.00,
  '0.75L',
  2028,
  2045,
  NULL,
  '[]'::jsonb,
  '[{"tag": "Dunkle Beeren", "intensity": 4}, {"tag": "Rosmarin", "intensity": 3}, {"tag": "Pfeffer", "intensity": 3}]'::jsonb,
  '[]'::jsonb,
  '[{"critic": "Wine Spectator", "score": "98"}]'::jsonb,
  false
),
(
  uuid_generate_v4(),
  '00000000-0000-0000-0000-000000000000',
  'Krug Vintage Brut',
  'Krug',
  2008,
  'Champagne',
  'Frankreich',
  'Daily Drinker',
  4,
  380.00,
  '0.75L',
  2022,
  2038,
  NULL,
  '[]'::jsonb,
  '[{"tag": "Brioche", "intensity": 5}, {"tag": "Honig", "intensity": 4}, {"tag": "Zitrus", "intensity": 3}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true
);
