-- ============================================================
-- Inventory Ledger Refactor: Movement-based architecture
-- with Weighted Average Cost, immutability triggers,
-- financial invariant enforcement, and safe undo
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Extend ingredients: add average_unit_cost
-- ============================================================
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS average_unit_cost NUMERIC(15,6) NOT NULL DEFAULT 0;

-- Backfill average_unit_cost from existing data
UPDATE public.ingredients
SET average_unit_cost = CASE
  WHEN quantity > 0 AND total_value > 0 THEN total_value / quantity
  ELSE 0
END
WHERE average_unit_cost = 0;

-- ============================================================
-- 2. Extend inventory_movements table
-- ============================================================
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS amount_tnd_delta NUMERIC(15,4) NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.supplier_invoices(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS reversed_movement_id UUID REFERENCES public.inventory_movements(id);

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS business_unit business_unit_enum;

-- Update movement_type CHECK to allow REVERSAL
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('CONSUME', 'RESTOCK', 'ADJUST', 'REVERSAL'));

-- Backfill business_unit from ingredients
UPDATE public.inventory_movements m
SET business_unit = i.business_unit
FROM public.ingredients i
WHERE m.ingredient_id = i.id
  AND m.business_unit IS NULL;

-- ============================================================
-- 3. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_inventory_movements_business_unit
  ON public.inventory_movements(business_unit);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_reversed
  ON public.inventory_movements(reversed_movement_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_ingredient_created_at
  ON public.inventory_movements(ingredient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_invoice_id
  ON public.inventory_movements(invoice_id);

-- ============================================================
-- 4. Ledger Immutability Triggers
-- ============================================================

-- 4a. Block mutation of core fields on UPDATE
CREATE OR REPLACE FUNCTION public.prevent_movement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow toggling is_reversed from FALSE to TRUE (the only allowed mutation)
  IF OLD.is_reversed = FALSE AND NEW.is_reversed = TRUE
     AND OLD.qty_change = NEW.qty_change
     AND OLD.amount_tnd_delta = NEW.amount_tnd_delta
     AND OLD.movement_type = NEW.movement_type
     AND OLD.ingredient_id = NEW.ingredient_id
  THEN
    RETURN NEW;
  END IF;

  -- Block all other mutations
  RAISE EXCEPTION 'inventory_movements rows are immutable. Cannot modify core fields. Use a REVERSAL movement instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_movement_mutation ON public.inventory_movements;
CREATE TRIGGER trg_prevent_movement_mutation
  BEFORE UPDATE ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_movement_mutation();

-- 4b. Block all deletes
CREATE OR REPLACE FUNCTION public.prevent_movement_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements rows cannot be deleted. Ledger entries are permanent.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_movement_delete ON public.inventory_movements;
CREATE TRIGGER trg_prevent_movement_delete
  BEFORE DELETE ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_movement_delete();

-- ============================================================
-- 5. RPC: perform_restock
-- ============================================================
CREATE OR REPLACE FUNCTION public.perform_restock(
  p_ingredient_id UUID,
  p_qty_delta NUMERIC,
  p_amount_tnd_delta NUMERIC,
  p_invoice_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ingredient public.ingredients%ROWTYPE;
  v_new_qty NUMERIC;
  v_new_total_value NUMERIC;
  v_new_avg_cost NUMERIC;
  v_movement_id UUID;
  v_seuil_value NUMERIC;
  v_alert_generated BOOLEAN := FALSE;
  v_event_type TEXT;
BEGIN
  -- Validate inputs
  IF p_qty_delta <= 0 THEN
    RAISE EXCEPTION 'qty_delta must be positive for restock';
  END IF;
  IF p_amount_tnd_delta < 0 THEN
    RAISE EXCEPTION 'amount_tnd_delta cannot be negative for restock';
  END IF;

  -- 1. Lock ingredient row
  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = p_ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: %', p_ingredient_id;
  END IF;

  -- 2. Compute Weighted Average Cost
  v_new_qty := COALESCE(v_ingredient.quantity, 0) + p_qty_delta;
  v_new_total_value := COALESCE(v_ingredient.total_value, 0) + p_amount_tnd_delta;

  IF v_new_qty > 0 THEN
    v_new_avg_cost := v_new_total_value / v_new_qty;
  ELSE
    v_new_avg_cost := 0;
  END IF;

  -- 3. Update ingredient
  UPDATE public.ingredients
  SET
    quantity = v_new_qty,
    total_value = v_new_total_value,
    average_unit_cost = v_new_avg_cost,
    updated_at = NOW()
  WHERE id = p_ingredient_id;

  -- 4. Financial invariant check
  IF v_new_qty > 0 AND ABS(v_new_total_value - (v_new_qty * v_new_avg_cost)) > 0.01 THEN
    RAISE EXCEPTION 'Financial invariant violation: total_value (%) != quantity (%) * average_unit_cost (%)',
      v_new_total_value, v_new_qty, v_new_avg_cost;
  END IF;

  -- 5. Insert RESTOCK movement
  INSERT INTO public.inventory_movements (
    ingredient_id,
    movement_type,
    qty_change,
    amount_tnd_delta,
    invoice_id,
    business_unit,
    reason,
    created_at
  )
  VALUES (
    p_ingredient_id,
    'RESTOCK',
    p_qty_delta,
    p_amount_tnd_delta,
    p_invoice_id,
    v_ingredient.business_unit,
    'RESTOCK',
    NOW()
  )
  RETURNING id INTO v_movement_id;

  -- 6. Generate stock alerts if needed
  v_seuil_value := COALESCE(
    (to_jsonb(v_ingredient) ->> 'seuil')::NUMERIC,
    (to_jsonb(v_ingredient) ->> 'min_quantity')::NUMERIC,
    0
  );

  IF v_new_qty <= 0 THEN
    v_alert_generated := TRUE;
    v_event_type := 'OUT_OF_STOCK';
  ELSIF v_new_qty <= v_seuil_value THEN
    v_alert_generated := TRUE;
    v_event_type := 'LOW_STOCK';
  END IF;

  IF v_alert_generated THEN
    INSERT INTO public.stock_alert_events (
      ingredient_id, event_type, quantity_after, seuil, created_at, meta
    ) VALUES (
      p_ingredient_id, v_event_type, v_new_qty, v_seuil_value, NOW(),
      jsonb_build_object('source', 'perform_restock', 'movement_id', v_movement_id)
    );
  END IF;

  -- 7. Return result
  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'new_quantity', v_new_qty,
    'new_total_value', v_new_total_value,
    'new_average_unit_cost', v_new_avg_cost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.perform_restock(UUID, NUMERIC, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_restock(UUID, NUMERIC, NUMERIC, UUID) TO service_role;

-- ============================================================
-- 6. RPC: undo_movement
-- ============================================================
CREATE OR REPLACE FUNCTION public.undo_movement(
  p_movement_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement public.inventory_movements%ROWTYPE;
  v_ingredient public.ingredients%ROWTYPE;
  v_new_qty NUMERIC;
  v_new_total_value NUMERIC;
  v_new_avg_cost NUMERIC;
  v_reversal_id UUID;
  v_has_subsequent BOOLEAN;
BEGIN
  -- 1. Fetch the movement to undo
  SELECT * INTO v_movement
  FROM public.inventory_movements
  WHERE id = p_movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movement not found: %', p_movement_id;
  END IF;

  -- 2. Validate not already reversed
  IF v_movement.is_reversed THEN
    RAISE EXCEPTION 'Movement % has already been reversed', p_movement_id;
  END IF;

  -- Prevent undo of REVERSAL movements
  IF v_movement.movement_type = 'REVERSAL' THEN
    RAISE EXCEPTION 'Cannot undo a REVERSAL movement';
  END IF;

  -- 3. Lock ingredient row
  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = v_movement.ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: %', v_movement.ingredient_id;
  END IF;

  -- 4. Check for subsequent movements (uses idx_inventory_movements_ingredient_created_at)
  SELECT EXISTS (
    SELECT 1
    FROM public.inventory_movements
    WHERE ingredient_id = v_movement.ingredient_id
      AND created_at > v_movement.created_at
      AND id != p_movement_id
    LIMIT 1
  ) INTO v_has_subsequent;

  IF v_has_subsequent THEN
    RAISE EXCEPTION 'Cannot undo: subsequent movements exist for this ingredient. Create an ADJUSTMENT instead.';
  END IF;

  -- 5. Validate stock won't go negative
  v_new_qty := COALESCE(v_ingredient.quantity, 0) - v_movement.qty_change;
  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Cannot undo: would result in negative stock (current: %, movement qty: %)',
      v_ingredient.quantity, v_movement.qty_change;
  END IF;

  -- 6. Calculate new values
  v_new_total_value := COALESCE(v_ingredient.total_value, 0) - v_movement.amount_tnd_delta;
  -- Ensure total_value doesn't go negative due to rounding
  IF v_new_total_value < 0 THEN
    v_new_total_value := 0;
  END IF;

  -- Recalculate average_unit_cost
  -- Since no subsequent movements exist (guaranteed by step 4),
  -- the new avg is simply the remaining value / remaining qty
  IF v_new_qty > 0 THEN
    v_new_avg_cost := v_new_total_value / v_new_qty;
  ELSE
    v_new_avg_cost := 0;
  END IF;

  -- 7. Insert REVERSAL movement
  INSERT INTO public.inventory_movements (
    ingredient_id,
    movement_type,
    qty_change,
    amount_tnd_delta,
    reversed_movement_id,
    business_unit,
    reason,
    created_at
  )
  VALUES (
    v_movement.ingredient_id,
    'REVERSAL',
    -(v_movement.qty_change),
    -(v_movement.amount_tnd_delta),
    p_movement_id,
    v_movement.business_unit,
    'UNDO of movement ' || p_movement_id::TEXT,
    NOW()
  )
  RETURNING id INTO v_reversal_id;

  -- 8. Mark original as reversed (allowed by immutability trigger)
  UPDATE public.inventory_movements
  SET is_reversed = TRUE
  WHERE id = p_movement_id;

  -- 9. Update ingredient
  UPDATE public.ingredients
  SET
    quantity = v_new_qty,
    total_value = v_new_total_value,
    average_unit_cost = v_new_avg_cost,
    updated_at = NOW()
  WHERE id = v_movement.ingredient_id;

  -- 10. Financial invariant check
  IF v_new_qty > 0 AND ABS(v_new_total_value - (v_new_qty * v_new_avg_cost)) > 0.01 THEN
    RAISE EXCEPTION 'Financial invariant violation after undo: total_value (%) != quantity (%) * average_unit_cost (%)',
      v_new_total_value, v_new_qty, v_new_avg_cost;
  END IF;

  -- 11. Return result
  RETURN jsonb_build_object(
    'reversal_movement_id', v_reversal_id,
    'new_quantity', v_new_qty,
    'new_total_value', v_new_total_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_movement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_movement(UUID) TO service_role;

-- ============================================================
-- 7. Update apply_order_inventory_consumption to use
--    average_unit_cost for value deduction and write
--    amount_tnd_delta + business_unit to movements
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_order_inventory_consumption(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_summary JSONB := '[]'::JSONB;
  v_alert_count INT := 0;
  v_after_quantity NUMERIC;
  v_alert_generated BOOLEAN;
  v_event_type TEXT;
  v_row RECORD;
  v_value_deduction NUMERIC;
  v_new_total_value NUMERIC;
  v_new_avg_cost NUMERIC;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF COALESCE(v_order.inventory_applied, FALSE) THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'already_applied', TRUE,
      'alerts_generated', 0,
      'ingredients', '[]'::JSONB
    );
  END IF;

  FOR v_row IN
    WITH direct_menu AS (
      SELECT
        mii.ingredient_id,
        (mii.qty_used * oi.qty::NUMERIC) AS qty_to_consume
      FROM public.order_items oi
      JOIN public.menu_item_ingredients mii
        ON mii.menu_item_id = oi.item_id
      WHERE oi.order_id = p_order_id
        AND oi.item_type = 'menu'
        AND oi.item_id IS NOT NULL
    ),
    deal_menu AS (
      SELECT
        mii.ingredient_id,
        (
          mii.qty_used
          * oi.qty::NUMERIC
          * COALESCE((to_jsonb(di) ->> 'quantity')::NUMERIC, 1)
        ) AS qty_to_consume
      FROM public.order_items oi
      JOIN public.deal_items di
        ON di.deal_id = oi.item_id
      JOIN public.menu_item_ingredients mii
        ON mii.menu_item_id = di.menu_item_id
      WHERE oi.order_id = p_order_id
        AND oi.item_type = 'deal'
        AND oi.item_id IS NOT NULL
    ),
    total_consumption AS (
      SELECT
        ingredient_id,
        SUM(qty_to_consume) AS qty_to_consume
      FROM (
        SELECT * FROM direct_menu
        UNION ALL
        SELECT * FROM deal_menu
      ) all_consumption
      GROUP BY ingredient_id
    )
    SELECT
      tc.ingredient_id,
      tc.qty_to_consume,
      i.quantity AS before_quantity,
      i.total_value AS before_total_value,
      i.average_unit_cost AS avg_cost,
      i.business_unit AS ingredient_business_unit,
      COALESCE(
        (to_jsonb(i) ->> 'seuil')::NUMERIC,
        (to_jsonb(i) ->> 'min_quantity')::NUMERIC,
        0
      ) AS seuil_value
    FROM total_consumption tc
    JOIN public.ingredients i
      ON i.id = tc.ingredient_id
    ORDER BY tc.ingredient_id
    FOR UPDATE OF i
  LOOP
    -- Calculate value deduction using Weighted Average Cost
    v_value_deduction := v_row.qty_to_consume * COALESCE(v_row.avg_cost, 0);
    v_after_quantity := COALESCE(v_row.before_quantity, 0) - v_row.qty_to_consume;
    v_new_total_value := GREATEST(COALESCE(v_row.before_total_value, 0) - v_value_deduction, 0);

    -- average_unit_cost stays the same on consumption (WAC rule)
    v_new_avg_cost := COALESCE(v_row.avg_cost, 0);
    IF v_after_quantity <= 0 THEN
      v_new_avg_cost := 0;
      v_new_total_value := 0;
    END IF;

    UPDATE public.ingredients
    SET
      quantity = v_after_quantity,
      total_value = v_new_total_value,
      average_unit_cost = v_new_avg_cost,
      updated_at = NOW()
    WHERE id = v_row.ingredient_id;

    INSERT INTO public.inventory_movements (
      ingredient_id,
      movement_type,
      qty_change,
      amount_tnd_delta,
      reason,
      ref_order_id,
      ref_ticket_id,
      business_unit,
      created_at
    )
    VALUES (
      v_row.ingredient_id,
      'CONSUME',
      -v_row.qty_to_consume,
      -v_value_deduction,
      'ORDER_CONSUMPTION',
      p_order_id,
      NULL,
      v_row.ingredient_business_unit,
      NOW()
    );

    v_alert_generated := FALSE;
    v_event_type := NULL;

    IF v_after_quantity <= 0 THEN
      v_alert_generated := TRUE;
      v_event_type := 'OUT_OF_STOCK';
    ELSIF v_after_quantity <= COALESCE(v_row.seuil_value, 0) THEN
      v_alert_generated := TRUE;
      v_event_type := 'LOW_STOCK';
    END IF;

    IF v_alert_generated THEN
      v_alert_count := v_alert_count + 1;

      INSERT INTO public.stock_alert_events (
        ingredient_id,
        event_type,
        quantity_after,
        seuil,
        created_at,
        meta
      )
      VALUES (
        v_row.ingredient_id,
        v_event_type,
        v_after_quantity,
        COALESCE(v_row.seuil_value, 0),
        NOW(),
        jsonb_build_object(
          'order_id', p_order_id,
          'source', 'apply_order_inventory_consumption'
        )
      );
    END IF;

    v_summary := v_summary || jsonb_build_array(
      jsonb_build_object(
        'ingredient_id', v_row.ingredient_id,
        'before_quantity', v_row.before_quantity,
        'after_quantity', v_after_quantity,
        'alert_generated', v_alert_generated
      )
    );
  END LOOP;

  UPDATE public.orders
  SET inventory_applied = TRUE
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'already_applied', FALSE,
    'alerts_generated', v_alert_count,
    'ingredients', v_summary
  );
END;
$$;

-- ============================================================
-- 8. Update v_ingredient_status view to expose average_unit_cost
-- ============================================================
DROP VIEW IF EXISTS public.v_ingredient_status;

CREATE OR REPLACE VIEW public.v_ingredient_status AS
SELECT
  i.*,
  CASE
    WHEN i.quantity <= 0 THEN 'out_of_stock'::stock_status_enum
    WHEN i.quantity <= COALESCE(
      (to_jsonb(i) ->> 'seuil')::NUMERIC,
      (to_jsonb(i) ->> 'min_quantity')::NUMERIC,
      0
    ) THEN 'low_stock'::stock_status_enum
    ELSE 'in_stock'::stock_status_enum
  END AS computed_status,
  COALESCE(
    (to_jsonb(i) ->> 'seuil')::NUMERIC,
    (to_jsonb(i) ->> 'min_quantity')::NUMERIC,
    0
  ) AS seuil
FROM public.ingredients i;

-- ============================================================
-- 9. RLS for new movement columns (existing policies suffice,
--    but ensure UPDATE policy exists for is_reversed toggling)
-- ============================================================
DROP POLICY IF EXISTS pos_inventory_movements_update ON public.inventory_movements;
CREATE POLICY pos_inventory_movements_update
  ON public.inventory_movements FOR UPDATE
  USING (auth.role() = 'authenticated');

COMMIT;
