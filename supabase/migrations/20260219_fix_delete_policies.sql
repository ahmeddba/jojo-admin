-- ============================================================
-- Fix missing DELETE policies for inventory_movements and stock_alert_events
-- This allows the application to manually cleanup dependent rows when deleting an ingredient
-- ============================================================

BEGIN;

-- 1. Inventory Movements
DROP POLICY IF EXISTS pos_inventory_movements_delete ON public.inventory_movements;
CREATE POLICY pos_inventory_movements_delete
  ON public.inventory_movements FOR DELETE
  USING (auth.role() = 'authenticated');

-- 2. Stock Alert Events
DROP POLICY IF EXISTS pos_stock_alert_events_delete ON public.stock_alert_events;
CREATE POLICY pos_stock_alert_events_delete
  ON public.stock_alert_events FOR DELETE
  USING (auth.role() = 'authenticated');

COMMIT;
