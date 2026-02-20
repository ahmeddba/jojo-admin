import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Ingredient,
  MenuItem,
  MenuItemIngredient,
  MenuCategory,
  MenuItemInsert,
  MenuItemUpdate,
  BusinessUnit,
} from "@/lib/database.types";

export async function fetchMenuItems(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*, menu_categories(id, name)")
    .eq("business_unit", businessUnit)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as MenuItem[]) ?? [];
}

export async function fetchMenuCategories(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<MenuCategory[]> {
  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("business_unit", businessUnit)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as MenuCategory[]) ?? [];
}

export async function createMenuItem(
  supabase: SupabaseClient,
  item: MenuItemInsert
): Promise<MenuItem> {
  const { data, error } = await supabase
    .from("menu_items")
    .insert(item)
    .select("*, menu_categories(id, name)")
    .single();
  if (error) throw error;
  return data as MenuItem;
}

export async function updateMenuItem(
  supabase: SupabaseClient,
  id: string,
  updates: MenuItemUpdate
): Promise<MenuItem> {
  const { data, error } = await supabase
    .from("menu_items")
    .update(updates)
    .eq("id", id)
    .select("*, menu_categories(id, name)")
    .single();
  if (error) throw error;
  return data as MenuItem;
}

export async function deleteMenuItem(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function uploadMenuImage(
  supabase: SupabaseClient,
  file: File,
  businessUnit: BusinessUnit
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const fileName = `${businessUnit}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("menu-images")
    .upload(fileName, file, { upsert: true });
  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("menu-images")
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}

export async function fetchRecipeIngredients(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .eq("business_unit", businessUnit)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data as Ingredient[]) ?? [];
}

export async function fetchMenuItemRecipe(
  supabase: SupabaseClient,
  menuItemId: string
): Promise<MenuItemIngredient[]> {
  const { data, error } = await supabase
    .from("menu_item_ingredients")
    .select("id, menu_item_id, ingredient_id, qty_used, created_at, ingredients(*)")
    .eq("menu_item_id", menuItemId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as MenuItemIngredient[]) ?? [];
}

type UpsertMenuItemRecipeIngredientArgs = {
  menu_item_id: string;
  ingredient_id: string;
  qty_used: number;
};

export async function upsertMenuItemRecipeIngredient(
  supabase: SupabaseClient,
  payload: UpsertMenuItemRecipeIngredientArgs
): Promise<MenuItemIngredient> {
  const { data, error } = await supabase
    .from("menu_item_ingredients")
    .upsert(payload, { onConflict: "menu_item_id,ingredient_id" })
    .select("id, menu_item_id, ingredient_id, qty_used, created_at, ingredients(*)")
    .single();

  if (error) throw error;
  return data as MenuItemIngredient;
}

export async function deleteMenuItemRecipeIngredient(
  supabase: SupabaseClient,
  rowId: string
): Promise<void> {
  const { error } = await supabase
    .from("menu_item_ingredients")
    .delete()
    .eq("id", rowId);

  if (error) throw error;
}
