-- Extend inventory_events to cover moving bottles between cellars and
-- recording lost/broken bottles, and make the log properly append-only:
-- stock movements should be immutable events, not editable/deletable rows.
ALTER TABLE public.inventory_events
DROP CONSTRAINT IF EXISTS inventory_events_type_check;

ALTER TABLE public.inventory_events
ADD CONSTRAINT inventory_events_type_check
CHECK (type IN ('consume', 'purchase', 'adjustment', 'transfer', 'loss', 'soft_delete', 'restore'));

DROP POLICY IF EXISTS "inventory_events_update_own" ON public.inventory_events;
DROP POLICY IF EXISTS "inventory_events_delete_own" ON public.inventory_events;
