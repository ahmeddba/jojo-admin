"use client";

import { useToast } from "@/components/ui/toast";

import AppLayout from "@/components/layout/AppLayout";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { JojoDialog } from "@/components/modals/JojoDialog";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SearchInput } from "@/components/common/SearchInput";
import { Pencil, Trash2, Plus, Loader2, Upload, X, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  fetchDeals,
  createDeal,
  updateDeal,
  deleteDeal,
  uploadDealImage,
} from "@/services/deals/dealsService";
import { fetchAllMenuItems } from "@/services/menu/menuService";
import type { Deal, MenuItem } from "@/lib/database.types";

const DealSchema = Yup.object({
  name: Yup.string().trim().required("Deal name is required"),
  description: Yup.string().trim().required("Description is required"),
  price: Yup.number()
    .typeError("Price must be a number")
    .min(1, "Price must be at least 1")
    .required("Price is required"),
  active: Yup.boolean().required(),
});

type FormValues = {
  name: string;
  description: string;
  price: number;
  active: boolean;
};

export default function BestDealsPage() {
  const [search, setSearch] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [itemFocused, setItemFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [viewingDeal, setViewingDeal] = useState<Deal | null>(null);
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | "delete" | "view" | null>(null);

  const supabase = createClient();
  const toast = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, m] = await Promise.all([
        fetchDeals(supabase),
        fetchAllMenuItems(supabase),
      ]);
      setDeals(d);
      setMenuItems(m);
    } catch (err) {
      console.error("Deals fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(
    () =>
      deals.filter((d) => {
        if (!search.trim()) return true;
        return (
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.description.toLowerCase().includes(search.toLowerCase())
        );
      }),
    [deals, search]
  );

  const filteredMenuItems = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return menuItems.filter((mi) => !selectedItems.includes(mi.id));
    return menuItems.filter(
      (mi) =>
        mi.name.toLowerCase().includes(term) &&
        !selectedItems.includes(mi.id)
    );
  }, [menuItems, itemSearch, selectedItems]);

  const openAdd = () => {
    setEditingDeal(null);
    setImageFile(null);
    setSelectedItems([]);
    setItemSearch("");
    setDialogMode("add");
  };
  const openView = (deal: Deal) => {
    setViewingDeal(deal);
    setDialogMode("view");
  };
  const openEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setImageFile(null);
    setSelectedItems(deal.deal_items?.map((di) => di.menu_item_id) ?? []);
    setItemSearch("");
    setDialogMode("edit");
  };
  const openDelete = (deal: Deal) => {
    setEditingDeal(deal);
    setDialogMode("delete");
  };
  const closeDialog = () => {
    setDialogMode(null);
    setViewingDeal(null);
    setImageFile(null);
    setSelectedItems([]);
    setItemSearch("");
  };

  const removeSelectedItem = (id: string) => {
    setSelectedItems((prev) => prev.filter((i) => i !== id));
  };

  const handleSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      let image_url: string | undefined;
      if (imageFile) {
        image_url = await uploadDealImage(supabase, imageFile);
      }

      if (selectedItems.length === 0) {
        toast.error("Please select at least one menu item.");
        setSaving(false);
        return;
      }

      if (dialogMode === "add") {
        const selectedMenuObjects = selectedItems.map((id) => {
          const mi = menuItems.find((m) => m.id === id);
          return {
            id,
            business_unit: mi?.business_unit ?? "restaurant",
          };
        });

        const newDeal = await createDeal(
          supabase,
          { ...values, image_url: image_url ?? null },
          selectedMenuObjects
        );
        setDeals((prev) => [...prev, newDeal]);
      } else if (dialogMode === "edit" && editingDeal) {
        const updates: Record<string, unknown> = { ...values };
        if (image_url) updates.image_url = image_url;
        
        const selectedMenuObjects = selectedItems.map((id) => {
          const mi = menuItems.find((m) => m.id === id);
          return {
            id,
            business_unit: mi?.business_unit ?? "restaurant",
          };
        });

        const updated = await updateDeal(
          supabase,
          editingDeal.id,
          updates,
          selectedMenuObjects
        );
        setDeals((prev) =>
          prev.map((d) => (d.id === editingDeal.id ? updated : d))
        );
      }
      closeDialog();
      toast.success(dialogMode === "add" ? `"${values.name}" added` : `"${values.name}" updated`);
    } catch (err) {
      console.error("Save error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingDeal) return;
    setSaving(true);
    try {
      await deleteDeal(supabase, editingDeal.id);
      setDeals((prev) => prev.filter((d) => d.id !== editingDeal.id));
      closeDialog();
      toast.success(`"${editingDeal.name}" deleted`);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="font-display text-4xl font-bold text-slate-900">Promotions</h1>
          <Button className="bg-primary hover:bg-primary-dark text-white shadow-lg transition-transform hover:scale-105" onClick={openAdd}>
            <Plus className="h-5 w-5 mr-2" />
            Add Deal
          </Button>
        </div>

        {/* Search */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <SearchInput placeholder="Search deals..." value={search} onChange={setSearch} />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-slate-500">Loading deals...</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No deals found"
            description="Create your first deal to start promoting combos."
            actionLabel="Create Best Deal"
            onAction={openAdd}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((deal) => (
              <div
                key={deal.id}
                className="group relative bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="relative h-48 overflow-hidden bg-slate-100">
                  {deal.image_url ? (
                    <img
                      src={deal.image_url}
                      alt={deal.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-antique-gold/20">
                      <span className="text-4xl">🏷️</span>
                    </div>
                  )}

                  {/* Hover overlay with actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-20">
                    <button
                      onClick={() => openView(deal)}
                      className="p-3 bg-white text-slate-800 rounded-full hover:bg-blue-600 hover:text-white transition-colors shadow-lg"
                      title="View Details"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => openEdit(deal)}
                      className="p-3 bg-white text-slate-800 rounded-full hover:bg-primary hover:text-white transition-colors shadow-lg"
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => openDelete(deal)}
                      className="p-3 bg-white text-slate-800 rounded-full hover:bg-red-600 hover:text-white transition-colors shadow-lg"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Status Badge */}
                  <span className={`absolute top-2 left-2 z-10 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-md ${
                    deal.active
                      ? "bg-green-600 text-white"
                      : "bg-red-600 text-white"
                  }`}>
                    {deal.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-display font-bold text-lg text-slate-900 leading-tight pr-2">{deal.name}</h3>
                    <span className="font-display text-lg font-bold text-primary whitespace-nowrap">
                      TND {Number(deal.price).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-3">{deal.description}</p>
                  <p className="text-xs text-slate-400">
                    {deal.deal_items?.length ?? 0} item{(deal.deal_items?.length ?? 0) !== 1 ? "s" : ""} included
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(dialogMode === "add" || dialogMode === "edit") && (
        <Formik
          initialValues={{
            name: editingDeal?.name ?? "",
            description: editingDeal?.description ?? "",
            price: editingDeal?.price ?? 1,
            active: editingDeal?.active ?? true,
          }}
          validationSchema={DealSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, handleChange: fc, setFieldValue, submitForm }) => (
            <Form>
              <JojoDialog
                open
                onOpenChange={closeDialog}
                title={dialogMode === "add" ? "Add Deal" : "Edit Deal"}
                primaryLabel={saving ? "Saving..." : "Save"}
                onPrimaryClick={submitForm}
                disabled={saving}
              >
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Deal Name</Label>
                    <Input id="name" name="name" value={values.name} onChange={fc} className="mt-1" />
                    {touched.name && errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <textarea
                      id="description"
                      name="description"
                      value={values.description}
                      onChange={fc}
                      rows={3}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {touched.description && errors.description && (
                      <p className="text-xs text-red-600 mt-1">{errors.description}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price">Deal Price (TND)</Label>
                      <Input id="price" name="price" type="number" value={values.price} onChange={fc} className="mt-1" />
                      {touched.price && errors.price && (
                        <p className="text-xs text-red-600 mt-1">{errors.price}</p>
                      )}
                    </div>
                    <div>
                      <Label>Image</Label>
                      <div className="mt-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-4 w-4 mr-2" />
                          {imageFile ? imageFile.name : "Choose Image"}
                        </Button>
                        {editingDeal?.image_url && !imageFile && (
                          <span className="text-xs text-slate-500 truncate max-w-[200px] ml-2">Current image set</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu Items — Autocomplete Search */}
                  <div>
                    <Label>Included Menu Items <span className="text-red-500">*</span></Label>

                    {/* Selected items as pills */}
                    {selectedItems.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedItems.map((id) => {
                          const mi = menuItems.find((m) => m.id === id);
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-jojo-green/30 bg-jojo-green/5 px-3 py-1 text-sm font-medium text-jojo-text"
                            >
                              {mi?.name ?? "Unknown"}
                              <span className="text-xs text-slate-400">
                                TND {mi ? Number(mi.price).toFixed(2) : "0.00"}
                              </span>
                              <button
                                type="button"
                                className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                onClick={() => removeSelectedItem(id)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Search input */}
                    <div className="relative mt-2">
                      <Input
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        onFocus={() => setItemFocused(true)}
                        onBlur={() => setTimeout(() => setItemFocused(false), 150)}
                        placeholder="Type to search menu items..."
                        autoComplete="off"
                      />
                      {itemFocused && filteredMenuItems.length > 0 && (
                        <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                          {filteredMenuItems.map((mi) => (
                            <button
                              key={mi.id}
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-jojo-surface-light transition-colors"
                              onMouseDown={(e) => {
                                e.preventDefault(); // Prevent input blur
                                setSelectedItems((prev) => [...prev, mi.id]);
                                setItemSearch("");
                                setItemFocused(false);
                              }}
                            >
                              <span className="font-medium text-slate-800">{mi.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded capitalize">
                                  {mi.menu_categories?.name ?? (mi.business_unit === "restaurant" ? "Restaurant" : "Coffee")}
                                </span>
                                <span className="text-xs text-slate-400">TND {Number(mi.price).toFixed(2)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {itemFocused && itemSearch.trim().length > 0 && filteredMenuItems.length === 0 && (
                        <p className="mt-1 text-xs text-slate-400">No matching menu items</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} selected</p>
                  </div>

                  {/* Active toggle — consistent with menu page */}
                  <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 mt-1 transition-colors ${
                    values.active
                      ? "border-green-200 bg-green-50"
                      : "border-red-200 bg-red-50"
                  }`}>
                    <Switch
                      checked={values.active}
                      onCheckedChange={(v) => setFieldValue("active", v)}
                    />
                    <div className="flex flex-col">
                      <Label className="font-medium">{values.active ? "Deal is active" : "Deal is inactive"}</Label>
                      <span className={`text-xs ${values.active ? "text-green-600" : "text-red-500"}`}>
                        {values.active ? "Visible to customers" : "Hidden from promotions"}
                      </span>
                    </div>
                  </div>
                </div>
              </JojoDialog>
            </Form>
          )}
        </Formik>
      )}

      {dialogMode === "delete" && editingDeal && (
        <JojoDialog
          open
          onOpenChange={closeDialog}
          title="Delete Deal"
          primaryLabel={saving ? "Deleting..." : "Delete"}
          onPrimaryClick={handleDelete}
          variant="destructive"
          disabled={saving}
        >
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <strong>{editingDeal.name}</strong>? This action cannot be undone.
          </p>
        </JojoDialog>
      )}

      {dialogMode === "view" && viewingDeal && (
        <JojoDialog
          open
          onOpenChange={closeDialog}
          title="Deal Details"
          primaryLabel="Close"
          onPrimaryClick={closeDialog}
          disabled={false}
          showSecondary={false}
        >
          <div className="space-y-6">
            {/* Header / Image */}
            <div className="flex flex-col md:flex-row gap-6">
              {viewingDeal.image_url && (
                <div className="w-full md:w-1/3 aspect-video md:aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                  <img src={viewingDeal.image_url} alt={viewingDeal.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 space-y-4">
                 <div>
                   <h3 className="text-2xl font-display font-bold text-slate-900">{viewingDeal.name}</h3>
                   <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${
                     viewingDeal.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                   }`}>
                     {viewingDeal.active ? "Active" : "Inactive"}
                   </span>
                 </div>
                 
                 <div>
                   <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Price</h4>
                   <p className="text-3xl font-bold text-primary">TND {Number(viewingDeal.price).toFixed(2)}</p>
                 </div>

                 <div>
                   <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</h4>
                   <p className="text-slate-700 leading-relaxed">{viewingDeal.description}</p>
                 </div>
              </div>
            </div>

            {/* Included Items List */}
            <div>
              <h4 className="font-display text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
                Included Items ({viewingDeal.deal_items?.length ?? 0})
              </h4>
              <div className="grid grid-cols-1 gap-3">
                {viewingDeal.deal_items?.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {item.menu_items?.image_url ? (
                        <div className="h-12 w-12 rounded-lg overflow-hidden border border-slate-200 shadow-sm flex-shrink-0">
                          <img
                            src={item.menu_items.image_url}
                            alt={item.menu_items.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center border border-slate-200 text-lg shadow-sm flex-shrink-0">
                          {item.menu_items?.business_unit === 'coffee' ? '☕' : '🍽️'}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-800">{item.menu_items?.name ?? "Unknown Item"}</p>
                        <p className="text-xs text-slate-500 capitalize">{item.menu_items?.business_unit ?? "Unknown Category"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="font-medium text-slate-600">
                         {item.menu_items?.price ? `TND ${Number(item.menu_items.price).toFixed(2)}` : "-"}
                       </p>
                    </div>
                  </div>
                ))}
                {(!viewingDeal.deal_items || viewingDeal.deal_items.length === 0) && (
                  <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No items linked to this deal.
                  </div>
                )}
              </div>
            </div>
          </div>
        </JojoDialog>
      )}
    </AppLayout>
  );
}
