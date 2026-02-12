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
import { SegmentedToggle } from "@/components/common/SegmentedToggle";
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  fetchIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
} from "@/lib/queries/stock";
import type { IngredientWithStatus, BusinessUnit } from "@/lib/database.types";

const IngredientSchema = Yup.object({
  name: Yup.string().required("Required"),
  quantity: Yup.number().min(0).required("Required"),
  unit: Yup.string().required("Required"),
  price_per_unit: Yup.number().min(0).required("Required"),
  min_quantity: Yup.number().min(0).required("Required"),
  supplier_phone: Yup.string().required("Required"),
});

type IngredientFormValues = {
  name: string;
  quantity: number;
  unit: string;
  price_per_unit: number;
  min_quantity: number;
  supplier_phone: string;
};

export default function StockPage() {
  const [mode, setMode] = useState<BusinessUnit>("restaurant");
  const [filter, setFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<IngredientWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingItem, setEditingItem] = useState<IngredientWithStatus | null>(null);
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | "delete" | null>(null);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchIngredients(supabase, mode);
      setItems(data);
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
        if (filter !== "all" && i.computed_status !== filter) return false;
        if (!search.trim()) return true;
        return i.name.toLowerCase().includes(search.toLowerCase());
      }),
    [items, filter, search]
  );

  // Computed stats
  const totalItems = filtered.length;
  const lowStockCount = filtered.filter(i => i.computed_status === "low_stock" || i.computed_status === "out_of_stock").length;
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

  const initialValuesFromItem = (item?: IngredientWithStatus): IngredientFormValues => ({
    name: item?.name ?? "",
    quantity: item?.quantity ?? 0,
    unit: item?.unit ?? "",
    price_per_unit: item?.price_per_unit ?? 0,
    min_quantity: item?.min_quantity ?? 0,
    supplier_phone: item?.supplier_phone ?? "",
  });

  const handleSubmit = async (values: IngredientFormValues) => {
    setSaving(true);
    try {
      if (dialogMode === "add") {
        const newItem = await createIngredient(supabase, {
          ...values,
          business_unit: mode,
        });
        setItems((prev) => [...prev, newItem]);
      } else if (dialogMode === "edit" && editingItem) {
        const updated = await updateIngredient(supabase, editingItem.id, values);
        setItems((prev) =>
          prev.map((i) => (i.id === editingItem.id ? updated : i))
        );
      }
      closeDialog();
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save. Please try again.");
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
    } catch (err: any) {
      console.error("Delete error:", err);
      alert(err.message || "Failed to delete. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const mapStatus = (status: string): "in-stock" | "low-stock" | "out-of-stock" => {
    if (status === "in_stock") return "in-stock";
    if (status === "low_stock") return "low-stock";
    return "out-of-stock";
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="font-display text-4xl font-bold text-slate-900 dark:text-white">Inventory Control</h1>
          <Button className="bg-primary hover:bg-primary-dark text-white shadow-lg transition-transform hover:scale-105" onClick={openAdd}>
            <Plus className="h-5 w-5 mr-2" />
            Add Product
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

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Items</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{totalItems}</h3>
            </div>
            <div className="p-3 bg-blue-100 text-blue-700 rounded-full">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </div>
          </div>
          
          <div className="p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Low Stock</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{lowStockCount}</h3>
            </div>
            <div className="p-3 bg-red-100 text-red-700 rounded-full">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M3.5 20h17a2 2 0 0 0 1.7-2.9l-8.5-13.8a2 2 0 0 0-3.4 0l-8.5 13.8a2 2 0 0 0 1.7 2.9z"/></svg>
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Value</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">TND {totalValue.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-green-100 text-green-700 rounded-full">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 w-full md:w-auto">
             <SearchInput
               placeholder="Search inventory..."
               value={search}
               onChange={setSearch}
             />
           </div>
           
           <div className="flex gap-2">
              <select 
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 text-sm focus:ring-primary focus:border-primary"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                  <option value="all">All Status</option>
                  <option value="in_stock">In Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
              </select>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>
                More Filters
              </button>
           </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-slate-500">Loading inventory...</span>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No items found"
              description="Adjust filters or add a new item."
              actionLabel="Add Item"
              onAction={openAdd}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs font-bold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Quantity</th>
                    <th className="px-6 py-4">Price</th>
                    <th className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center text-xl">
                              🍎
                           </div>
                           <div>
                             <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                             <p className="text-xs text-slate-500">ID: {item.id.slice(0, 8)}</p>
                           </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {item.business_unit === 'restaurant' ? 'Kitchen' : 'Barista'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusPill status={mapStatus(item.computed_status)} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <span className="font-medium text-slate-700 dark:text-slate-200">{Number(item.quantity)} {item.unit}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-chart tabular-nums">
                        TND {Number(item.price_per_unit).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => openEdit(item)} className="p-2 text-slate-400 hover:text-primary transition-colors">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => openDelete(item)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
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

      {/* Add/Edit Modal */}
      {(dialogMode === "add" || dialogMode === "edit") && (
        <Formik
          initialValues={initialValuesFromItem(editingItem ?? undefined)}
          validationSchema={IngredientSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, handleChange: formikChange, isSubmitting }) => (
            <Form>
              <JojoDialog
                open
                onOpenChange={closeDialog}
                title={dialogMode === "add" ? "Record New Item" : "Edit Item"}
                primaryLabel={saving ? "Saving..." : "Save Item"}
              >
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Item Name</Label>
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
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        name="quantity"
                        type="number"
                        value={values.quantity}
                        onChange={formikChange}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="unit">Unit</Label>
                      <Input
                        id="unit"
                        name="unit"
                        value={values.unit}
                        onChange={formikChange}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price_per_unit">Price / Unit</Label>
                      <Input
                        id="price_per_unit"
                        name="price_per_unit"
                        type="number"
                        value={values.price_per_unit}
                        onChange={formikChange}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="min_quantity">Min Quantity</Label>
                      <Input
                        id="min_quantity"
                        name="min_quantity"
                        type="number"
                        value={values.min_quantity}
                        onChange={formikChange}
                        className="mt-1"
                      />
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
    </AppLayout>
  );
}
