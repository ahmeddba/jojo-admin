-- Migration to allow mixed-business-unit deals (e.g. Restaurant + Coffee items in one deal)
-- This removes the strict constraint that required all deal items to match the deal's business unit.

DROP TRIGGER IF EXISTS trg_check_deal_item_bu ON deal_items;
DROP FUNCTION IF EXISTS check_deal_item_business_unit();
