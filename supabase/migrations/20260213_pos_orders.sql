-- ============================================================
-- POS Ordering + Tickets + n8n Webhook Flow + Daily Z Report
-- Safe additive migration for existing JOJO schema
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1) ENUMS
-- ------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE business_unit_enum AS ENUM ('restaurant', 'coffee');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE order_status_enum AS ENUM ('PENDING_WEBHOOK', 'FAILED_WEBHOOK', 'SUBMITTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ------------------------------------------------------------
-- 2) MENU / DEALS (required columns ensured)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit business_unit_enum NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_tnd NUMERIC(12,3) NOT NULL DEFAULT 0,
  category TEXT,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_tnd NUMERIC(12,3);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
      AND column_name = 'price'
  ) THEN
    UPDATE menu_items
    SET price_tnd = COALESCE(price_tnd, price::NUMERIC(12,3))
    WHERE price_tnd IS NULL;
  END IF;
END
$$;

UPDATE menu_items SET price_tnd = 0 WHERE price_tnd IS NULL;
UPDATE menu_items SET available = TRUE WHERE available IS NULL;
UPDATE menu_items SET created_at = NOW() WHERE created_at IS NULL;

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit business_unit_enum NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_tnd NUMERIC(12,3) NOT NULL DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE deals ADD COLUMN IF NOT EXISTS price_tnd NUMERIC(12,3);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'deals'
      AND column_name = 'price'
  ) THEN
    UPDATE deals
    SET price_tnd = COALESCE(price_tnd, price::NUMERIC(12,3))
    WHERE price_tnd IS NULL;
  END IF;
END
$$;

UPDATE deals SET price_tnd = 0 WHERE price_tnd IS NULL;
UPDATE deals SET created_at = NOW() WHERE created_at IS NULL;

CREATE TABLE IF NOT EXISTS deal_items (
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  PRIMARY KEY (deal_id, menu_item_id)
);

ALTER TABLE deal_items ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1;
UPDATE deal_items SET quantity = 1 WHERE quantity IS NULL;
ALTER TABLE deal_items ALTER COLUMN quantity SET NOT NULL;

-- ------------------------------------------------------------
-- 3) ORDERS / TICKETS / COUNTERS / Z REPORTS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit business_unit_enum NOT NULL,
  status order_status_enum NOT NULL DEFAULT 'PENDING_WEBHOOK',
  table_number TEXT NOT NULL,
  notes TEXT,
  total_tnd NUMERIC(12,3) NOT NULL DEFAULT 0,
  external_ref TEXT,
  webhook_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_table_number_not_blank CHECK (BTRIM(table_number) <> '')
);

