/* ============================================================
 * Manually authored TypeScript types matching supabase_schema.sql
 * ============================================================ */

export type BusinessUnit = "restaurant" | "coffee";
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type UserRole = "admin" | "staff";
export type ReportStatus = "pending" | "synced" | "verified";
export type OrderStatus = "PENDING_WEBHOOK" | "FAILED_WEBHOOK" | "SUBMITTED";

/* ---- Row types ---- */

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  business_unit: BusinessUnit | null;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  seuil?: number | null;
  price_per_unit: number;
  min_quantity: number;
  supplier_phone: string;
  business_unit: BusinessUnit;
  created_at: string;
  updated_at: string;
}

export interface IngredientWithStatus extends Ingredient {
  total_value: number;
  computed_status: StockStatus;
}

export interface MenuCategory {
  id: string;
  name: string;
  business_unit: BusinessUnit;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  price_tnd?: number | null;
  category?: string | null;
  category_id: string | null;
  available: boolean;
  image_url: string | null;
  business_unit: BusinessUnit;
  created_at: string;
  updated_at: string;
  // Joined field (optional)
  menu_categories?: MenuCategory;
}

export interface MenuItemIngredient {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  qty_used: number;
  created_at: string;
  ingredients?: Ingredient | Ingredient[];
}

export interface Deal {
  id: string;
  name: string;
  description: string;
  price: number;
  price_tnd?: number | null;
  image_url: string | null;
  active: boolean;
  business_unit?: BusinessUnit | null;
  created_at: string;
  updated_at: string;
  // Joined
  deal_items?: DealItem[];
}

export interface DealItem {
  id: string;
  deal_id: string;
  menu_item_id: string;
  business_unit?: BusinessUnit | null;
  // Joined
  menu_items?: MenuItem;
}

export interface SupplierInvoice {
  id: string;
  supplier_name: string;
  supplier_phone: string;
  invoice_number: string;
  amount: number;
  currency: string;
  date_received: string;
  file_url: string | null;
  business_unit: BusinessUnit;
  created_at: string;
  updated_at: string;
}

export interface DailyReport {
  id: string;
  report_date: string;
  file_url: string | null;
  file_name: string;
  file_type: string;
  status: ReportStatus;
  business_unit: BusinessUnit;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  total: number;
  items_count: number;
  business_unit: BusinessUnit;
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  business_unit: BusinessUnit;
  created_at: string;
}

export interface Order {
  id: string;
  business_unit: BusinessUnit;
  table_number: string | null;
  status: OrderStatus;
  inventory_applied?: boolean;
  total_tnd: number;
  notes: string | null;
  external_ref: string | null;
  webhook_error: string | null;
  created_at: string;
  order_items?: OrderItem[];
  tickets?: Ticket | Ticket[] | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_type: "menu" | "deal";
  item_id: string | null;
  name_snapshot: string;
  qty: number;
  unit_price_tnd: number;
  line_total_tnd: number;
  created_at: string;
}

export interface Ticket {
  id: string;
  business_unit: BusinessUnit;
  order_id: string;
  ticket_number: number;
  ticket_date: string;
  content_text: string;
  created_at: string;
}

export interface ZReport {
  id: string;
  business_unit: BusinessUnit;
  day: string;
  total_orders: number;
  total_revenue_tnd: number;
  created_at: string;
}

export interface InventoryConsumptionSummaryItem {
  ingredient_id: string;
  before_quantity: number;
  after_quantity: number;
  alert_generated: boolean;
}

export interface InventoryConsumptionResult {
  order_id: string;
  already_applied: boolean;
  alerts_generated: number;
  ingredients: InventoryConsumptionSummaryItem[];
}

export interface StockAlertEvent {
  id: string;
  ingredient_id: string;
  event_type: "LOW_STOCK" | "OUT_OF_STOCK";
  quantity_after: number;
  seuil: number;
  created_at: string;
  processed_at: string | null;
  meta: Record<string, unknown> | null;
}

export interface DealOrderItem extends DealItem {
  quantity: number;
}

export interface PosDeal extends Deal {
  deal_items?: DealOrderItem[];
}

export interface CartItem {
  item_type: "menu" | "deal";
  item_id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  line_total_tnd: number;
}

export interface StockAudit {
  id: string;
  business_unit: BusinessUnit;
  ingredient_id: string | null;
  ingredient_name: string;
  action_type: "RESTOCK" | "ADJUST" | "CONSUME" | "CREATE" | "UPDATE" | "DELETE";
  qty_change: number;
  qty_after: number;
  supplier_info: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
}

/* ---- RPC return types ---- */

export interface TotalRevenueResult {
  total: number;
  period: string;
  business_unit: string;
}

export interface DailySalesResult {
  total: number;
  count: number;
  date: string;
}

export interface BestSellingItem {
  name: string;
  category: string;
  quantity: number;
}

export interface RevenueTrendPoint {
  date: string;
  amount: number;
}

/* ---- Insert types (omit auto-generated fields) ---- */

export type IngredientInsert = Omit<Ingredient, "id" | "created_at" | "updated_at">;
export type IngredientUpdate = Partial<IngredientInsert>;

export type MenuItemInsert = Omit<MenuItem, "id" | "created_at" | "updated_at" | "menu_categories">;
export type MenuItemUpdate = Partial<MenuItemInsert>;

export type DealInsert = Omit<Deal, "id" | "created_at" | "updated_at" | "deal_items">;
export type DealUpdate = Partial<DealInsert>;

export type SupplierInvoiceInsert = Omit<SupplierInvoice, "id" | "created_at" | "updated_at">;
export type DailyReportInsert = Omit<DailyReport, "id" | "created_at" | "updated_at">;
export type OrderInsert = Omit<
  Order,
  | "id"
  | "created_at"
  | "order_items"
  | "tickets"
>;
export type OrderUpdate = Partial<OrderInsert>;

export type OrderItemInsert = Omit<OrderItem, "id" | "created_at">;
export type OrderItemUpdate = Partial<OrderItemInsert>;
