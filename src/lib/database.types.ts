/* ============================================================
 * Manually authored TypeScript types matching supabase_schema.sql
 * ============================================================ */

export type BusinessUnit = "restaurant" | "coffee";
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type UserRole = "admin" | "staff";
export type ReportStatus = "pending" | "synced" | "verified";

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
  category_id: string | null;
  available: boolean;
  image_url: string | null;
  business_unit: BusinessUnit;
  created_at: string;
  updated_at: string;
  // Joined field (optional)
  menu_categories?: MenuCategory;
}

export interface Deal {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  active: boolean;
  business_unit: BusinessUnit;
  created_at: string;
  updated_at: string;
  // Joined
  deal_items?: DealItem[];
}

export interface DealItem {
  id: string;
  deal_id: string;
  menu_item_id: string;
  business_unit: BusinessUnit;
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