DO $$
DECLARE
  c RECORD;
  status_udt TEXT;
  table_data_type TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    -- Drop legacy check constraints tied to status values if present.
    FOR c IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.orders'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
      EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', c.conname);
    END LOOP;

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS business_unit business_unit_enum;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_tnd NUMERIC(12,3) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_ref TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS webhook_error TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

    -- Legacy schema compatibility:
    -- ticket_number used to be required on orders, but in POS flow tickets are generated
    -- only after webhook success and stored in tickets table.
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'ticket_number'
    ) THEN
      ALTER TABLE orders ALTER COLUMN ticket_number DROP NOT NULL;
      ALTER TABLE orders ALTER COLUMN ticket_number DROP DEFAULT;
    END IF;

    SELECT data_type
    INTO table_data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'table_number';

    IF table_data_type IS NOT NULL AND table_data_type <> 'text' THEN
      EXECUTE 'ALTER TABLE orders ALTER COLUMN table_number TYPE TEXT USING table_number::TEXT';
    END IF;

    UPDATE orders
    SET table_number = 'UNKNOWN'
    WHERE table_number IS NULL OR BTRIM(table_number) = '';

    ALTER TABLE orders ALTER COLUMN table_number SET NOT NULL;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_table_number_not_blank;
    ALTER TABLE orders
      ADD CONSTRAINT orders_table_number_not_blank CHECK (BTRIM(table_number) <> '');

    SELECT udt_name
    INTO status_udt
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'status';

    IF status_udt IS NULL THEN
      ALTER TABLE orders ADD COLUMN status order_status_enum NOT NULL DEFAULT 'PENDING_WEBHOOK';
    ELSIF status_udt <> 'order_status_enum' THEN
      ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
      EXECUTE $q$
        ALTER TABLE orders
        ALTER COLUMN status TYPE order_status_enum
        USING (
          CASE status::TEXT
            WHEN 'PENDING_WEBHOOK' THEN 'PENDING_WEBHOOK'::order_status_enum
            WHEN 'FAILED_WEBHOOK' THEN 'FAILED_WEBHOOK'::order_status_enum
            WHEN 'SUBMITTED' THEN 'SUBMITTED'::order_status_enum
            WHEN 'DRAFT' THEN 'PENDING_WEBHOOK'::order_status_enum
            WHEN 'PAID' THEN 'SUBMITTED'::order_status_enum
            WHEN 'CANCELLED' THEN 'FAILED_WEBHOOK'::order_status_enum
            ELSE 'PENDING_WEBHOOK'::order_status_enum
          END
        )
      $q$;
    END IF;

    UPDATE orders SET status = 'PENDING_WEBHOOK' WHERE status IS NULL;
    UPDATE orders SET total_tnd = 0 WHERE total_tnd IS NULL;
    UPDATE orders SET created_at = NOW() WHERE created_at IS NULL;

    ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'PENDING_WEBHOOK';
    ALTER TABLE orders ALTER COLUMN status SET NOT NULL;
    ALTER TABLE orders ALTER COLUMN total_tnd SET NOT NULL;
    ALTER TABLE orders ALTER COLUMN created_at SET NOT NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_orders_business_unit_created
  ON orders (business_unit, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('menu', 'deal')),
  item_id UUID,
  name_snapshot TEXT NOT NULL,
  qty INT NOT NULL,
  unit_price_tnd NUMERIC(12,3) NOT NULL,
  line_total_tnd NUMERIC(12,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_type TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_id UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_tnd NUMERIC(12,3);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_total_tnd NUMERIC(12,3);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'menu_item_id'
  ) THEN
    UPDATE order_items
    SET item_id = COALESCE(item_id, menu_item_id)
    WHERE item_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'unit_price_snapshot'
  ) THEN
    UPDATE order_items
    SET unit_price_tnd = COALESCE(unit_price_tnd, unit_price_snapshot::NUMERIC(12,3))
    WHERE unit_price_tnd IS NULL;
  END IF;
END
$$;

UPDATE order_items SET item_type = 'menu' WHERE item_type IS NULL;
UPDATE order_items SET qty = 1 WHERE qty IS NULL OR qty <= 0;
UPDATE order_items SET unit_price_tnd = 0 WHERE unit_price_tnd IS NULL;
UPDATE order_items
SET line_total_tnd = COALESCE(line_total_tnd, qty * unit_price_tnd)
WHERE line_total_tnd IS NULL;
UPDATE order_items SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE order_items ALTER COLUMN item_type SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN qty SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN unit_price_tnd SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN line_total_tnd SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit business_unit_enum NOT NULL,
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  ticket_number INT NOT NULL,
  ticket_date DATE NOT NULL,
  content_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS content_text TEXT;
UPDATE tickets SET content_text = '' WHERE content_text IS NULL;
ALTER TABLE tickets ALTER COLUMN content_text SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_daily_sequence
  ON tickets (business_unit, ticket_date, ticket_number);

CREATE TABLE IF NOT EXISTS daily_ticket_counters (
  business_unit business_unit_enum NOT NULL,
  day DATE NOT NULL,
  last_ticket_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (business_unit, day)
);

CREATE TABLE IF NOT EXISTS z_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit business_unit_enum NOT NULL,
  day DATE NOT NULL,
  total_orders INT NOT NULL DEFAULT 0,
  total_revenue_tnd NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_unit, day)
);

ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS day DATE;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS total_revenue_tnd NUMERIC(12,3) DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'z_reports'
      AND column_name = 'report_date'
  ) THEN
    UPDATE z_reports
    SET day = COALESCE(day, report_date)
    WHERE day IS NULL;
  END IF;
END
$$;

UPDATE z_reports SET day = CURRENT_DATE WHERE day IS NULL;
UPDATE z_reports SET total_orders = 0 WHERE total_orders IS NULL;
UPDATE z_reports SET total_revenue_tnd = 0 WHERE total_revenue_tnd IS NULL;
UPDATE z_reports SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE z_reports ALTER COLUMN day SET NOT NULL;
ALTER TABLE z_reports ALTER COLUMN total_orders SET NOT NULL;
ALTER TABLE z_reports ALTER COLUMN total_revenue_tnd SET NOT NULL;
ALTER TABLE z_reports ALTER COLUMN created_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_z_reports_business_day
  ON z_reports (business_unit, day);

