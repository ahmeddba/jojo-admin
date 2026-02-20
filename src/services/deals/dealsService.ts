import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Deal,
  DealInsert,
  DealUpdate,
  BusinessUnit,
} from "@/lib/database.types";

export async function fetchDeals(
  supabase: SupabaseClient
): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select("*, deal_items(id, menu_item_id, menu_items(id, name, price, image_url, business_unit))")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Deal[]) ?? [];
}

export async function createDeal(
  supabase: SupabaseClient,
  deal: DealInsert,
  menuItems: { id: string; business_unit: BusinessUnit }[]
): Promise<Deal> {
  // Use "restaurant" as default business_unit to satisfy DB constraints for the deal itself
  const payload = { ...deal, business_unit: "restaurant" };

  const { data, error } = await supabase
    .from("deals")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  if (menuItems.length > 0) {
    const dealItems = menuItems.map((item) => ({
      deal_id: data.id,
      menu_item_id: item.id,
      business_unit: item.business_unit, // transform correct BU
    }));
    const { error: diError } = await supabase
      .from("deal_items")
      .insert(dealItems);
    if (diError) throw diError;
  }

  // Re-fetch with joins
  const { data: full, error: refetchError } = await supabase
    .from("deals")
    .select("*, deal_items(id, menu_item_id, menu_items(id, name, price, image_url, business_unit))")
    .eq("id", data.id)
    .single();
  if (refetchError) throw refetchError;
  return full as Deal;
}

export async function updateDeal(
  supabase: SupabaseClient,
  id: string,
  deal: DealUpdate,
  menuItems: { id: string; business_unit: BusinessUnit }[]
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

  if (menuItems.length > 0) {
    const dealItems = menuItems.map((item) => ({
      deal_id: id,
      menu_item_id: item.id,
      business_unit: item.business_unit, // transform correct BU
    }));
    const { error: diError } = await supabase
      .from("deal_items")
      .insert(dealItems);
    if (diError) throw diError;
  }

  // Re-fetch with joins
  const { data: full, error: refetchError } = await supabase
    .from("deals")
    .select("*, deal_items(id, menu_item_id, menu_items(id, name, price, image_url, business_unit))")
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
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const fileName = `deals/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("menu-images")
    .upload(fileName, file, { upsert: true });
  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("menu-images")
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}
