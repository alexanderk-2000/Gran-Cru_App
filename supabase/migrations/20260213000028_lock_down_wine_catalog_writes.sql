-- The global wine catalog is kept in sync automatically by the SECURITY DEFINER
-- trigger sync_wine_row_to_catalog() (see 20260213000026_sync_wines_to_catalog_trigger.sql),
-- which runs with the privileges of its owner and therefore bypasses RLS regardless
-- of policies on this table. Direct client writes are no longer needed and previously
-- let any authenticated user overwrite arbitrary entries in the shared catalog.
DROP POLICY IF EXISTS "Authenticated can insert wine_catalog" ON public.wine_catalog;
DROP POLICY IF EXISTS "Authenticated can update wine_catalog" ON public.wine_catalog;