-- ------------------------------------------------------------
-- 4) FUNCTIONS
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_pending_order(
  p_business_unit TEXT,
  p_table_number TEXT,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID AS $$
DECLARE
  v_bu business_unit_enum;
  v_item JSONB;
  v_order_id UUID;
  v_qty INT;
  v_unit_price NUMERIC(12,3);
  v_line_total NUMERIC(12,3);
  v_total NUMERIC(12,3) := 0;
BEGIN
  BEGIN
    v_bu := p_business_unit::business_unit_enum;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid business unit: %', p_business_unit;
  END;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array';
  END IF;

  IF p_table_number IS NULL OR BTRIM(p_table_number) = '' THEN
    RAISE EXCEPTION 'table_number is required';
  END IF;

  INSERT INTO orders (business_unit, status, table_number, notes, total_tnd)
  VALUES (v_bu, 'PENDING_WEBHOOK', BTRIM(p_table_number), NULLIF(TRIM(p_notes), ''), 0)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(COALESCE((v_item ->> 'qty')::INT, 1), 1);
    v_unit_price := COALESCE((v_item ->> 'unit_price_tnd')::NUMERIC(12,3), 0);
    v_line_total := ROUND((v_qty * v_unit_price)::NUMERIC, 3);

    INSERT INTO order_items (
      order_id,
      item_type,
      item_id,
      name_snapshot,
      qty,
      unit_price_tnd,
      line_total_tnd,
      created_at
    )
    VALUES (
      v_order_id,
      CASE WHEN COALESCE(v_item ->> 'item_type', 'menu') = 'deal' THEN 'deal' ELSE 'menu' END,
      NULLIF(v_item ->> 'item_id', '')::UUID,
      COALESCE(NULLIF(v_item ->> 'name_snapshot', ''), 'Unnamed Item'),
      v_qty,
      v_unit_price,
      v_line_total,
      NOW()
    );

    v_total := v_total + v_line_total;
  END LOOP;

  UPDATE orders
  SET total_tnd = ROUND(v_total, 3)
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION finalize_order_after_webhook_success(
  p_order_id UUID,
  p_external_ref TEXT
)
RETURNS tickets AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_ticket tickets%ROWTYPE;
  v_next_ticket INT;
  v_ticket_date DATE;
  v_ticket_content TEXT;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status = 'SUBMITTED' THEN
    SELECT * INTO v_ticket FROM tickets WHERE order_id = p_order_id;
    IF FOUND THEN
      RETURN v_ticket;
    END IF;
  END IF;

  IF v_order.status NOT IN ('PENDING_WEBHOOK', 'FAILED_WEBHOOK', 'SUBMITTED') THEN
    RAISE EXCEPTION 'Order % has invalid status for finalize: %', p_order_id, v_order.status;
  END IF;

  v_ticket_date := v_order.created_at::DATE;

  INSERT INTO daily_ticket_counters (business_unit, day, last_ticket_number)
  VALUES (v_order.business_unit, v_ticket_date, 1)
  ON CONFLICT (business_unit, day)
  DO UPDATE SET last_ticket_number = daily_ticket_counters.last_ticket_number + 1
  RETURNING last_ticket_number INTO v_next_ticket;

  SELECT COALESCE(
    string_agg(
      format(
        '%s x %s = %s TND',
        oi.qty,
        oi.name_snapshot,
        to_char(oi.line_total_tnd, 'FM999999990.000')
      ),
      E'\n'
      ORDER BY oi.created_at
    ),
    'No items'
  )
  INTO v_ticket_content
  FROM order_items oi
  WHERE oi.order_id = p_order_id;

  INSERT INTO tickets (
    business_unit,
    order_id,
    ticket_number,
    ticket_date,
    content_text
  )
  VALUES (
    v_order.business_unit,
    p_order_id,
    v_next_ticket,
    v_ticket_date,
    v_ticket_content
  )
  ON CONFLICT (order_id)
  DO UPDATE SET
    content_text = EXCLUDED.content_text
  RETURNING * INTO v_ticket;

  UPDATE orders
  SET status = 'SUBMITTED',
      external_ref = p_external_ref,
      webhook_error = NULL
  WHERE id = p_order_id;

  RETURN v_ticket;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_order_webhook_failed(
  p_order_id UUID,
  p_error TEXT
)
RETURNS orders AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  UPDATE orders
  SET status = 'FAILED_WEBHOOK',
      webhook_error = NULLIF(TRIM(p_error), '')
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION generate_z_report_pos(
  p_business_unit TEXT,
  p_day DATE
)
RETURNS z_reports AS $$
DECLARE
  v_bu business_unit_enum;
  v_total_orders INT;
  v_total_revenue NUMERIC(12,3);
  v_report z_reports%ROWTYPE;
BEGIN
  BEGIN
    v_bu := p_business_unit::business_unit_enum;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid business unit: %', p_business_unit;
  END;

  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(SUM(total_tnd), 0)
  INTO v_total_orders, v_total_revenue
  FROM orders
  WHERE business_unit = v_bu
    AND status = 'SUBMITTED'
    AND created_at::DATE = p_day;

  INSERT INTO z_reports (business_unit, day, total_orders, total_revenue_tnd)
  VALUES (v_bu, p_day, v_total_orders, ROUND(v_total_revenue, 3))
  ON CONFLICT (business_unit, day)
  DO UPDATE SET
    total_orders = EXCLUDED.total_orders,
    total_revenue_tnd = EXCLUDED.total_revenue_tnd
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5) RLS (permissive authenticated for admin app)
-- ------------------------------------------------------------

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_ticket_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_menu_items_select ON menu_items;
CREATE POLICY pos_menu_items_select
  ON menu_items FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_menu_items_insert ON menu_items;
