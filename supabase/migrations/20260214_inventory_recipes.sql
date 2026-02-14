-- ============================================================
-- Inventory recipes + transactional consumption (additive only)
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1) Ingredients additive compatibility (treat min_quantity as threshold/seuil)
-- ------------------------------------------------------------
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'unit';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ingredients'
      AND column_name = 'seuil'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ingredients'
      AND column_name = 'min_quantity'
  ) THEN
    ALTER TABLE public.ingredients
      ADD COLUMN IF NOT EXISTS seuil NUMERIC(10,2) NOT NULL DEFAULT 0;
  END IF;
END
$$;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ------------------------------------------------------------
-- 2) Recipes (normalized)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_item_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  qty_used NUMERIC(12,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_item_ingredients_qty_used_positive CHECK (qty_used > 0),
  CONSTRAINT menu_item_ingredients_unique UNIQUE (menu_item_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_ingredients_menu_item_id
  ON public.menu_item_ingredients(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_menu_item_ingredients_ingredient_id
  ON public.menu_item_ingredients(ingredient_id);

-- ------------------------------------------------------------
-- 3) Inventory movement ledger
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('CONSUME', 'RESTOCK', 'ADJUST')),
  qty_change NUMERIC(12,4) NOT NULL,
  reason TEXT,
  ref_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ref_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_ingredient_id
  ON public.inventory_movements(ingredient_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at
  ON public.inventory_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref_order_id
  ON public.inventory_movements(ref_order_id);

-- ------------------------------------------------------------
-- 4) Stock alert events for n8n polling
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('LOW_STOCK', 'OUT_OF_STOCK')),
  quantity_after NUMERIC(12,4) NOT NULL,
  seuil NUMERIC(12,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_stock_alert_events_processed_at
  ON public.stock_alert_events(processed_at);

CREATE INDEX IF NOT EXISTS idx_stock_alert_events_ingredient_id
  ON public.stock_alert_events(ingredient_id);

-- ------------------------------------------------------------
-- 5) Order idempotency marker
-- ------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_applied BOOLEAN DEFAULT FALSE;

UPDATE public.orders
SET inventory_applied = FALSE
WHERE inventory_applied IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN inventory_applied SET DEFAULT FALSE;

-- ------------------------------------------------------------
-- 6) Transactional inventory consumption function
-- ------------------------------------------------------------
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
    UPDATE public.ingredients
    SET
      quantity = COALESCE(quantity, 0) - v_row.qty_to_consume,
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

GRANT EXECUTE ON FUNCTION public.apply_order_inventory_consumption(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_inventory_consumption(UUID) TO service_role;

-- ------------------------------------------------------------
-- 7) Ingredient status view compatibility (exposes seuil alias)
--    Keep existing column order for CREATE OR REPLACE safety.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ingredients'
      AND column_name = 'seuil'
  ) THEN
    -- `seuil` already comes from i.*, keep `computed_status` position unchanged.
    EXECUTE $view_with_seuil$
      CREATE OR REPLACE VIEW public.v_ingredient_status AS
      SELECT
        i.*,
        i.quantity * i.price_per_unit AS total_value,
        CASE
          WHEN i.quantity <= 0 THEN 'out_of_stock'::stock_status_enum
          WHEN i.quantity <= COALESCE(
            (to_jsonb(i) ->> 'seuil')::NUMERIC,
            (to_jsonb(i) ->> 'min_quantity')::NUMERIC,
            0
          ) THEN 'low_stock'::stock_status_enum
          ELSE 'in_stock'::stock_status_enum
        END AS computed_status
      FROM public.ingredients i
    $view_with_seuil$;
  ELSE
    -- Append `seuil` at the end to avoid renaming existing view columns.
    EXECUTE $view_without_seuil$
      CREATE OR REPLACE VIEW public.v_ingredient_status AS
      SELECT
        i.*,
        i.quantity * i.price_per_unit AS total_value,
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
    $view_without_seuil$;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 8) RLS + policies for new tables
-- ------------------------------------------------------------
ALTER TABLE public.menu_item_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_menu_item_ingredients_select ON public.menu_item_ingredients;
CREATE POLICY pos_menu_item_ingredients_select
  ON public.menu_item_ingredients FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_menu_item_ingredients_insert ON public.menu_item_ingredients;
CREATE POLICY pos_menu_item_ingredients_insert
  ON public.menu_item_ingredients FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_menu_item_ingredients_update ON public.menu_item_ingredients;
CREATE POLICY pos_menu_item_ingredients_update
  ON public.menu_item_ingredients FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_menu_item_ingredients_delete ON public.menu_item_ingredients;
CREATE POLICY pos_menu_item_ingredients_delete
  ON public.menu_item_ingredients FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_inventory_movements_select ON public.inventory_movements;
CREATE POLICY pos_inventory_movements_select
  ON public.inventory_movements FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_inventory_movements_insert ON public.inventory_movements;
CREATE POLICY pos_inventory_movements_insert
  ON public.inventory_movements FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_stock_alert_events_select ON public.stock_alert_events;
CREATE POLICY pos_stock_alert_events_select
  ON public.stock_alert_events FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_stock_alert_events_insert ON public.stock_alert_events;
CREATE POLICY pos_stock_alert_events_insert
  ON public.stock_alert_events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_stock_alert_events_update ON public.stock_alert_events;
CREATE POLICY pos_stock_alert_events_update
  ON public.stock_alert_events FOR UPDATE
  USING (auth.role() = 'authenticated');

COMMIT;
