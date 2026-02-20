import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SupplierInvoice,
  DailyReport,
  BusinessUnit,
} from "@/lib/database.types";

// ---- Supplier Invoices ----

export async function fetchInvoices(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<SupplierInvoice[]> {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("*")
    .eq("business_unit", businessUnit)
    .order("date_received", { ascending: false });
  if (error) throw error;
  return (data as SupplierInvoice[]) ?? [];
}

export async function deleteInvoice(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("supplier_invoices")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function createInvoice(
  supabase: SupabaseClient,
  invoice: Omit<SupplierInvoice, "id" | "created_at" | "updated_at">
): Promise<SupplierInvoice> {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .insert(invoice)
    .select()
    .single();
  if (error) throw error;
  return data as SupplierInvoice;
}

// ---- Daily Reports ----

export async function fetchDailyReports(
  supabase: SupabaseClient,
  businessUnit: BusinessUnit
): Promise<DailyReport[]> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("business_unit", businessUnit)
    .order("report_date", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as DailyReport[]) ?? [];
}

export async function uploadDailyReport(
  supabase: SupabaseClient,
  file: File,
  businessUnit: BusinessUnit
): Promise<DailyReport> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
  const fileType = ext === "xlsx" || ext === "xls" ? "xlsx" : "pdf";
  const storagePath = `${businessUnit}/${Date.now()}_${file.name}`;

  // Upload file to storage
  const { error: uploadError } = await supabase.storage
    .from("daily-reports")
    .upload(storagePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  // Get the URL (signed for private bucket)
  const { data: urlData } = await supabase.storage
    .from("daily-reports")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

  const fileUrl = urlData?.signedUrl ?? storagePath;

  // Insert record via RPC
  const { data: reportId, error: rpcError } = await supabase.rpc(
    "insert_daily_report",
    {
      p_report_date: new Date().toISOString().split("T")[0],
      p_file_url: fileUrl,
      p_file_name: file.name,
      p_file_type: fileType,
      p_business_unit: businessUnit,
    }
  );
  if (rpcError) throw rpcError;

  // Fetch the inserted record
  const { data: report, error: fetchError } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("id", reportId)
    .single();
  if (fetchError) throw fetchError;
  return report as DailyReport;
}

export async function uploadInvoiceFile(
  supabase: SupabaseClient,
  file: File,
  businessUnit: BusinessUnit
): Promise<string> {
  const storagePath = `${businessUnit}/${Date.now()}_${file.name}`;

  const { error } = await supabase.storage
    .from("invoices")
    .upload(storagePath, file, { upsert: true });
  if (error) throw error;

  const { data: urlData } = await supabase.storage
    .from("invoices")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
  return urlData?.signedUrl ?? storagePath;
}
