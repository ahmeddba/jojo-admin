import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Deal,
  DealInsert,
  DealUpdate,
  BusinessUnit,
} from "@/lib/database.types";

export async function fetchDeals(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select("*, deal_items(id, menu_item_id, menu_items(id, name))")
    .eq("business_unit", businessUnit)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Deal[]) ?? [];
}

export async function createDeal(
  supabase: SupabaseClient,
  deal: DealInsert,
  menuItemIds: string[]
): Promise<Deal> {
  const { data, error } = await supabase
    .from("deals")
    .insert(deal)
    .select()
    .single();
  if (error) throw error;

  if (menuItemIds.length > 0) {
    const dealItems = menuItemIds.map((menuItemId) => ({
      deal_id: data.id,
      menu_item_id: menuItemId,
      business_unit: deal.business_unit,
    }));
    const { error: diError } = await supabase
      .from("deal_items")
      .insert(dealItems);
    if (diError) throw diError;
  }

  // Re-fetch with joins
  const { data: full, error: refetchError } = await supabase
    .from("deals")
    .select("*, deal_items(id, menu_item_id, menu_items(id, name))")
    .eq("id", data.id)
    .single();
  if (refetchError) throw refetchError;
  return full as Deal;
}

export async function updateDeal(
  supabase: SupabaseClient,
  id: string,
  deal: DealUpdate,
  menuItemIds: string[],
  businessUnit: BusinessUnit
): Promise<Deal> {
  const { error } = await supabase
    .from("deals")
    .update(deal)
    .eq("id", id);
  if (error) throw error;

  // Replace deal_items: delete old, insert new
  const { error: delError } = await supabase
    .from("deal_items")
    .delete()
    .eq("deal_id", id);
  if (delError) throw delError;

  if (menuItemIds.length > 0) {
    const dealItems = menuItemIds.map((menuItemId) => ({
      deal_id: id,
      menu_item_id: menuItemId,
      business_unit: businessUnit,
    }));
    const { error: diError } = await supabase
      .from("deal_items")
      .insert(dealItems);
    if (diError) throw diError;
  }

  // Re-fetch with joins
  const { data: full, error: refetchError } = await supabase
    .from("deals")
    .select("*, deal_items(id, menu_item_id, menu_items(id, name))")
    .eq("id", id)
    .single();
  if (refetchError) throw refetchError;
  return full as Deal;
}

export async function deleteDeal(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("deals")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function uploadDealImage(
  supabase: SupabaseClient,
  file: File,
  businessUnit: BusinessUnit
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const fileName = `${businessUnit}/deals/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("menu-images")
    .upload(fileName, file, { upsert: true });
  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("menu-images")
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}
