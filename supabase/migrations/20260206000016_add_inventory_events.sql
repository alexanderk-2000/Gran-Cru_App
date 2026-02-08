-- Inventory events (stock changes / consumption history)
CREATE TABLE IF NOT EXISTS public.inventory_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wine_id UUID NOT NULL REFERENCES public.wines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('consume', 'purchase', 'adjustment', 'soft_delete', 'restore')),
  delta INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'detail',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_events_user_id_created_at ON public.inventory_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_events_wine_id ON public.inventory_events(wine_id);
CREATE INDEX IF NOT EXISTS idx_inventory_events_type ON public.inventory_events(type);

ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_events_select_own" ON public.inventory_events;
DROP POLICY IF EXISTS "inventory_events_insert_own" ON public.inventory_events;
DROP POLICY IF EXISTS "inventory_events_update_own" ON public.inventory_events;
DROP POLICY IF EXISTS "inventory_events_delete_own" ON public.inventory_events;

CREATE POLICY "inventory_events_select_own"
ON public.inventory_events
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "inventory_events_insert_own"
ON public.inventory_events
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "inventory_events_update_own"
ON public.inventory_events
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "inventory_events_delete_own"
ON public.inventory_events
FOR DELETE
USING (auth.uid() = user_id);
