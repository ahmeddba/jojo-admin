import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IngredientWithStatus,
  IngredientInsert,
  IngredientUpdate,
  BusinessUnit,
  StockAudit,
} from "@/lib/database.types";

export async function fetchIngredients(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<IngredientWithStatus[]> {
  const { data, error } = await supabase
    .from("v_ingredient_status")
    .select("*")
    .eq("business_unit", businessUnit)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as IngredientWithStatus[]) ?? [];
}

async function logStockAudit(
  supabase: SupabaseClient,
  audit: {
    business_unit: BusinessUnit;
    ingredient_id: string | null;
    ingredient_name: string;
    action_type: "RESTOCK" | "ADJUST" | "CONSUME" | "CREATE" | "UPDATE" | "DELETE";
    qty_change: number;
    qty_after: number;
    supplier_info?: Record<string, unknown> | null;
  }
) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("stock_audits").insert({
    ...audit,
    user_id: user?.id,
  });
  if (error) console.error("Audit log error:", error);
}

export async function createIngredient(
  supabase: SupabaseClient,
  ingredient: IngredientInsert
): Promise<IngredientWithStatus> {
  // Check for duplicate name within the same business unit
  const { data: existing } = await supabase
    .from("ingredients")
    .select("id")
    .eq("name", ingredient.name)
    .eq("business_unit", ingredient.business_unit)
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error(
      `"${ingredient.name}" already exists. Use the 📦 Restock button to add stock.`
    );
  }

  const { data, error } = await supabase
    .from("ingredients")
    .insert(ingredient)
    .select()
    .single();
  if (error) throw error;
  // Re-fetch from view to get computed fields
  const { data: full, error: viewError } = await supabase
    .from("v_ingredient_status")
    .select("*")
    .eq("id", data.id)
    .single();
  if (viewError) throw viewError;

  await logStockAudit(supabase, {
    business_unit: ingredient.business_unit,
    ingredient_id: full.id,
    ingredient_name: full.name,
    action_type: "CREATE",
    qty_change: Number(full.quantity),
    qty_after: Number(full.quantity),
    supplier_info: { phone: ingredient.supplier_phone },
  });

  return full as IngredientWithStatus;
}

export async function updateIngredient(
  supabase: SupabaseClient,
  id: string,
  updates: IngredientUpdate
): Promise<IngredientWithStatus> {
  const { error } = await supabase
    .from("ingredients")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
  // Re-fetch from view to get computed fields
  const { data: full, error: viewError } = await supabase
    .from("v_ingredient_status")
    .select("*")
    .eq("id", id)
    .single();
  if (viewError) throw viewError;

  if (updates.quantity !== undefined || updates.name || updates.price_per_unit) {
      await logStockAudit(supabase, {
        business_unit: full.business_unit,
        ingredient_id: full.id,
        ingredient_name: full.name,
        action_type: "UPDATE",
        qty_change: 0, 
        qty_after: Number(full.quantity),
        supplier_info: { updates },
      });
  }

  return full as IngredientWithStatus;
}

export async function deleteIngredient(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  // Fetch for audit before deletion
  const { data: item } = await supabase
    .from("ingredients")
    .select("name, quantity, business_unit")
    .eq("id", id)
    .single();

  if (item) {
    await logStockAudit(supabase, {
      business_unit: item.business_unit,
      ingredient_id: id,
      ingredient_name: item.name,
      action_type: "DELETE",
      qty_change: -Number(item.quantity),
      qty_after: 0,
    });
  }

  // 1. Delete from menu_item_ingredients (recipes)
  const { error: recipeError } = await supabase
    .from("menu_item_ingredients")
    .delete()
    .eq("ingredient_id", id);
  if (recipeError) throw recipeError;

  // 2. Delete from inventory_movements (history/ledger)
  const { error: ledgerError } = await supabase
    .from("inventory_movements")
    .delete()
    .eq("ingredient_id", id);
  if (ledgerError) throw ledgerError;

  // 3. Delete from stock_alert_events (alerts)
  const { error: alertError } = await supabase
    .from("stock_alert_events")
    .delete()
    .eq("ingredient_id", id);
  if (alertError) throw alertError;

  // 4. Delete the ingredient itself
  const { error, count } = await supabase
    .from("ingredients")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (count === 0) {
    throw new Error("Failed to delete ingredient: not found or access denied.");
  }
}

export async function restockIngredient(
  supabase: SupabaseClient,
  id: string,
  addedQuantity: number,
  supplierInfo?: {
    name: string;
    invoice_number: string;
    invoice_id?: string;
  }
): Promise<IngredientWithStatus> {
  // Read current quantity first
  const { data: current, error: readError } = await supabase
    .from("ingredients")
    .select("name, quantity, business_unit")
    .eq("id", id)
    .single();
  if (readError) throw readError;

  const newQuantity = Number(current.quantity) + addedQuantity;

  const { error: updateError } = await supabase
    .from("ingredients")
    .update({ quantity: newQuantity })
    .eq("id", id);
  if (updateError) throw updateError;

  // Re-fetch from view to get computed fields
  const { data: full, error: viewError } = await supabase
    .from("v_ingredient_status")
    .select("*")
    .eq("id", id)
    .single();
  if (viewError) throw viewError;

  await logStockAudit(supabase, {
    business_unit: current.business_unit,
    ingredient_id: id,
    ingredient_name: current.name,
    action_type: "RESTOCK",
    qty_change: addedQuantity,
    qty_after: newQuantity,
    supplier_info: supplierInfo,
  });

  return full as IngredientWithStatus;
}

export async function fetchStockAudits(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<StockAudit[]> {
  const { data, error } = await supabase
    .from("stock_audits")
    .select("*")
    .eq("business_unit", businessUnit)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data as StockAudit[]) ?? [];
}
