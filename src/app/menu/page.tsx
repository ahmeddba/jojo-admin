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
import { BookOpen, Pencil, Trash2, Plus, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { MenuRecipeDialog } from "@/components/menu/MenuRecipeDialog";
import {
  fetchMenuItems,
  fetchMenuCategories,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuImage,
} from "@/services/menu/menuService";
import type { MenuItem, MenuCategory, BusinessUnit } from "@/lib/database.types";

const MenuSchema = Yup.object({
  name: Yup.string().trim().required("Item name is required"),
  description: Yup.string().trim().required("Description is required"),
  price: Yup.number()
    .typeError("Price must be a number")
    .min(1, "Price must be at least 1")
    .required("Price is required"),
  category_id: Yup.string().required("Category is required"),
  available: Yup.boolean().required(),
});

type FormValues = {
  name: string;
  description: string;
  price: number;
  category_id: string;
  available: boolean;
};

export default function MenuPage() {
  const [mode, setMode] = useState<BusinessUnit>("restaurant");
  const [catFilter, setCatFilter] = useState("All Items");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | "delete" | null>(null);

  const supabase = createClient();
  const toast = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [menuItems, menuCats] = await Promise.all([
        fetchMenuItems(supabase, mode),
        fetchMenuCategories(supabase, mode),
      ]);
      setItems(menuItems);
      setCategories(menuCats);
    } catch (err) {
      console.error("Menu fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, mode]);

  useEffect(() => {
    loadData();
    setCatFilter("All Items");
  }, [loadData]);

  const categoryNames = ["All Items", ...categories.map((c) => c.name)];

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (catFilter !== "All Items") {
          const catName = i.menu_categories?.name;
          if (catName !== catFilter) return false;
        }
        if (search.trim() && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [items, catFilter, search]
  );

  const openAdd = () => {
    setEditingItem(null);
    setImageFile(null);
    setDialogMode("add");
  };
  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setImageFile(null);
    setDialogMode("edit");
  };
  const openDelete = (item: MenuItem) => {
    setEditingItem(item);
    setDialogMode("delete");
  };
  const closeDialog = () => {
    setDialogMode(null);
    setImageFile(null);
  };

  const openRecipeEditor = (item: MenuItem) => {
    setRecipeItem(item);
  };

  const handleSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      let image_url: string | undefined;
      if (imageFile) {
        image_url = await uploadMenuImage(supabase, imageFile, mode);
      }

      if (dialogMode === "add") {
        const newItem = await createMenuItem(supabase, {
          ...values,
          image_url: image_url ?? null,
          business_unit: mode,
        });
        setItems((prev) => [...prev, newItem]);
      } else if (dialogMode === "edit" && editingItem) {
        const updates: Record<string, unknown> = { ...values };
        if (image_url) updates.image_url = image_url;
        const updated = await updateMenuItem(supabase, editingItem.id, updates);
        setItems((prev) =>
          prev.map((i) => (i.id === editingItem.id ? updated : i))
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
    if (!editingItem) return;
    setSaving(true);
    try {
      await deleteMenuItem(supabase, editingItem.id);
      setItems((prev) => prev.filter((i) => i.id !== editingItem.id));
      closeDialog();
      toast.success(`"${editingItem.name}" deleted`);
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
          <h1 className="font-display text-4xl font-bold text-slate-900">Menu Management</h1>
          <Button className="bg-primary hover:bg-primary-dark text-white shadow-lg transition-transform hover:scale-105" onClick={openAdd}>
            <Plus className="h-5 w-5 mr-2" />
            Add Menu Item
          </Button>
        </div>

        {/* Business Unit Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex p-1 bg-slate-200 rounded-lg">
            <button
              onClick={() => {
                setMode("restaurant");
                setCatFilter("All Items");
              }}
              className={`px-6 py-2 rounded-md font-semibold transition-all ${
                mode === "restaurant"
                  ? "bg-white text-primary shadow"
                  : "text-slate-600"
              }`}
            >
              Restaurant
            </button>
            <button
              onClick={() => {
                setMode("coffee");
                setCatFilter("All Items");
              }}
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

        {/* Categories & Search */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex gap-2 flex-wrap justify-center md:justify-start">
            {categoryNames.map((cat) => (
              <button
                key={cat}
                className={
                  "px-4 py-2 text-sm font-semibold rounded-full border transition-all " +
                  (catFilter === cat
                    ? "bg-primary text-white border-primary shadow-md"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                }
                onClick={() => setCatFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-slate-200 w-full md:w-auto">
            <SearchInput placeholder="Search menu items..." value={search} onChange={setSearch} />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-slate-500">Loading menu items...</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No menu items found"
            description="Try changing your filters or add a new menu item."
            actionLabel="Add Menu Item"
            onAction={openAdd}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="group relative bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="relative h-48 overflow-hidden bg-slate-100">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm text-slate-400">
                      No Image
                    </div>
                  )}

                  {/* Hover overlay with actions */}
                  {/* Hover overlay with actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-20">
                    <button
                      onClick={() => openEdit(item)}
                      className="p-3 bg-white text-slate-800 rounded-full hover:bg-primary hover:text-white transition-colors shadow-lg"
                      title="Edit"
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => openDelete(item)}
                      className="p-3 bg-white text-slate-800 rounded-full hover:bg-red-600 hover:text-white transition-colors shadow-lg"
                      title="Delete"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>

                  {!item.available && (
                    <span className="absolute top-2 left-2 z-10 px-2.5 py-1 text-[10px] font-bold bg-red-600 text-white rounded-full uppercase tracking-wider shadow-md">
                      Unavailable
                    </span>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-display font-bold text-lg text-slate-900 leading-tight pr-2">{item.name}</h3>
                    <span className="font-display text-lg font-bold text-primary whitespace-nowrap">
                      TND {Number(item.price).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-4 h-10">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between">
                     <span className="px-2.5 py-1 text-[10px] uppercase tracking-wide font-bold bg-slate-100 text-slate-600 rounded-full">
                      {item.menu_categories?.name ?? "Uncategorized"}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${item.available ? 'bg-green-500' : 'bg-red-500'}`} title={item.available ? "Available" : "Unavailable"}></span>
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openRecipeEditor(item)}
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      Edit Recipe
                    </Button>
                  </div>
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
            name: editingItem?.name ?? "",
            description: editingItem?.description ?? "",
            price: editingItem?.price ?? 1,
            category_id: editingItem?.category_id ?? categories[0]?.id ?? "",
            available: editingItem?.available ?? true,
          }}
          validationSchema={MenuSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, handleChange: fc, setFieldValue, submitForm }) => (
            <Form>
              <JojoDialog
                open
                onOpenChange={closeDialog}
                title={dialogMode === "add" ? "Add Menu Item" : "Edit Menu Item"}
                primaryLabel={saving ? "Saving..." : "Save"}
                onPrimaryClick={submitForm}
                disabled={saving}
              >
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
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
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {touched.description && errors.description && (
                      <p className="text-xs text-red-600 mt-1">{errors.description}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price">Price (TND)</Label>
                      <Input id="price" name="price" type="number" value={values.price} onChange={fc} className="mt-1" />
                      {touched.price && errors.price && (
                        <p className="text-xs text-red-600 mt-1">{errors.price}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="category_id">Category</Label>
                      <select
                        id="category_id"
                        name="category_id"
                        value={values.category_id}
                        onChange={fc}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {touched.category_id && errors.category_id && (
                        <p className="text-xs text-red-600 mt-1">{errors.category_id}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Image</Label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {imageFile ? imageFile.name : "Choose Image"}
                      </Button>
                      {editingItem?.image_url && !imageFile && (
                        <span className="text-xs text-slate-500 truncate max-w-[200px]">Current image set</span>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 mt-1 transition-colors ${
                    values.available
                      ? "border-green-200 bg-green-50"
                      : "border-red-200 bg-red-50"
                  }`}>
                    <Switch
                      checked={values.available}
                      onCheckedChange={(v) => setFieldValue("available", v)}
                    />
                    <div className="flex flex-col">
                      <Label className="font-medium">{values.available ? "Available for ordering" : "Not available"}</Label>
                      <span className={`text-xs ${values.available ? "text-green-600" : "text-red-500"}`}>
                        {values.available ? "Customers can order this item" : "Hidden from the menu"}
                      </span>
                    </div>
                  </div>
                </div>
              </JojoDialog>
            </Form>
          )}
        </Formik>
      )}

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
            Are you sure you want to delete <strong>{editingItem.name}</strong>? This action cannot be undone.
          </p>
        </JojoDialog>
      )}

      <MenuRecipeDialog
        open={Boolean(recipeItem)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRecipeItem(null);
          }
        }}
        businessUnit={mode}
        menuItem={recipeItem}
      />
    </AppLayout>
  );
}
