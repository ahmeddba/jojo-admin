-- ============================================================
-- La Storia di JOJO – Supabase Schema
-- Paste this entire file into Supabase SQL Editor and run.
-- ============================================================

-- -----------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------
-- 2. CUSTOM TYPES (ENUMs)
-- -----------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE business_unit_enum AS ENUM ('restaurant', 'coffee');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE stock_status_enum AS ENUM ('in_stock', 'low_stock', 'out_of_stock');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('admin', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_status_enum AS ENUM ('pending', 'synced', 'verified');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------
-- 3. HELPER: updated_at trigger function
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------
-- 4. TABLES
-- -----------------------------------------------------------

-- 4a. Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL DEFAULT '',
  avatar_url   TEXT,
  role         user_role_enum NOT NULL DEFAULT 'staff',
  business_unit business_unit_enum, -- NULL means admin can access both
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 4b. Ingredients (Stock)
CREATE TABLE IF NOT EXISTS ingredients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL DEFAULT 'kg',
  price_per_unit  NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_quantity    NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier_phone  TEXT NOT NULL DEFAULT '',
  business_unit   business_unit_enum NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingredients_bu ON ingredients(business_unit);

CREATE TRIGGER ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4c. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  business_unit business_unit_enum NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menu_categories_bu ON menu_categories(business_unit);

CREATE TRIGGER menu_categories_updated_at
  BEFORE UPDATE ON menu_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4d. Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  category_id   UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  available     BOOLEAN NOT NULL DEFAULT TRUE,
  image_url     TEXT,
  business_unit business_unit_enum NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menu_items_bu ON menu_items(business_unit);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);

CREATE TRIGGER menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4e. Deals
CREATE TABLE IF NOT EXISTS deals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url     TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  business_unit business_unit_enum NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deals_bu ON deals(business_unit);

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4f. Deal Items (M2M between deals and menu_items)
CREATE TABLE IF NOT EXISTS deal_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id       UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  menu_item_id  UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  business_unit business_unit_enum NOT NULL,
  UNIQUE(deal_id, menu_item_id)
);

CREATE INDEX idx_deal_items_bu ON deal_items(business_unit);

-- Constraint: deal_items.business_unit must match deals.business_unit
CREATE OR REPLACE FUNCTION check_deal_item_business_unit()
RETURNS TRIGGER AS $$
DECLARE
  deal_bu business_unit_enum;
  item_bu business_unit_enum;
BEGIN
  SELECT business_unit INTO deal_bu FROM deals WHERE id = NEW.deal_id;
  SELECT business_unit INTO item_bu FROM menu_items WHERE id = NEW.menu_item_id;

  IF deal_bu IS DISTINCT FROM NEW.business_unit THEN
    RAISE EXCEPTION 'deal_items.business_unit must match deals.business_unit';
  END IF;

  IF item_bu IS DISTINCT FROM NEW.business_unit THEN
    RAISE EXCEPTION 'deal_items.business_unit must match menu_items.business_unit';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_deal_item_bu
  BEFORE INSERT OR UPDATE ON deal_items
  FOR EACH ROW EXECUTE FUNCTION check_deal_item_business_unit();

-- 4g. Supplier Invoices
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_name   TEXT NOT NULL,
  supplier_phone  TEXT NOT NULL DEFAULT '',
  invoice_number  TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'TND',
  date_received   DATE NOT NULL DEFAULT CURRENT_DATE,
  file_url        TEXT,
  business_unit   business_unit_enum NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_invoices_bu ON supplier_invoices(business_unit);

CREATE TRIGGER supplier_invoices_updated_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4h. Daily Reports
CREATE TABLE IF NOT EXISTS daily_reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  file_url      TEXT,
  file_name     TEXT NOT NULL DEFAULT '',
  file_type     TEXT NOT NULL DEFAULT 'pdf', -- pdf or xlsx
  status        report_status_enum NOT NULL DEFAULT 'pending',
  business_unit business_unit_enum NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_daily_reports_bu ON daily_reports(business_unit);

