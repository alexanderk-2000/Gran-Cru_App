-- Allow authenticated users to contribute to shared wine catalog
ALTER TABLE public.wine_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can insert wine_catalog" ON public.wine_catalog;
CREATE POLICY "Authenticated can insert wine_catalog"
ON public.wine_catalog
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update wine_catalog" ON public.wine_catalog;
CREATE POLICY "Authenticated can update wine_catalog"
ON public.wine_catalog
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
