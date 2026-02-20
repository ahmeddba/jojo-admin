import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TotalRevenueResult,
  DailySalesResult,
  BestSellingItem,
  RevenueTrendPoint,
  IngredientWithStatus,
} from "@/lib/database.types";

export async function fetchTotalRevenue(
  supabase: SupabaseClient,
  businessUnit: string,
  period: string = "month"
): Promise<TotalRevenueResult> {
  const { data, error } = await supabase.rpc("get_total_revenue", {
    p_period: period,
    p_business_unit: businessUnit,
  });
  if (error) throw error;
  return data as TotalRevenueResult;
}

export async function fetchDailySales(
  supabase: SupabaseClient,
  businessUnit: string,
  date?: string
): Promise<DailySalesResult> {
  const targetDate = date ?? new Date().toISOString().split("T")[0];
  const { data, error } = await supabase.rpc("get_daily_sales", {
    p_date: targetDate,
    p_business_unit: businessUnit,
  });
  if (error) throw error;
  return data as DailySalesResult;
}

export async function fetchBestSelling(
  supabase: SupabaseClient,
  businessUnit: string,
  period: string = "month",
  limit: number = 5
): Promise<BestSellingItem[]> {
  const { data, error } = await supabase.rpc("get_best_selling_items", {
    p_period: period,
    p_business_unit: businessUnit,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as BestSellingItem[]) ?? [];
}

export async function fetchRevenueTrend(
  supabase: SupabaseClient,
  businessUnit: string,
  period: string = "week"
): Promise<RevenueTrendPoint[]> {
  const { data, error } = await supabase.rpc("get_revenue_trend", {
    p_period: period,
    p_business_unit: businessUnit,
  });
  if (error) throw error;
  return (data as RevenueTrendPoint[]) ?? [];
}

export async function fetchLowStockItems(
  supabase: SupabaseClient,
  businessUnit: string,
  limit: number = 10
): Promise<IngredientWithStatus[]> {
  const { data, error } = await supabase
    .from("v_ingredient_status")
    .select("*")
    .eq("business_unit", businessUnit)
    .neq("computed_status", "in_stock")
    .order("quantity", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data as IngredientWithStatus[]) ?? [];
}