CREATE TRIGGER daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4i. Sales
CREATE TABLE IF NOT EXISTS sales (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  items_count   INT NOT NULL DEFAULT 0,
  business_unit business_unit_enum NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_bu ON sales(business_unit);
CREATE INDEX idx_sales_created ON sales(created_at);

CREATE TRIGGER sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4j. Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id       UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  menu_item_id  UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  quantity      INT NOT NULL DEFAULT 1,
  unit_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

-- -----------------------------------------------------------
-- 5. VIEWS
-- -----------------------------------------------------------

-- Low stock detection view
CREATE OR REPLACE VIEW v_ingredient_status AS
SELECT
  i.*,
  i.quantity * i.price_per_unit AS total_value,
  CASE
    WHEN i.quantity <= 0 THEN 'out_of_stock'::stock_status_enum
    WHEN i.quantity <= i.min_quantity THEN 'low_stock'::stock_status_enum
    ELSE 'in_stock'::stock_status_enum
  END AS computed_status
FROM ingredients i;

-- -----------------------------------------------------------
-- 6. RPC FUNCTIONS (KPI)
-- -----------------------------------------------------------

-- 6a. Get Total Revenue
CREATE OR REPLACE FUNCTION get_total_revenue(
  p_period TEXT,          -- 'day', 'week', 'month'
  p_business_unit TEXT
)
RETURNS JSON AS $$
DECLARE
  start_date TIMESTAMPTZ;
  result NUMERIC;
BEGIN
  CASE p_period
    WHEN 'day'   THEN start_date := DATE_TRUNC('day', NOW());
    WHEN 'week'  THEN start_date := DATE_TRUNC('week', NOW());
    WHEN 'month' THEN start_date := DATE_TRUNC('month', NOW());
    ELSE start_date := DATE_TRUNC('month', NOW());
  END CASE;

  SELECT COALESCE(SUM(total), 0) INTO result
  FROM sales
  WHERE business_unit = p_business_unit::business_unit_enum
    AND created_at >= start_date;

  RETURN json_build_object(
    'total', result,
    'period', p_period,
    'business_unit', p_business_unit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6b. Get Daily Sales
CREATE OR REPLACE FUNCTION get_daily_sales(
  p_date DATE,
  p_business_unit TEXT
)
RETURNS JSON AS $$
DECLARE
  total_amount NUMERIC;
  total_count  INT;
BEGIN
  SELECT COALESCE(SUM(total), 0), COALESCE(COUNT(*), 0)
  INTO total_amount, total_count
  FROM sales
  WHERE business_unit = p_business_unit::business_unit_enum
    AND created_at::DATE = p_date;

  RETURN json_build_object(
    'total', total_amount,
    'count', total_count,
    'date', p_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6c. Get Best-Selling Items
CREATE OR REPLACE FUNCTION get_best_selling_items(
  p_period TEXT,
  p_business_unit TEXT,
  p_limit INT DEFAULT 5
)
RETURNS JSON AS $$
DECLARE
  start_date TIMESTAMPTZ;
  result JSON;
BEGIN
  CASE p_period
    WHEN 'day'   THEN start_date := DATE_TRUNC('day', NOW());
    WHEN 'week'  THEN start_date := DATE_TRUNC('week', NOW());
    WHEN 'month' THEN start_date := DATE_TRUNC('month', NOW());
    ELSE start_date := DATE_TRUNC('month', NOW());
  END CASE;

  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT
      mi.name,
      COALESCE(mc.name, 'Uncategorized') AS category,
      SUM(si.quantity) AS quantity
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN menu_items mi ON mi.id = si.menu_item_id
    LEFT JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE s.business_unit = p_business_unit::business_unit_enum
      AND s.created_at >= start_date
    GROUP BY mi.name, mc.name
    ORDER BY quantity DESC
    LIMIT p_limit
  ) t;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6d. Get Revenue Trend
CREATE OR REPLACE FUNCTION get_revenue_trend(
  p_period TEXT,    -- 'week' (7 days) or 'month' (30 days)
  p_business_unit TEXT
)
RETURNS JSON AS $$
DECLARE
  days_back INT;
  result JSON;
BEGIN
  IF p_period = 'week' THEN days_back := 7;
  ELSE days_back := 30;
  END IF;

  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT
      d::DATE AS date,
      COALESCE(SUM(s.total), 0) AS amount
    FROM generate_series(
      (CURRENT_DATE - (days_back - 1)),
      CURRENT_DATE,
      '1 day'::INTERVAL
    ) d
    LEFT JOIN sales s
      ON s.created_at::DATE = d::DATE
      AND s.business_unit = p_business_unit::business_unit_enum
    GROUP BY d::DATE
    ORDER BY d::DATE
  ) t;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------
-- 7. CAISSE HELPER FUNCTIONS
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION insert_daily_report(
  p_report_date DATE,
  p_file_url TEXT,
  p_file_name TEXT,
  p_file_type TEXT,
  p_business_unit TEXT
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO daily_reports (report_date, file_url, file_name, file_type, status, business_unit)
  VALUES (p_report_date, p_file_url, p_file_name, p_file_type, 'pending', p_business_unit::business_unit_enum)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION insert_invoice_metadata(
  p_supplier_name TEXT,
  p_supplier_phone TEXT,
  p_invoice_number TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_date_received DATE,
  p_file_url TEXT,
  p_business_unit TEXT
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO supplier_invoices (
    supplier_name, supplier_phone, invoice_number.
    amount, currency, date_received, file_url, business_unit
  )
  VALUES (
    p_supplier_name, p_supplier_phone, p_invoice_number,
    p_amount, p_currency, p_date_received, p_file_url,
    p_business_unit::business_unit_enum
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- -----------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- Helper function to check user role
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role_enum AS $$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'staff'::user_role_enum
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check user business_unit
CREATE OR REPLACE FUNCTION auth_business_unit()
RETURNS business_unit_enum AS $$
  SELECT business_unit FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id OR auth_role() = 'admin');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admin can manage all profiles"
  ON profiles FOR ALL
  USING (auth_role() = 'admin');

-- MACRO: Business-unit-aware policies (applied to all data tables)
-- Admin: full access; Staff: only their business_unit

-- INGREDIENTS
CREATE POLICY "ingredients_select"
  ON ingredients FOR SELECT
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "ingredients_insert"
  ON ingredients FOR INSERT
  WITH CHECK (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "ingredients_update"
  ON ingredients FOR UPDATE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "ingredients_delete"
  ON ingredients FOR DELETE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

-- MENU CATEGORIES
CREATE POLICY "menu_categories_select"
  ON menu_categories FOR SELECT
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "menu_categories_insert"
  ON menu_categories FOR INSERT
  WITH CHECK (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "menu_categories_update"
  ON menu_categories FOR UPDATE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "menu_categories_delete"
  ON menu_categories FOR DELETE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

-- MENU ITEMS
CREATE POLICY "menu_items_select"
  ON menu_items FOR SELECT
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "menu_items_insert"
  ON menu_items FOR INSERT
  WITH CHECK (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "menu_items_update"
  ON menu_items FOR UPDATE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "menu_items_delete"
  ON menu_items FOR DELETE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

-- DEALS
CREATE POLICY "deals_select"
  ON deals FOR SELECT
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "deals_insert"
  ON deals FOR INSERT
  WITH CHECK (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "deals_update"
  ON deals FOR UPDATE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "deals_delete"
  ON deals FOR DELETE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

-- DEAL ITEMS
CREATE POLICY "deal_items_select"
  ON deal_items FOR SELECT
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "deal_items_insert"
  ON deal_items FOR INSERT
  WITH CHECK (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "deal_items_delete"
  ON deal_items FOR DELETE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

-- SUPPLIER INVOICES
CREATE POLICY "supplier_invoices_select"
  ON supplier_invoices FOR SELECT
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "supplier_invoices_insert"
  ON supplier_invoices FOR INSERT
  WITH CHECK (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "supplier_invoices_update"
  ON supplier_invoices FOR UPDATE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "supplier_invoices_delete"
  ON supplier_invoices FOR DELETE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

-- DAILY REPORTS
CREATE POLICY "daily_reports_select"
  ON daily_reports FOR SELECT
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "daily_reports_insert"
  ON daily_reports FOR INSERT
  WITH CHECK (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "daily_reports_update"
  ON daily_reports FOR UPDATE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "daily_reports_delete"
  ON daily_reports FOR DELETE
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

-- SALES
CREATE POLICY "sales_select"
  ON sales FOR SELECT
  USING (auth_role() = 'admin' OR business_unit = auth_business_unit());

CREATE POLICY "sales_insert"
  ON sales FOR INSERT
  WITH CHECK (auth_role() = 'admin' OR business_unit = auth_business_unit());

-- SALE ITEMS
CREATE POLICY "sale_items_select"
  ON sale_items FOR SELECT
  USING (
    auth_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM sales s WHERE s.id = sale_items.sale_id
      AND s.business_unit = auth_business_unit()
    )
  );

CREATE POLICY "sale_items_insert"
  ON sale_items FOR INSERT
  WITH CHECK (
    auth_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM sales s WHERE s.id = sale_items.sale_id
      AND s.business_unit = auth_business_unit()
    )
  );

-- -----------------------------------------------------------
-- 9. STORAGE BUCKETS
-- -----------------------------------------------------------
-- Run these in Supabase Dashboard → Storage or via the API:

INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('daily-reports', 'daily-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies

-- menu-images: public read, authenticated write
CREATE POLICY "menu_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "menu_images_auth_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'menu-images' AND auth.role() = 'authenticated');

CREATE POLICY "menu_images_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'menu-images' AND auth.role() = 'authenticated');

CREATE POLICY "menu_images_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'menu-images' AND auth.role() = 'authenticated');

-- invoices: authenticated read/write
CREATE POLICY "invoices_auth_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');

CREATE POLICY "invoices_auth_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');

CREATE POLICY "invoices_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');

-- daily-reports: authenticated read/write
CREATE POLICY "daily_reports_auth_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'daily-reports' AND auth.role() = 'authenticated');

CREATE POLICY "daily_reports_auth_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'daily-reports' AND auth.role() = 'authenticated');

CREATE POLICY "daily_reports_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'daily-reports' AND auth.role() = 'authenticated');

-- -----------------------------------------------------------
-- 10. SEED DATA
-- -----------------------------------------------------------

-- Menu Categories
INSERT INTO menu_categories (id, name, business_unit) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Main Courses', 'restaurant'),
  ('a1000000-0000-0000-0000-000000000002', 'Side Dishes', 'restaurant'),
  ('a1000000-0000-0000-0000-000000000003', 'Desserts', 'restaurant'),
  ('a1000000-0000-0000-0000-000000000004', 'Combos', 'restaurant'),
  ('a2000000-0000-0000-0000-000000000001', 'Espresso Bar', 'coffee'),
  ('a2000000-0000-0000-0000-000000000002', 'Patisserie', 'coffee'),
  ('a2000000-0000-0000-0000-000000000003', 'Cocktails', 'coffee'),
  ('a2000000-0000-0000-0000-000000000004', 'Salads', 'coffee')
ON CONFLICT DO NOTHING;

-- Menu Items (Restaurant)
INSERT INTO menu_items (id, name, description, price, category_id, available, business_unit) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Steak Night Special', 'Premium ribeye paired with roasted root vegetables. Top weekend revenue driver.', 29.99, 'a1000000-0000-0000-0000-000000000001', true, 'restaurant'),
  ('b1000000-0000-0000-0000-000000000002', 'Pizza for Two', 'Any two classic pizzas. High margin item ideal for groups & pairs.', 22.00, 'a1000000-0000-0000-0000-000000000001', true, 'restaurant'),
  ('b1000000-0000-0000-0000-000000000003', 'House Salad', 'Fresh seasonal greens with our signature vinaigrette.', 8.50, 'a1000000-0000-0000-0000-000000000002', true, 'restaurant'),
  ('b1000000-0000-0000-0000-000000000004', 'Tiramisu', 'Classic Italian dessert with rich espresso-soaked layers.', 9.00, 'a1000000-0000-0000-0000-000000000003', true, 'restaurant'),
  ('b1000000-0000-0000-0000-000000000005', 'Perfect Lunch Combo', 'Soup, salad, and main of the day. Optimized for midday turnover.', 15.50, 'a1000000-0000-0000-0000-000000000004', true, 'restaurant')
ON CONFLICT DO NOTHING;

-- Menu Items (Coffee)
INSERT INTO menu_items (id, name, description, price, category_id, available, business_unit) VALUES
  ('b2000000-0000-0000-0000-000000000001', 'Espresso Macchiato', 'High-margin staple: Robust espresso marked with velvety steamed milk.', 3.50, 'a2000000-0000-0000-0000-000000000001', true, 'coffee'),
  ('b2000000-0000-0000-0000-000000000002', 'Red Velvet Cake', 'Best-seller: Decadent red velvet layers paired with signature cream cheese frosting.', 7.00, 'a2000000-0000-0000-0000-000000000002', true, 'coffee'),
  ('b2000000-0000-0000-0000-000000000003', 'Salmon Salad', 'Premium health option: Freshly grilled salmon fillet atop a bed of organic field greens.', 15.50, 'a2000000-0000-0000-0000-000000000004', true, 'coffee'),
  ('b2000000-0000-0000-0000-000000000004', 'Mint Mojito', 'Bar favorite: Refreshing, high-profit blend of white rum, fresh mint, and zesty lime.', 8.00, 'a2000000-0000-0000-0000-000000000003', true, 'coffee'),
  ('b2000000-0000-0000-0000-000000000005', 'Morning Boost', 'Any artisan coffee + butter croissant. Volume driver for morning rush.', 7.00, 'a2000000-0000-0000-0000-000000000002', true, 'coffee')
ON CONFLICT DO NOTHING;

-- Ingredients (Restaurant)
INSERT INTO ingredients (name, quantity, unit, price_per_unit, min_quantity, supplier_phone, business_unit) VALUES
  ('San Marzano Tomatoes', 50, 'kg', 1.50, 10, '555-0101', 'restaurant'),
  ('Buffalo Mozzarella', 5, 'kg', 8.00, 10, '555-0102', 'restaurant'),
  ('00 Pizza Flour', 0, 'kg', 0.50, 15, '555-0103', 'restaurant'),
  ('Fresh Basil', 20, 'bunch', 2.00, 5, '555-0101', 'restaurant'),
  ('Olive Oil', 30, 'L', 5.00, 10, '555-0104', 'restaurant'),
  ('Mozzarella Cheese', 5, 'kg', 6.50, 10, '555-0102', 'restaurant'),
  ('Tomato Sauce', 4, 'kg', 2.00, 8, '555-0101', 'restaurant'),
  ('Pizza Dough Balls', 18, 'pcs', 0.80, 30, '555-0103', 'restaurant');

-- Ingredients (Coffee)
INSERT INTO ingredients (name, quantity, unit, price_per_unit, min_quantity, supplier_phone, business_unit) VALUES
  ('Coffee Beans (Arabica)', 2, 'kg', 15.00, 5, '555-0201', 'coffee'),
  ('Whole Milk', 3, 'L', 1.20, 10, '555-0202', 'coffee'),
  ('Croissants', 8, 'pcs', 1.50, 20, '555-0203', 'coffee'),
  ('San Pellegrino', 15, 'btls', 2.00, 12, '555-0204', 'coffee'),
  ('Sugar Packets', 55, 'pcs', 0.10, 50, '555-0205', 'coffee'),
  ('Oat Milk', 5, 'L', 2.50, 8, '555-0202', 'coffee'),
  ('Croissant Dough', 14, 'pcs', 1.20, 25, '555-0203', 'coffee');

-- Deals (Restaurant)
INSERT INTO deals (id, name, description, price, active, business_unit) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Signature Steak Night', 'Premium ribeye paired with roasted root vegetables. Top weekend revenue driver.', 29.99, true, 'restaurant'),
  ('d1000000-0000-0000-0000-000000000002', 'Couples'' Pizza Night', 'Any two classic pizzas. High margin item ideal for groups & pairs.', 22.00, true, 'restaurant')
ON CONFLICT DO NOTHING;

-- Deals (Coffee)
INSERT INTO deals (id, name, description, price, active, business_unit) VALUES
  ('d2000000-0000-0000-0000-000000000001', 'Power Lunch Set', 'Includes: Quinoa Salad, Fresh Juice. Optimized for high midday turnover.', 15.50, true, 'coffee'),
  ('d2000000-0000-0000-0000-000000000002', 'Commuter''s Morning Set', 'Any artisan coffee + butter croissant. Volume driver for morning rush.', 7.00, true, 'coffee')
ON CONFLICT DO NOTHING;

-- Deal Items
INSERT INTO deal_items (deal_id, menu_item_id, business_unit) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'restaurant'),
  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'restaurant'),
  ('d2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'coffee'),
  ('d2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001', 'coffee'),
  ('d2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000005', 'coffee')
ON CONFLICT DO NOTHING;

-- Sample Sales (Restaurant, last 7 days)
INSERT INTO sales (total, items_count, business_unit, created_at) VALUES
  (820.50, 42, 'restaurant', NOW() - INTERVAL '6 days'),
  (910.20, 48, 'restaurant', NOW() - INTERVAL '5 days'),
  (760.00, 36, 'restaurant', NOW() - INTERVAL '4 days'),
  (980.30, 51, 'restaurant', NOW() - INTERVAL '3 days'),
  (1120.80, 58, 'restaurant', NOW() - INTERVAL '2 days'),
  (1245.10, 62, 'restaurant', NOW() - INTERVAL '1 day'),
  (1543.60, 68, 'restaurant', NOW());

-- Sample Sales (Coffee, last 7 days)
INSERT INTO sales (total, items_count, business_unit, created_at) VALUES
  (430.00, 85, 'coffee', NOW() - INTERVAL '6 days'),
  (485.70, 92, 'coffee', NOW() - INTERVAL '5 days'),
  (399.90, 78, 'coffee', NOW() - INTERVAL '4 days'),
  (512.30, 98, 'coffee', NOW() - INTERVAL '3 days'),
  (538.40, 105, 'coffee', NOW() - INTERVAL '2 days'),
  (601.20, 112, 'coffee', NOW() - INTERVAL '1 day'),
  (652.80, 120, 'coffee', NOW());

-- Supplier Invoices
INSERT INTO supplier_invoices (supplier_name, supplier_phone, invoice_number, amount, currency, date_received, business_unit) VALUES
  ('Napoli Coffee Roasters', '(555) 123-4567', 'INV-00123', 1250.75, 'TND', '2024-07-28', 'coffee'),
  ('Verde Local Produce', '(555) 987-6543', 'INV-00122', 845.50, 'TND', '2024-07-27', 'restaurant'),
  ('Dolce Vita Bakery', '(555) 246-8135', 'INV-00121', 430.00, 'TND', '2024-07-27', 'coffee'),
  ('Milano Beverage Dist.', '(555) 369-1472', 'INV-00120', 680.20, 'TND', '2024-07-26', 'restaurant'),
  ('EcoClean Solutions', '(555) 753-9518', 'INV-00119', 150.00, 'TND', '2024-07-25', 'restaurant');

-- Daily Reports
INSERT INTO daily_reports (report_date, file_name, file_type, status, business_unit) VALUES
  ('2024-07-28', 'Z-Report_July28.pdf', 'pdf', 'synced', 'restaurant'),
  ('2024-07-27', 'Rev_Summary_July27.xlsx', 'xlsx', 'verified', 'restaurant'),
  ('2024-07-26', 'Z-Report_July26.pdf', 'pdf', 'verified', 'restaurant'),
  ('2024-07-28', 'Coffee_Report_July28.pdf', 'pdf', 'synced', 'coffee'),
  ('2024-07-27', 'Coffee_Summary_July27.xlsx', 'xlsx', 'verified', 'coffee');

-- Done!
