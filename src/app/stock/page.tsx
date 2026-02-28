"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useMemo, useState, useEffect, useCallback } from "react";
import { StatusPill } from "@/components/common/StatusPill";
import { EmptyState } from "@/components/common/EmptyState";
import { JojoDialog } from "@/components/modals/JojoDialog";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/SearchInput";
import { Pencil, Trash2, Plus, Loader2, Package, FileText } from "lucide-react";
import { StockHistory } from "@/components/stock/StockHistory";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase";
import {
  fetchIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  restockIngredient,
  fetchMovements,
  undoMovement,
} from "@/services/stock/stockService";
import { uploadInvoiceFile, createInvoice } from "@/services/caisse/caisseService";
import { formatQuantity } from "@/lib/utils";
import type {
  IngredientWithStatus,
  BusinessUnit,
  StockStatus,
  InventoryMovement,
} from "@/lib/database.types";

const IngredientSchema = Yup.object({
  name: Yup.string().trim().required("Ingredient name is required"),
  unit: Yup.string().trim().required("Unit is required (e.g. kg, L, pcs)"),
  min_quantity: Yup.number()
    .typeError("Seuil must be a number")
    .min(0, "Seuil cannot be negative")
    .required("Seuil (min quantity) is required"),
  supplier_phone: Yup.string().trim().required("Supplier phone is required"),
});

type IngredientFormValues = {
  name: string;
  unit: string;
  min_quantity: number;
  supplier_phone: string;
};

function resolveSeuil(item: IngredientWithStatus): number {
  if (typeof item.seuil === "number") {
    return Number(item.seuil);
  }
  return Number(item.min_quantity);
}

function resolveStatus(item: IngredientWithStatus): StockStatus {
  const quantity = Number(item.quantity);
  const seuil = resolveSeuil(item);

  if (quantity <= 0) {
    return "out_of_stock";
  }
  if (quantity <= seuil) {
    return "low_stock";
  }
  return "in_stock";
}

