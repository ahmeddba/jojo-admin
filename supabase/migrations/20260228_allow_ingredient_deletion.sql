-- ============================================================
-- Soft-delete for ingredients + denormalized ingredient name
-- on inventory_movements for permanent audit trail.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Add deleted_at to ingredients (soft-delete)
-- ============================================================
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================
-- 2. Add ingredient_name_snapshot to inventory_movements
-- ============================================================
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS ingredient_name_snapshot TEXT;

-- Temporarily disable immutability trigger for backfill
ALTER TABLE public.inventory_movements DISABLE TRIGGER trg_prevent_movement_mutation;

-- Backfill from existing ingredient data
UPDATE public.inventory_movements m
SET ingredient_name_snapshot = i.name
FROM public.ingredients i
WHERE m.ingredient_id = i.id
  AND m.ingredient_name_snapshot IS NULL;

-- Re-enable immutability trigger
ALTER TABLE public.inventory_movements ENABLE TRIGGER trg_prevent_movement_mutation;

-- ============================================================
-- 2b. Add UPDATE to movement_type check constraint
-- ============================================================
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('CONSUME', 'RESTOCK', 'ADJUST', 'REVERSAL', 'CREATE', 'DELETE', 'UPDATE'));

-- ============================================================
-- 3. Update v_ingredient_status to exclude soft-deleted
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
FROM public.ingredients i
WHERE i.deleted_at IS NULL;

-- ============================================================
-- 4. Update perform_restock to write ingredient_name_snapshot
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
  IF p_qty_delta <= 0 THEN
    RAISE EXCEPTION 'qty_delta must be positive for restock';
  END IF;
  IF p_amount_tnd_delta < 0 THEN
    RAISE EXCEPTION 'amount_tnd_delta cannot be negative for restock';
  END IF;

  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = p_ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: %', p_ingredient_id;
  END IF;

  v_new_qty := COALESCE(v_ingredient.quantity, 0) + p_qty_delta;
  v_new_total_value := COALESCE(v_ingredient.total_value, 0) + p_amount_tnd_delta;

  IF v_new_qty > 0 THEN
    v_new_avg_cost := v_new_total_value / v_new_qty;
  ELSE
    v_new_avg_cost := 0;
  END IF;

  UPDATE public.ingredients
  SET
    quantity = v_new_qty,
    total_value = v_new_total_value,
    average_unit_cost = v_new_avg_cost,
    updated_at = NOW()
  WHERE id = p_ingredient_id;

  IF v_new_qty > 0 AND ABS(v_new_total_value - (v_new_qty * v_new_avg_cost)) > 0.01 THEN
    RAISE EXCEPTION 'Financial invariant violation: total_value (%) != quantity (%) * average_unit_cost (%)',
      v_new_total_value, v_new_qty, v_new_avg_cost;
  END IF;

  INSERT INTO public.inventory_movements (
    ingredient_id,
    ingredient_name_snapshot,
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
    v_ingredient.name,
    'RESTOCK',
    p_qty_delta,
    p_amount_tnd_delta,
    p_invoice_id,
    v_ingredient.business_unit,
    'RESTOCK',
    NOW()
  )
  RETURNING id INTO v_movement_id;

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

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'new_quantity', v_new_qty,
    'new_total_value', v_new_total_value,
    'new_average_unit_cost', v_new_avg_cost
  );
END;
$$;

