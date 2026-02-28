import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IngredientWithStatus,
  IngredientInsert,
  IngredientUpdate,
  BusinessUnit,
  InventoryMovement,
  RestockResult,
  UndoMovementResult,
} from "@/lib/database.types";

/* ================================================================
 * Queries
 * ================================================================ */

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

export async function fetchMovements(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<InventoryMovement[]> {
  // Query movements joined with ingredient name
  // Filter by ingredient's business_unit (always set) rather than
  // movement's denormalized business_unit (may be NULL for old records)
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("*, ingredients!inner(name, business_unit)")
    .eq("ingredients.business_unit", businessUnit)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  // Map the joined ingredient name into the flat structure
  return (data ?? []).map(
    (row: Record<string, unknown>): InventoryMovement => {
      const ingredients = row.ingredients as { name: string } | null;
      return {
        id: row.id as string,
        ingredient_id: row.ingredient_id as string,
        movement_type: row.movement_type as InventoryMovement["movement_type"],
        qty_change: Number(row.qty_change),
        amount_tnd_delta: Number(row.amount_tnd_delta),
        reason: row.reason as string | null,
        ref_order_id: row.ref_order_id as string | null,
        invoice_id: row.invoice_id as string | null,
        reversed_movement_id: row.reversed_movement_id as string | null,
        is_reversed: row.is_reversed as boolean,
        business_unit: row.business_unit as BusinessUnit,
        created_at: row.created_at as string,
        ingredient_name: ingredients?.name ?? "Unknown",
      };
    }
  );
}

/* ================================================================
 * Audit logging (kept for metadata operations only)
 * ================================================================ */

async function logStockAudit(
  supabase: SupabaseClient,
  audit: {
    business_unit: BusinessUnit;
    ingredient_id: string | null;
    ingredient_name: string;
    action_type: "CREATE" | "UPDATE" | "DELETE";
    qty_change: number;
    qty_after: number;
    supplier_info?: Record<string, unknown> | null;
  }
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("stock_audits").insert({
    ...audit,
    user_id: user?.id,
  });
  if (error) console.error("Audit log error:", error);
}

/* ================================================================
 * Ingredient CRUD (metadata only — no direct quantity mutation)
 * ================================================================ */

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

  // Insert CREATE movement into the ledger for history visibility
  await supabase.from("inventory_movements").insert({
    ingredient_id: full.id,
    movement_type: "CREATE",
    qty_change: 0,
    amount_tnd_delta: 0,
    reason: "Ingredient created",
    business_unit: ingredient.business_unit,
  });

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

  await logStockAudit(supabase, {
    business_unit: full.business_unit,
    ingredient_id: full.id,
    ingredient_name: full.name,
    action_type: "UPDATE",
    qty_change: 0,
    qty_after: Number(full.quantity),
    supplier_info: { updates },
  });

  return full as IngredientWithStatus;
}

export async function deleteIngredient(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  // Check if movements exist — if so, block deletion (ledger is immutable)
  const { count: movementCount } = await supabase
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("ingredient_id", id);

  if (movementCount && movementCount > 0) {
    throw new Error(
      "Cannot delete this ingredient: it has inventory movements in the ledger. " +
      "Ledger entries are permanent for audit safety. " +
      "Set the stock to zero via an adjustment if this ingredient is no longer used."
    );
  }

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

  // 2. Delete from stock_alert_events (alerts)
  const { error: alertError } = await supabase
    .from("stock_alert_events")
    .delete()
    .eq("ingredient_id", id);
  if (alertError) throw alertError;

  // 3. Delete the ingredient itself (only possible if zero movements)
  const { error, count } = await supabase
    .from("ingredients")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (count === 0) {
    throw new Error("Failed to delete ingredient: not found or access denied.");
  }
}

/* ================================================================
 * Restock — via RPC (transactional, WAC, financial invariant)
 * ================================================================ */

export async function restockIngredient(
  supabase: SupabaseClient,
  id: string,
  addedQuantity: number,
  addedValueTnd: number = 0,
  invoiceId?: string
): Promise<RestockResult> {
  const { data, error } = await supabase.rpc("perform_restock", {
    p_ingredient_id: id,
    p_qty_delta: addedQuantity,
    p_amount_tnd_delta: addedValueTnd,
    p_invoice_id: invoiceId ?? null,
  });

  if (error) throw error;
  return data as RestockResult;
}

/* ================================================================
 * Undo Movement — via RPC (transactional, safe)
 * ================================================================ */

export async function undoMovement(
  supabase: SupabaseClient,
  movementId: string
): Promise<UndoMovementResult> {
  const { data, error } = await supabase.rpc("undo_movement", {
    p_movement_id: movementId,
  });

  if (error) throw error;
  return data as UndoMovementResult;
}
