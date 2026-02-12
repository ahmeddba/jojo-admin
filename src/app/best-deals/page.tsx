"use client";

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
import { SegmentedToggle } from "@/components/common/SegmentedToggle";
import { Pencil, Trash2, Plus, Loader2, Upload, Check } from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  fetchDeals,
  createDeal,
  updateDeal,
  deleteDeal,
  uploadDealImage,
} from "@/lib/queries/deals";
import { fetchMenuItems } from "@/lib/queries/menu";
import type { Deal, MenuItem, BusinessUnit } from "@/lib/database.types";

const DealSchema = Yup.object({
  name: Yup.string().required("Required"),
  description: Yup.string().required("Required"),
  price: Yup.number().min(0).required("Required"),
  active: Yup.boolean().required(),
});

type FormValues = {
  name: string;
  description: string;
  price: number;
  active: boolean;
};

export default function BestDealsPage() {
  const [mode, setMode] = useState<BusinessUnit>("restaurant");
  const [search, setSearch] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | "delete" | null>(null);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, m] = await Promise.all([
        fetchDeals(supabase, mode),
        fetchMenuItems(supabase, mode),
      ]);
      setDeals(d);
      setMenuItems(m);
    } catch (err) {
      console.error("Deals fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, mode]);

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

  const openAdd = () => {
    setEditingDeal(null);
    setImageFile(null);
    setSelectedItems([]);
    setDialogMode("add");
  };
  const openEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setImageFile(null);
    setSelectedItems(deal.deal_items?.map((di) => di.menu_item_id) ?? []);
    setDialogMode("edit");
  };
  const openDelete = (deal: Deal) => {
    setEditingDeal(deal);
    setDialogMode("delete");
  };
  const closeDialog = () => {
    setDialogMode(null);
    setImageFile(null);
    setSelectedItems([]);
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      let image_url: string | undefined;
      if (imageFile) {
        image_url = await uploadDealImage(supabase, imageFile, mode);
      }

      if (dialogMode === "add") {
        const newDeal = await createDeal(
          supabase,
          { ...values, image_url: image_url ?? null, business_unit: mode },
          selectedItems
        );
        setDeals((prev) => [...prev, newDeal]);
      } else if (dialogMode === "edit" && editingDeal) {
        const updates: Record<string, unknown> = { ...values };
        if (image_url) updates.image_url = image_url;
        const updated = await updateDeal(
          supabase,
          editingDeal.id,
          updates,
          selectedItems,
          mode
        );
        setDeals((prev) =>
          prev.map((d) => (d.id === editingDeal.id ? updated : d))
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
    if (!editingDeal) return;
    setSaving(true);
    try {
      await deleteDeal(supabase, editingDeal.id);
      setDeals((prev) => prev.filter((d) => d.id !== editingDeal.id));
      closeDialog();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-display text-4xl font-bold text-slate-900 dark:text-white">Best Deals & Promos</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your deals and combo offers.</p>
          </div>
          <Button className="bg-primary hover:bg-primary-dark text-white shadow-lg transition-transform hover:scale-105" onClick={openAdd}>
            <Plus className="h-5 w-5 mr-2" />
            Create Best Deal
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

        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <SearchInput placeholder="Search deals..." value={search} onChange={setSearch} />
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>
              Filters
            </button>
          </div>
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
                className="group relative bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="relative h-48 overflow-hidden bg-slate-100 dark:bg-slate-900">
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

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
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
                  <div className="absolute top-3 left-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${deal.active ? 'bg-green-500/90 text-white' : 'bg-slate-500/90 text-white'}`}>
                      {deal.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white leading-tight pr-2">{deal.name}</h3>
                    <span className="font-display text-lg font-bold text-primary dark:text-antique-gold whitespace-nowrap">
                      TND {Number(deal.price).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{deal.description}</p>
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
            price: editingDeal?.price ?? 0,
            active: editingDeal?.active ?? true,
          }}
          validationSchema={DealSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, handleChange: fc, setFieldValue }) => (
            <Form>
              <JojoDialog
                open
                onOpenChange={closeDialog}
                title={dialogMode === "add" ? "Create Best Deal" : "Edit Deal"}
                primaryLabel={saving ? "Saving..." : "Save"}
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price">Deal Price</Label>
                      <Input id="price" name="price" type="number" value={values.price} onChange={fc} className="mt-1" />
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
                      </div>
                    </div>
                  </div>

                  {/* Menu Items Selection */}
                  <div>
                    <Label>Included Menu Items</Label>
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-1 rounded-md border border-input p-2">
                      {menuItems.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-2">No menu items available</p>
                      ) : (
                        menuItems.map((mi) => (
                          <button
                            key={mi.id}
                            type="button"
                            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                              selectedItems.includes(mi.id)
                                ? "bg-primary/10 text-primary font-medium"
                                : "hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                            }`}
                            onClick={() => toggleItemSelection(mi.id)}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              selectedItems.includes(mi.id)
                                ? "bg-primary border-primary text-white"
                                : "border-slate-300"
                            }`}>
                              {selectedItems.includes(mi.id) && <Check className="h-3 w-3" />}
                            </div>
                            <span>{mi.name}</span>
                            <span className="ml-auto text-xs text-slate-400">TND {Number(mi.price).toFixed(2)}</span>
                          </button>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{selectedItems.length} items selected</p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Switch
                      checked={values.active}
                      onCheckedChange={(v) => setFieldValue("active", v)}
                    />
                    <Label>Deal is active</Label>
                  </div>
                </div>
              </JojoDialog>
            </Form>
          )}
        </Formik>
      )}

      {dialogMode === "delete" && editingDeal && (
        <JojoDialog open onOpenChange={closeDialog} title="Delete Deal" primaryLabel="Delete">
          <p className="text-sm text-slate-600 mb-4">
            Are you sure you want to delete <strong>{editingDeal.name}</strong>?
          </p>
          <Button className="bg-red-600 hover:bg-red-700 text-white w-full" onClick={handleDelete} disabled={saving}>
            {saving ? "Deleting..." : "Confirm Delete"}
          </Button>
        </JojoDialog>
      )}
    </AppLayout>
  );
}
