-- ============================================================
-- Add CREATE/DELETE/UPDATE to inventory_movements types
-- so all actions appear in the history ledger
-- ============================================================

BEGIN;

-- 1. Update movement_type CHECK to include metadata actions
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('CONSUME', 'RESTOCK', 'ADJUST', 'REVERSAL', 'CREATE', 'DELETE'));

COMMIT;
