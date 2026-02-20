-- ============================================================
-- Update Z-Report Logic for Mixed Orders
-- Calculates revenue/orders based on Item Business Unit, not Order BU
-- ============================================================

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

  -- Calculate Total Revenue from Items of this BU
  -- Matches items from ANY submitted order on that day
  SELECT
    COALESCE(SUM(oi.line_total_tnd), 0)
  INTO v_total_revenue
  FROM orders o
  JOIN order_items oi ON o.id = oi.order_id
  LEFT JOIN menu_items mi ON oi.item_type = 'menu' AND oi.item_id = mi.id
  LEFT JOIN deals d ON oi.item_type = 'deal' AND oi.item_id = d.id
  WHERE o.status = 'SUBMITTED'
    AND o.created_at::DATE = p_day
    AND (
      (oi.item_type = 'menu' AND mi.business_unit = v_bu)
      OR
      (oi.item_type = 'deal' AND d.business_unit = v_bu)
    );

  -- Calculate Total Orders (Count of orders containing at least one item of this BU)
  SELECT
    COUNT(DISTINCT o.id)
  INTO v_total_orders
  FROM orders o
  JOIN order_items oi ON o.id = oi.order_id
  LEFT JOIN menu_items mi ON oi.item_type = 'menu' AND oi.item_id = mi.id
  LEFT JOIN deals d ON oi.item_type = 'deal' AND oi.item_id = d.id
  WHERE o.status = 'SUBMITTED'
    AND o.created_at::DATE = p_day
    AND (
      (oi.item_type = 'menu' AND mi.business_unit = v_bu)
      OR
      (oi.item_type = 'deal' AND d.business_unit = v_bu)
    );

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