-- ============================================================
-- 5. Update undo_movement to write ingredient_name_snapshot
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
  SELECT * INTO v_movement
  FROM public.inventory_movements
  WHERE id = p_movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movement not found: %', p_movement_id;
  END IF;

  IF v_movement.is_reversed THEN
    RAISE EXCEPTION 'Movement % has already been reversed', p_movement_id;
  END IF;

  IF v_movement.movement_type = 'REVERSAL' THEN
    RAISE EXCEPTION 'Cannot undo a REVERSAL movement';
  END IF;

  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = v_movement.ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: %', v_movement.ingredient_id;
  END IF;

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

  v_new_qty := COALESCE(v_ingredient.quantity, 0) - v_movement.qty_change;
  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Cannot undo: would result in negative stock (current: %, movement qty: %)',
      v_ingredient.quantity, v_movement.qty_change;
  END IF;

  v_new_total_value := COALESCE(v_ingredient.total_value, 0) - v_movement.amount_tnd_delta;
  IF v_new_total_value < 0 THEN
    v_new_total_value := 0;
  END IF;

  IF v_new_qty > 0 THEN
    v_new_avg_cost := v_new_total_value / v_new_qty;
  ELSE
    v_new_avg_cost := 0;
  END IF;

  INSERT INTO public.inventory_movements (
    ingredient_id,
    ingredient_name_snapshot,
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
    v_ingredient.name,
    'REVERSAL',
    -(v_movement.qty_change),
    -(v_movement.amount_tnd_delta),
    p_movement_id,
    v_movement.business_unit,
    'UNDO of movement ' || p_movement_id::TEXT,
    NOW()
  )
  RETURNING id INTO v_reversal_id;

  UPDATE public.inventory_movements
  SET is_reversed = TRUE
  WHERE id = p_movement_id;

  UPDATE public.ingredients
  SET
    quantity = v_new_qty,
    total_value = v_new_total_value,
    average_unit_cost = v_new_avg_cost,
    updated_at = NOW()
  WHERE id = v_movement.ingredient_id;

  IF v_new_qty > 0 AND ABS(v_new_total_value - (v_new_qty * v_new_avg_cost)) > 0.01 THEN
    RAISE EXCEPTION 'Financial invariant violation after undo: total_value (%) != quantity (%) * average_unit_cost (%)',
      v_new_total_value, v_new_qty, v_new_avg_cost;
  END IF;

  RETURN jsonb_build_object(
    'reversal_movement_id', v_reversal_id,
    'new_quantity', v_new_qty,
    'new_total_value', v_new_total_value
  );
END;
$$;

-- ============================================================
-- 6. Update apply_order_inventory_consumption
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
      i.name AS ingredient_name,
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
    v_value_deduction := v_row.qty_to_consume * COALESCE(v_row.avg_cost, 0);
    v_after_quantity := COALESCE(v_row.before_quantity, 0) - v_row.qty_to_consume;
    v_new_total_value := GREATEST(COALESCE(v_row.before_total_value, 0) - v_value_deduction, 0);

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
      ingredient_name_snapshot,
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
      v_row.ingredient_name,
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
-- 7. RPC: soft_delete_ingredient
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_ingredient(
  p_ingredient_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ingredient public.ingredients%ROWTYPE;
BEGIN
  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = p_ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: %', p_ingredient_id;
  END IF;

  IF v_ingredient.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ingredient already deleted';
  END IF;

  IF COALESCE(v_ingredient.quantity, 0) != 0 THEN
    RAISE EXCEPTION 'Cannot delete: quantity must be 0 before deletion (current: %)', v_ingredient.quantity;
  END IF;

  -- Record DELETE movement with name snapshot
  INSERT INTO public.inventory_movements (
    ingredient_id,
    ingredient_name_snapshot,
    movement_type,
    qty_change,
    amount_tnd_delta,
    business_unit,
    reason,
    created_at
  )
  VALUES (
    p_ingredient_id,
    v_ingredient.name,
    'DELETE',
    0,
    0,
    v_ingredient.business_unit,
    'Ingredient deleted: ' || v_ingredient.name,
    NOW()
  );

  -- Soft-delete
  UPDATE public.ingredients
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_ingredient_id;

  -- Remove from recipes
  DELETE FROM public.menu_item_ingredients
  WHERE ingredient_id = p_ingredient_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_ingredient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_ingredient(UUID) TO service_role;

-- ============================================================
-- 8. RPC: update_ingredient_name_snapshot
--    Updates ingredient_name_snapshot on all movements for a
--    given ingredient (used when ingredient is renamed).
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_ingredient_name_snapshot(
  p_ingredient_id UUID,
  p_new_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily disable immutability trigger
  ALTER TABLE public.inventory_movements DISABLE TRIGGER trg_prevent_movement_mutation;

  UPDATE public.inventory_movements
  SET ingredient_name_snapshot = p_new_name
  WHERE ingredient_id = p_ingredient_id;

  -- Re-enable trigger
  ALTER TABLE public.inventory_movements ENABLE TRIGGER trg_prevent_movement_mutation;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_ingredient_name_snapshot(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ingredient_name_snapshot(UUID, TEXT) TO service_role;

COMMIT;
