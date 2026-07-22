-- Security hardening identified in docs/WEITERENTWICKLUNGSPOTENZIAL_2026-07-22.md:
--
-- 1. wine_catalog_aliases was created (20260204000014) without RLS. The
--    baseline GRANT ALL (20260213000029) therefore left it fully
--    readable/writable by anon/authenticated. No client code uses this
--    table yet (it is populated by future server-side/trigger logic), so
--    it is locked down entirely: RLS enabled, no policies, i.e. deny all
--    to anon/authenticated. Only service_role / SECURITY DEFINER
--    functions bypass RLS and can populate it later.
-- 2. test1234 / manual_test_table were scratch tables from early
--    migration work that never got cleaned up and ship into every fresh
--    database (including production) with no RLS at all.
-- 3. ai_cache was created but never wired up by any server code (the
--    real cache is server/src/cache/aiCache.js, an in-memory Map) - dead
--    schema with no purpose, dropped instead of left unused.

ALTER TABLE public.wine_catalog_aliases ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS public.test1234;
DROP TABLE IF EXISTS public.manual_test_table;
DROP TABLE IF EXISTS public.ai_cache;
