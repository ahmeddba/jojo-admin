-- ============================================================
-- Stock Audits Table for robust inventory tracking
-- ============================================================

BEGIN;

-- 1. Create Audit Table
CREATE TABLE IF NOT EXISTS public.stock_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit business_unit_enum NOT NULL,
  ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL, -- Snapshot
  action_type TEXT NOT NULL CHECK (action_type IN ('RESTOCK', 'ADJUST', 'CONSUME', 'CREATE', 'UPDATE', 'DELETE')),
  qty_change NUMERIC(12,4) NOT NULL,
  qty_after NUMERIC(12,4) NOT NULL,
  supplier_info JSONB DEFAULT '{}'::JSONB, -- { name, phone, invoice_number, invoice_id }
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_stock_audits_business_unit ON public.stock_audits(business_unit);
CREATE INDEX IF NOT EXISTS idx_stock_audits_ingredient_id ON public.stock_audits(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_audits_created_at ON public.stock_audits(created_at DESC);

-- 3. RLS
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "stock_audits_select"
  ON public.stock_audits FOR SELECT
  USING (
    auth_role() = 'admin' 
    OR business_unit = auth_business_unit()
  );

CREATE POLICY "stock_audits_insert"
  ON public.stock_audits FOR INSERT
  WITH CHECK (
    auth_role() = 'admin' 
    OR business_unit = auth_business_unit()
  );

-- No update/delete for audit logs to ensure integrity
-- (Admin might need delete in rare cases, but usually logs are immutable)

COMMIT;