export default function StockPage() {
  const [mode, setMode] = useState<BusinessUnit>("restaurant");
  const [view, setView] = useState<"inventory" | "history">("inventory");
  const [filter, setFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<IngredientWithStatus[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);

  const toast = useToast();

  const [editingItem, setEditingItem] = useState<IngredientWithStatus | null>(null);
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | "delete" | "restock" | null>(null);
  const [restockQty, setRestockQty] = useState<number>(0);
  
  // Invoice state
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsData, movementsData] = await Promise.all([
        fetchIngredients(supabase, mode),
        fetchMovements(supabase, mode),
      ]);
      setItems(itemsData);
      setMovements(movementsData);
    } catch (err) {
      console.error("Stock fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (filter !== "all" && resolveStatus(i) !== filter) return false;
        if (!search.trim()) return true;
        return i.name.toLowerCase().includes(search.toLowerCase());
      }),
    [items, filter, search]
  );

  // Computed stats
  const totalItems = filtered.length;
  const lowStockCount = filtered.filter((i) => {
    const status = resolveStatus(i);
    return status === "low_stock" || status === "out_of_stock";
  }).length;
  const totalValue = filtered.reduce((acc, i) => acc + Number(i.total_value), 0);

  const openAdd = () => {
    setEditingItem(null);
    setDialogMode("add");
  };

  const openEdit = (item: IngredientWithStatus) => {
    setEditingItem(item);
    setDialogMode("edit");
  };

  const openDelete = (item: IngredientWithStatus) => {
    setEditingItem(item);
    setDialogMode("delete");
  };

  const closeDialog = () => setDialogMode(null);

  const openRestock = (item: IngredientWithStatus) => {
    setEditingItem(item);
    setRestockQty(0);
    setSupplierName("");
    setInvoiceNumber("");
    setInvoiceAmount(0);
    setInvoiceFile(null);
    setDialogMode("restock");
  };

  const handleRestock = async () => {
    if (!editingItem || restockQty <= 0) return;
    setSaving(true);
    try {
      let invoiceId: string | undefined;

      // Handle Invoice Creation if details provided
      if (supplierName && invoiceNumber && invoiceAmount > 0) {
        let fileUrl = null;
        if (invoiceFile) {
           fileUrl = await uploadInvoiceFile(supabase, invoiceFile, mode);
        }
        
        const invoice = await createInvoice(supabase, {
           supplier_name: supplierName,
           supplier_phone: editingItem.supplier_phone,
           invoice_number: invoiceNumber,
           amount: invoiceAmount,
           currency: "TND",
           date_received: new Date().toISOString(),
           file_url: fileUrl,
           business_unit: mode
        });
        invoiceId = invoice.id;
      }

      // Call the RPC-based restock
      await restockIngredient(
        supabase, 
        editingItem.id, 
        restockQty,
        invoiceAmount,
        invoiceId
      );

      // Reload data to get fresh state from DB
      await loadData();
      
      closeDialog();
      toast.success(`Added ${restockQty} ${editingItem.unit} to ${editingItem.name}`);
    } catch (err) {
      console.error("Restock error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to restock. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async (movementId: string) => {
    setUndoing(movementId);
    try {
      await undoMovement(supabase, movementId);
      await loadData();
      toast.success("Movement reversed successfully");
    } catch (err) {
      console.error("Undo error:", err);
      const message = err instanceof Error ? err.message : "Failed to undo movement.";
      // Make RPC error messages more user-friendly
      if (message.includes("subsequent movements exist")) {
        toast.error("Cannot undo: there are newer movements for this ingredient. Create an adjustment instead.");
      } else if (message.includes("negative stock")) {
        toast.error("Cannot undo: would result in negative stock.");
      } else if (message.includes("already been reversed")) {
        toast.error("This movement has already been reversed.");
      } else {
        toast.error(message);
      }
    } finally {
      setUndoing(null);
    }
  };

  const initialValuesFromItem = (item?: IngredientWithStatus): IngredientFormValues => ({
    name: item?.name ?? "",
    unit: item?.unit ?? "",
    min_quantity: item?.min_quantity ?? 0,
    supplier_phone: item?.supplier_phone ?? "",
  });

  const handleSubmit = async (values: IngredientFormValues) => {
    setSaving(true);
    try {
      if (dialogMode === "add") {
        const newItem = await createIngredient(supabase, {
          ...values,
          quantity: 0,
          business_unit: mode,
        });
        setItems((prev) => [...prev, newItem]);
        toast.success(`"${values.name}" added successfully`);
      } else if (dialogMode === "edit" && editingItem) {
        const updated = await updateIngredient(supabase, editingItem.id, values);
        setItems((prev) =>
          prev.map((i) => (i.id === editingItem.id ? updated : i))
        );
        toast.success(`"${values.name}" updated successfully`);
      }
      closeDialog();
    } catch (err) {
      console.error("Save error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      await deleteIngredient(supabase, editingItem.id);
      setItems((prev) => prev.filter((i) => i.id !== editingItem.id));
      closeDialog();
      toast.success(`"${editingItem.name}" deleted`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      // Graceful handling for ledger-protected ingredients
      if (message.includes("inventory movements")) {
        closeDialog();
        toast.warning(
          `"${editingItem.name}" has ledger history and cannot be deleted. ` +
          `Set its stock to zero via a restock adjustment if it's no longer in use.`
        );
      } else {
        console.error("Delete error:", err);
        toast.error(message || "Failed to delete. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const mapStatus = (status: StockStatus): "in-stock" | "low-stock" | "out-of-stock" => {
    if (status === "in_stock") return "in-stock";
    if (status === "low_stock") return "low-stock";
    return "out-of-stock";
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="font-display text-4xl font-bold text-slate-900">Inventory Control</h1>
          <Button className="bg-primary hover:bg-primary-dark text-white shadow-lg transition-transform hover:scale-105" onClick={openAdd}>
            <Plus className="h-5 w-5 mr-2" />
            Add Ingredient
          </Button>
        </div>

        {/* Business Unit Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex p-1 bg-slate-200 rounded-lg">
            <button
              onClick={() => setMode("restaurant")}
              className={`px-6 py-2 rounded-md font-semibold transition-all ${
                mode === "restaurant"
                  ? "bg-white text-primary shadow"
                  : "text-slate-600"
              }`}
            >
              Restaurant
            </button>
            <button
              onClick={() => setMode("coffee")}
              className={`px-6 py-2 rounded-md font-semibold transition-all ${
                mode === "coffee"
                  ? "bg-white text-primary shadow"
                  : "text-slate-600"
              }`}
            >
              Coffee
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Items</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-1">{totalItems}</h3>
            </div>
            <div className="p-3 bg-blue-100 text-blue-700 rounded-full">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </div>
          </div>
          
          <div className="p-6 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Low Stock</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-1">{lowStockCount}</h3>
            </div>
            <div className="p-3 bg-red-100 text-red-700 rounded-full">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M3.5 20h17a2 2 0 0 0 1.7-2.9l-8.5-13.8a2 2 0 0 0-3.4 0l-8.5 13.8a2 2 0 0 0 1.7 2.9z"/></svg>
            </div>
          </div>

          <div className="p-6 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Value</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-1">TND {totalValue.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-green-100 text-green-700 rounded-full">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
               <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-slate-200 w-full md:w-auto">
             <SearchInput
               placeholder="Search inventory..."
               value={search}
               onChange={setSearch}
             />
           </div>
           
           <div className="flex gap-4">
              {/* View Toggle */}
              <div className="flex p-1 bg-slate-200 rounded-lg">
                <button
                  onClick={() => setView("inventory")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    view === "inventory"
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Inventory
                </button>
                <button
                  onClick={() => setView("history")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    view === "history"
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  History
                </button>
              </div>

              {view === "inventory" && (
                <select 
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm focus:ring-primary focus:border-primary"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                >
                    <option value="all">All Status</option>
                    <option value="in_stock">In Stock</option>
                    <option value="low_stock">Low Stock</option>
                    <option value="out_of_stock">Out of Stock</option>
                </select>
              )}
           </div>
        </div>

        {view === "inventory" ? (
          /* Table */
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-slate-500">Loading inventory...</span>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No ingredients found"
                description="Adjust filters or add a new ingredient."
                actionLabel="Add Ingredient"
                onAction={openAdd}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Ingredient</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Quantity</th>
                      <th className="px-6 py-4">Seuil</th>
                      <th className="px-6 py-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filtered.map((item) => {
                      const status = resolveStatus(item);

                      return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                             <div>
                               <p className="font-semibold text-slate-900">{item.name}</p>
                               <p className="text-xs text-slate-500">ID: {item.id.slice(0, 8)}</p>
                             </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                            {item.business_unit === 'restaurant' ? 'Kitchen' : 'Barista'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusPill status={mapStatus(status)} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                             <span className="font-medium text-slate-700">{formatQuantity(item.quantity, item.unit)} {item.unit}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-slate-700">
                            {formatQuantity(resolveSeuil(item), item.unit)} {item.unit}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => openRestock(item)} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Restock">
                              <Package className="h-4 w-4" />
                            </button>
                            <button onClick={() => openEdit(item)} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => openDelete(item)} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
           loading ? (
              <div className="flex items-center justify-center py-16 bg-white rounded-lg border border-slate-200">
                 <Loader2 className="h-6 w-6 animate-spin text-primary" />
                 <span className="ml-2 text-slate-500">Loading history...</span>
              </div>
           ) : (
             <StockHistory
               movements={movements}
               onUndo={handleUndo}
               undoing={undoing}
             />
           )
        )}
        </div>
      </div>

      {/* Add/Edit Modal — metadata only, no quantity field */}
      {(dialogMode === "add" || dialogMode === "edit") && (
        <Formik
          initialValues={initialValuesFromItem(editingItem ?? undefined)}
          validationSchema={IngredientSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, handleChange: formikChange, submitForm }) => (
            <Form>
              <JojoDialog
                open
                onOpenChange={closeDialog}
                title={dialogMode === "add" ? "Record New Ingredient" : "Edit Ingredient"}
                primaryLabel={saving ? "Saving..." : "Save Ingredient"}
                onPrimaryClick={submitForm}
                disabled={saving}
              >
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Ingredient Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={values.name}
                      onChange={formikChange}
                      className="mt-1"
                    />
                    {touched.name && errors.name && (
                      <p className="text-xs text-red-600 mt-1">{errors.name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="unit">Unit (e.g. kg, L, pcs)</Label>
                      <Input
                        id="unit"
                        name="unit"
                        value={values.unit}
                        onChange={formikChange}
                        className="mt-1"
                      />
                      {touched.unit && errors.unit && (
                        <p className="text-xs text-red-600 mt-1">{errors.unit}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="min_quantity">Seuil</Label>
                      <Input
                        id="min_quantity"
                        name="min_quantity"
                        type="number"
                        value={values.min_quantity}
                        onChange={formikChange}
                        className="mt-1"
                      />
                      {touched.min_quantity && errors.min_quantity && (
                        <p className="text-xs text-red-600 mt-1">{errors.min_quantity}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="supplier_phone">Supplier Phone</Label>
                    <Input
                      id="supplier_phone"
                      name="supplier_phone"
                      value={values.supplier_phone}
                      onChange={formikChange}
                      className="mt-1"
                    />
                    {touched.supplier_phone && errors.supplier_phone && (
                      <p className="text-xs text-red-600 mt-1">{errors.supplier_phone}</p>
                    )}
                  </div>
                </div>
              </JojoDialog>
            </Form>
          )}
        </Formik>
      )}

      {/* Delete Confirmation */}
      {dialogMode === "delete" && editingItem && (
        <JojoDialog
          open
          onOpenChange={closeDialog}
          title="Delete Item"
          primaryLabel={saving ? "Deleting..." : "Delete"}
          onPrimaryClick={handleDelete}
          variant="destructive"
          disabled={saving}
        >
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <strong>{editingItem.name}</strong>?
          </p>
        </JojoDialog>
      )}

      {/* Restock Dialog */}
      {dialogMode === "restock" && editingItem && (
        <JojoDialog
          open
          onOpenChange={closeDialog}
          title={`Restock: ${editingItem.name}`}
          primaryLabel={saving ? "Adding..." : "Add to Stock"}
          onPrimaryClick={handleRestock}
          disabled={saving || restockQty <= 0}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-slate-700">Current Stock</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatQuantity(editingItem.quantity, editingItem.unit)} {editingItem.unit}
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="restock_qty">How much arrived? ({editingItem.unit})</Label>
              <Input
                id="restock_qty"
                type="number"
                min={0}
                step="any"
                value={restockQty || ""}
                onChange={(e) => setRestockQty(Number(e.target.value))}
                className="mt-1 text-lg"
                placeholder={`Enter quantity in ${editingItem.unit}`}
                autoFocus
              />
            </div>
            {restockQty > 0 && (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600 font-bold text-lg">→</span>
                <div>
                  <p className="text-sm font-medium text-green-700">New Stock Level</p>
                  <p className="text-lg font-bold text-green-800">
                    {formatQuantity(Number(editingItem.quantity) + restockQty, editingItem.unit)} {editingItem.unit}
                  </p>
                </div>
              </div>
            )}
            
            <div className="pt-4 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                Attach Invoice (Optional)
              </h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="supplier_name" className="text-xs">Supplier Name</Label>
                    <Input
                      id="supplier_name"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="e.g. Metro"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="invoice_num" className="text-xs">Invoice #</Label>
                    <Input
                      id="invoice_num"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="e.g. INV-001"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="inv_amount" className="text-xs">Amount (TND)</Label>
                    <Input
                      id="inv_amount"
                      type="number"
                      min="0"
                      step="0.001"
                      value={invoiceAmount || ""}
                      onChange={(e) => setInvoiceAmount(Number(e.target.value))}
                      placeholder="0.000"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="inv_file" className="text-xs">Upload File</Label>
                    <div className="mt-1 flex items-center gap-2">
                       <Input
                          id="inv_file"
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                          className="h-8 text-xs file:mr-2 file:py-0 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                        />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>

        </JojoDialog>
      )}
    </AppLayout>
  );
}
