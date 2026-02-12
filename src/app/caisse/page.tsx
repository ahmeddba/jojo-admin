"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { JojoDialog } from "@/components/modals/JojoDialog";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/SearchInput";
import { SegmentedToggle } from "@/components/common/SegmentedToggle";
import {
  Trash2,
  Eye,
  Loader2,
  Upload,
  FileText,
  FileSpreadsheet,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  fetchInvoices,
  fetchDailyReports,
  uploadDailyReport,
  deleteInvoice,
} from "@/lib/queries/caisse";
import type { SupplierInvoice, DailyReport, BusinessUnit } from "@/lib/database.types";

export default function CaissePage() {
  const [mode, setMode] = useState<BusinessUnit>("restaurant");
  const [search, setSearch] = useState("");
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<SupplierInvoice | null>(null);
  const [viewTarget, setViewTarget] = useState<SupplierInvoice | null>(null);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, rpts] = await Promise.all([
        fetchInvoices(supabase, mode),
        fetchDailyReports(supabase, mode),
      ]);
      setInvoices(inv);
      setReports(rpts);
    } catch (err) {
      console.error("Caisse fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((inv) => {
        if (!search.trim()) return true;
        return (
          inv.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
          inv.invoice_number.toLowerCase().includes(search.toLowerCase())
        );
      }),
    [invoices, search]
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const report = await uploadDailyReport(supabase, file, mode);
      setReports((prev) => [report, ...prev]);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload. Please try again.");
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInvoice(supabase, deleteTarget.id);
      setInvoices((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const statusColor = (status: string) => {
    if (status === "verified") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (status === "synced") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-display text-4xl font-bold text-slate-900 dark:text-white">Caisse & Invoicing</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Upload daily reports and manage supplier invoices.</p>
          </div>
          <Button
            className="bg-primary hover:bg-primary-dark text-white shadow-lg transition-transform hover:scale-105"
            onClick={() => loadData()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Business Unit Toggle */}
        <div className="flex items-center gap-4">
          <SegmentedToggle
            options={[
              { value: "restaurant", label: "Restaurant" },
              { value: "coffee", label: "Coffee Shop" },
            ]}
            value={mode}
            onChange={(v) => setMode(v === "coffee" ? "coffee" : "restaurant")}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Upload + Daily Reports */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            {/* Upload Area */}
            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">Upload Daily Report</h3>
              <div
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls"
                  onChange={handleFileUpload}
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm text-primary font-medium">Uploading...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Click to upload a daily report
                    </p>
                    <p className="text-xs text-slate-400">Support: PDF, XLSX — max 10 MB</p>
                  </>
                )}
              </div>
            </div>

            {/* Daily Reports List */}
            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">Recent Reports</h3>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : reports.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No reports uploaded yet.</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {reports.map((report) => (
                    <div key={report.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                      {report.file_type === "xlsx" ? (
                        <FileSpreadsheet className="h-8 w-8 text-green-600 flex-shrink-0" />
                      ) : (
                        <FileText className="h-8 w-8 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{report.file_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span className="text-xs text-slate-500">{formatDate(report.report_date)}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${statusColor(report.status)}`}>
                            {report.status}
                          </span>
                        </div>
                      </div>
                      {report.file_url && (
                        <a
                          href={report.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-slate-400 hover:text-primary flex-shrink-0"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Invoices Table */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">Supplier Invoices</h3>
                <SearchInput placeholder="Search invoices..." value={search} onChange={setSearch} />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2 text-slate-500">Loading invoices...</span>
                </div>
              ) : filteredInvoices.length === 0 ? (
                <EmptyState
                  title="No invoices found"
                  description="No supplier invoices match your search."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs font-bold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-6 py-4">Supplier</th>
                        <th className="px-6 py-4">Invoice #</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-white">{inv.supplier_name}</p>
                              <p className="text-xs text-slate-500">{inv.supplier_phone}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-slate-600 dark:text-slate-300">{inv.invoice_number}</td>
                          <td className="px-6 py-4 font-chart tabular-nums font-semibold text-slate-800 dark:text-white">
                            {inv.currency} {Number(inv.amount).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(inv.date_received)}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex justify-center gap-2">
                              {inv.file_url && (
                                <a
                                  href={inv.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 text-slate-400 hover:text-primary transition-colors"
                                  title="View File"
                                >
                                  <Eye className="h-4 w-4" />
                                </a>
                              )}
                              <button
                                onClick={() => setDeleteTarget(inv)}
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <JojoDialog open onOpenChange={() => setDeleteTarget(null)} title="Delete Invoice" primaryLabel="Delete">
          <p className="text-sm text-slate-600 mb-4">
            Are you sure you want to delete invoice <strong>{deleteTarget.invoice_number}</strong> from <strong>{deleteTarget.supplier_name}</strong>?
          </p>
          <Button className="bg-red-600 hover:bg-red-700 text-white w-full" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Confirm Delete"}
          </Button>
        </JojoDialog>
      )}

      {/* View Invoice Details */}
      {viewTarget && (
        <JojoDialog open onOpenChange={() => setViewTarget(null)} title="Invoice Details" primaryLabel="Close">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Supplier</span>
              <span className="font-medium">{viewTarget.supplier_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Phone</span>
              <span>{viewTarget.supplier_phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Invoice #</span>
              <span className="font-mono">{viewTarget.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount</span>
              <span className="font-bold">{viewTarget.currency} {Number(viewTarget.amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date</span>
              <span>{formatDate(viewTarget.date_received)}</span>
            </div>
            {viewTarget.file_url && (
              <a href={viewTarget.file_url} target="_blank" rel="noopener noreferrer" className="block mt-2 text-primary hover:underline">
                View attached file →
              </a>
            )}
          </div>
        </JojoDialog>
      )}
    </AppLayout>
  );
}
