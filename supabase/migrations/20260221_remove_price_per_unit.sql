-- ============================================================
-- Remove price_per_unit and add total_value for stock valuation
-- ============================================================

BEGIN;

-- 1. Add total_value mapping
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS total_value NUMERIC(15,4) NOT NULL DEFAULT 0;

-- 2. Migrate existing data (calculate total_value from quantity * price_per_unit)
UPDATE public.ingredients
SET total_value = quantity * price_per_unit
WHERE price_per_unit IS NOT NULL;

-- 3. Drop dependent views
DROP VIEW IF EXISTS public.v_ingredient_status;

-- 4. Drop price_per_unit
ALTER TABLE public.ingredients
  DROP COLUMN IF EXISTS price_per_unit;

-- 5. Re-create v_ingredient_status
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

-- 6. Update apply_order_inventory_consumption function to handle proportional total_value deduction
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
    -- Calculate value deduction proportionally
    IF v_row.before_quantity > 0 THEN
      -- Don't deduct more than what we have
      v_value_deduction := (LEAST(v_row.qty_to_consume, v_row.before_quantity) / v_row.before_quantity) * v_row.before_total_value;
    ELSE
      v_value_deduction := 0;
    END IF;

    UPDATE public.ingredients
    SET
      quantity = COALESCE(quantity, 0) - v_row.qty_to_consume,
      total_value = GREATEST(COALESCE(total_value, 0) - v_value_deduction, 0),
      updated_at = NOW()
    WHERE id = v_row.ingredient_id
    RETURNING quantity INTO v_after_quantity;

    INSERT INTO public.inventory_movements (
      ingredient_id,
      movement_type,
      qty_change,
      reason,
      ref_order_id,
      ref_ticket_id,
      created_at
    )
    VALUES (
      v_row.ingredient_id,
      'CONSUME',
      -v_row.qty_to_consume,
      'ORDER_CONSUMPTION',
      p_order_id,
      NULL,
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

COMMIT;
