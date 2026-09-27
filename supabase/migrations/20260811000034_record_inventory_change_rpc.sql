-- Atomic stock changes.
--
-- Until now every stock mutation happened in the client: read the current
-- quantity, compute the new one, write it back, then insert the inventory
-- event - and if that insert failed, write the old quantity back again as a
-- hand-rolled "rollback" (services/storage.legacy.ts: adjustStock,
-- consumeBottle, recordPurchase, recordLoss).
--
-- That loses updates. Two devices, or a replayed offline queue entry, read the
-- same quantity and both write their own result; the second overwrites the
-- first instead of adding to it. An abort between the two writes leaves stock
-- and event log disagreeing permanently.
--
-- This function does the whole thing in one transaction with the wine row
-- locked, so concurrent changes serialize instead of racing.
--
-- SECURITY INVOKER (the default) is deliberate: RLS still applies with the
-- caller's own rights, so this grants no access the client did not already
-- have - it only makes the write atomic.

CREATE OR REPLACE FUNCTION public.record_inventory_change(
  p_wine_id UUID,
  p_delta INTEGER,
  p_type TEXT,
  p_source TEXT DEFAULT 'manual',
  p_note TEXT DEFAULT NULL,
  p_price_per_bottle NUMERIC DEFAULT NULL
)
RETURNS public.wines
LANGUAGE plpgsql
AS $$
DECLARE
  v_wine public.wines;
  v_new_quantity INTEGER;
  v_new_price NUMERIC;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nicht eingeloggt.';
  END IF;

  IF p_type NOT IN ('consume', 'purchase', 'adjustment', 'loss') THEN
    RAISE EXCEPTION 'Unbekannter Ereignistyp: %', p_type;
  END IF;

  -- FOR UPDATE is the point of this whole function: it serializes concurrent
  -- changes to the same bottle count.
  SELECT * INTO v_wine
  FROM public.wines
  WHERE id = p_wine_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wein nicht gefunden.';
  END IF;

  v_new_quantity := COALESCE(v_wine.quantity, 0) + p_delta;

  IF v_new_quantity < 0 THEN
    IF p_type = 'adjustment' THEN
      -- A stocktake correction may legitimately end at zero; clamping keeps
      -- the previous behaviour of adjustStock().
      v_new_quantity := 0;
    ELSE
      RAISE EXCEPTION 'Nicht genügend Flaschen im Bestand.';
    END IF;
  END IF;

  v_new_price := v_wine.purchase_price;

  -- A repeat purchase moves the average cost per bottle.
  IF p_type = 'purchase' AND p_price_per_bottle IS NOT NULL AND p_delta > 0 THEN
    v_new_price := (
      (COALESCE(v_wine.purchase_price, 0) * COALESCE(v_wine.quantity, 0))
      + (p_price_per_bottle * p_delta)
    ) / NULLIF(v_new_quantity, 0);
  END IF;

  UPDATE public.wines
  SET quantity = v_new_quantity,
      purchase_price = COALESCE(v_new_price, purchase_price),
      updated_at = NOW()
  WHERE id = p_wine_id
  RETURNING * INTO v_wine;

  INSERT INTO public.inventory_events (wine_id, user_id, type, delta, source, note)
  VALUES (p_wine_id, v_user_id, p_type, p_delta, COALESCE(p_source, 'manual'), p_note);

  RETURN v_wine;
END;
$$;

COMMENT ON FUNCTION public.record_inventory_change IS
  'Changes a wine''s bottle count and appends the matching inventory_event in one transaction, with the wine row locked.';

-- Anonymous sessions are real sessions in this app (demo mode), so they need
-- it too; RLS decides what either role may actually touch.
GRANT EXECUTE ON FUNCTION public.record_inventory_change(UUID, INTEGER, TEXT, TEXT, TEXT, NUMERIC)
  TO authenticated, anon;