CREATE POLICY pos_menu_items_insert
  ON menu_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_menu_items_update ON menu_items;
CREATE POLICY pos_menu_items_update
  ON menu_items FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_menu_items_delete ON menu_items;
CREATE POLICY pos_menu_items_delete
  ON menu_items FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_deals_select ON deals;
CREATE POLICY pos_deals_select
  ON deals FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_deals_insert ON deals;
CREATE POLICY pos_deals_insert
  ON deals FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_deals_update ON deals;
CREATE POLICY pos_deals_update
  ON deals FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_deals_delete ON deals;
CREATE POLICY pos_deals_delete
  ON deals FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_deal_items_select ON deal_items;
CREATE POLICY pos_deal_items_select
  ON deal_items FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_deal_items_insert ON deal_items;
CREATE POLICY pos_deal_items_insert
  ON deal_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_deal_items_update ON deal_items;
CREATE POLICY pos_deal_items_update
  ON deal_items FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_deal_items_delete ON deal_items;
CREATE POLICY pos_deal_items_delete
  ON deal_items FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_orders_select ON orders;
CREATE POLICY pos_orders_select
  ON orders FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_orders_insert ON orders;
CREATE POLICY pos_orders_insert
  ON orders FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_orders_update ON orders;
CREATE POLICY pos_orders_update
  ON orders FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_orders_delete ON orders;
CREATE POLICY pos_orders_delete
  ON orders FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_order_items_select ON order_items;
CREATE POLICY pos_order_items_select
  ON order_items FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_order_items_insert ON order_items;
CREATE POLICY pos_order_items_insert
  ON order_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_order_items_update ON order_items;
CREATE POLICY pos_order_items_update
  ON order_items FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_order_items_delete ON order_items;
CREATE POLICY pos_order_items_delete
  ON order_items FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_tickets_select ON tickets;
CREATE POLICY pos_tickets_select
  ON tickets FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_tickets_insert ON tickets;
CREATE POLICY pos_tickets_insert
  ON tickets FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_tickets_update ON tickets;
CREATE POLICY pos_tickets_update
  ON tickets FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_tickets_delete ON tickets;
CREATE POLICY pos_tickets_delete
  ON tickets FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_daily_ticket_counters_select ON daily_ticket_counters;
CREATE POLICY pos_daily_ticket_counters_select
  ON daily_ticket_counters FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_daily_ticket_counters_insert ON daily_ticket_counters;
CREATE POLICY pos_daily_ticket_counters_insert
  ON daily_ticket_counters FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_daily_ticket_counters_update ON daily_ticket_counters;
CREATE POLICY pos_daily_ticket_counters_update
  ON daily_ticket_counters FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_z_reports_select ON z_reports;
CREATE POLICY pos_z_reports_select
  ON z_reports FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_z_reports_insert ON z_reports;
CREATE POLICY pos_z_reports_insert
  ON z_reports FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pos_z_reports_update ON z_reports;
CREATE POLICY pos_z_reports_update
  ON z_reports FOR UPDATE
  USING (auth.role() = 'authenticated');

COMMIT;
