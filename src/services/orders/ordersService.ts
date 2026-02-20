import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BusinessUnit,
  CartItem,
  InventoryConsumptionResult,
  MenuItem,
  Order,
  PosDeal,
  Ticket,
  ZReport,
} from "@/lib/database.types";

export type ZReportSummary = {
  total_orders: number;
  total_revenue_tnd: number;
};

type CreatePendingOrderArgs = {
  businessUnit: BusinessUnit;
  tableNumber: string;
  notes: string;
  items: CartItem[];
};

export async function fetchMenuCatalog(
  supabase: SupabaseClient,
  businessUnit?: BusinessUnit
): Promise<MenuItem[]> {
  let query = supabase
    .from("menu_items")
    .select("*")
    .eq("available", true)
    .order("name", { ascending: true });

  if (businessUnit) {
    query = query.eq("business_unit", businessUnit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data as MenuItem[]) ?? [];
}

export async function fetchDealsCatalog(
  supabase: SupabaseClient,
  businessUnit?: BusinessUnit
): Promise<PosDeal[]> {
  let query = supabase
    .from("deals")
    .select("*, deal_items(id, deal_id, menu_item_id, business_unit, quantity, menu_items(id, name))")
    .eq("active", true)
    .order("name", { ascending: true });

  if (businessUnit) {
    query = query.eq("business_unit", businessUnit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data as PosDeal[]) ?? [];
}

export async function fetchRecentOrders(
  supabase: SupabaseClient,
  businessUnit?: BusinessUnit
): Promise<Order[]> {
  let query = supabase
    .from("orders")
    .select("*, order_items(*), tickets(*)")
    .order("created_at", { ascending: false })
    .limit(10);

  if (businessUnit) {
    query = query.eq("business_unit", businessUnit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data as Order[]) ?? [];
}

export async function createPendingOrder(
  supabase: SupabaseClient,
  args: CreatePendingOrderArgs
): Promise<string> {
  const tableNumber = args.tableNumber.trim();
  if (!tableNumber) {
    throw new Error("Table number is required");
  }

  const payload = args.items.map((item) => ({
    item_type: item.item_type,
    item_id: item.item_id,
    name_snapshot: item.name_snapshot,
    qty: item.qty,
    unit_price_tnd: item.unit_price_snapshot,
  }));

  const { data, error } = await supabase.rpc("create_pending_order", {
    p_business_unit: args.businessUnit,
    p_table_number: tableNumber,
    p_notes: args.notes.trim() || null,
    p_items: payload,
  });

  if (error) {
    throw error;
  }

  return String(data);
}

export async function finalizeOrderAfterWebhookSuccess(
  supabase: SupabaseClient,
  orderId: string,
  externalRef: string
): Promise<Ticket> {
  const { data, error } = await supabase.rpc("finalize_order_after_webhook_success", {
    p_order_id: orderId,
    p_external_ref: externalRef,
  });

  if (error) {
    throw error;
  }

  return data as Ticket;
}

export async function markOrderWebhookFailed(
  supabase: SupabaseClient,
  orderId: string,
  errorMessage: string
): Promise<Order> {
  const { data, error } = await supabase.rpc("mark_order_webhook_failed", {
    p_order_id: orderId,
    p_error: errorMessage,
  });

  if (error) {
    throw error;
  }

  return data as Order;
}

export async function applyOrderInventoryConsumption(
  supabase: SupabaseClient,
  orderId: string
): Promise<InventoryConsumptionResult> {
  const { data, error } = await supabase.rpc("apply_order_inventory_consumption", {
    p_order_id: orderId,
  });

  if (error) {
    throw error;
  }

  return data as InventoryConsumptionResult;
}

export async function generateZReport(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit,
  day: string
): Promise<ZReport> {
  const { data, error } = await supabase.rpc("generate_z_report_pos", {
    p_business_unit: businessUnit,
    p_day: day,
  });

  if (error) {
    throw error;
  }

  return data as ZReport;
}

export async function fetchOrderById(
  supabase: SupabaseClient,
  orderId: string
): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*), tickets(*)")
    .eq("id", orderId)
    .single();

  if (error) {
    throw error;
  }

  return data as Order;
}
