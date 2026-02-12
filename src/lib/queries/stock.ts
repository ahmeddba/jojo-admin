import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IngredientWithStatus,
  IngredientInsert,
  IngredientUpdate,
  BusinessUnit,
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

export async function createIngredient(
  supabase: SupabaseClient,
  ingredient: IngredientInsert
): Promise<IngredientWithStatus> {
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
  return full as IngredientWithStatus;
}

export async function deleteIngredient(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error, count } = await supabase
    .from("ingredients")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (count === 0) {
    throw new Error("Failed to delete item: Item not found or access denied.");
  }
}
