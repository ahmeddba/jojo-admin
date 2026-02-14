"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { JojoDialog } from "@/components/modals/JojoDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase";
import {
  deleteMenuItemRecipeIngredient,
  fetchMenuItemRecipe,
  fetchRecipeIngredients,
  upsertMenuItemRecipeIngredient,
} from "@/lib/queries/menu";
import type {
  BusinessUnit,
  Ingredient,
  MenuItem,
  MenuItemIngredient,
} from "@/lib/database.types";

type MenuRecipeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessUnit: BusinessUnit;
  menuItem: MenuItem | null;
};

type RecipeFormValues = {
  ingredient_id: string;
  qty_used: number;
};

const RecipeSchema = Yup.object({
  ingredient_id: Yup.string().required("Ingredient is required"),
  qty_used: Yup.number().moreThan(0, "Quantity must be greater than 0").required("Quantity is required"),
});

function getIngredientName(ingredientId: string, rowIngredient: Ingredient | undefined, all: Ingredient[]): string {
  if (rowIngredient?.name) {
    return rowIngredient.name;
  }

  const found = all.find((item) => item.id === ingredientId);
  return found?.name ?? "Unknown ingredient";
}

function normalizeIngredient(rowIngredient: Ingredient | Ingredient[] | undefined): Ingredient | undefined {
  if (!rowIngredient) {
    return undefined;
  }
  if (Array.isArray(rowIngredient)) {
    return rowIngredient[0];
  }
  return rowIngredient;
}

export function MenuRecipeDialog({ open, onOpenChange, businessUnit, menuItem }: MenuRecipeDialogProps) {
  const supabase = createClient();
  const menuItemId = menuItem?.id ?? null;

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipeRows, setRecipeRows] = useState<MenuItemIngredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<MenuItemIngredient | null>(null);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRecipeData = useCallback(async () => {
    if (!open || !menuItemId) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [ingredientRows, recipe] = await Promise.all([
        fetchRecipeIngredients(supabase, businessUnit),
        fetchMenuItemRecipe(supabase, menuItemId),
      ]);
      setIngredients(ingredientRows);
      setRecipeRows(recipe);
    } catch (error) {
      console.error("Failed to load recipe data:", error);
      setErrorMessage("Failed to load recipe data.");
    } finally {
      setLoading(false);
    }
  }, [businessUnit, menuItemId, open, supabase]);

  useEffect(() => {
    loadRecipeData();
  }, [loadRecipeData]);

  useEffect(() => {
    if (!open) {
      setEditingRow(null);
      setIngredientSearch("");
      setErrorMessage(null);
    }
  }, [open]);

  const filteredIngredients = useMemo(() => {
    const term = ingredientSearch.trim().toLowerCase();

    if (!term) {
      return ingredients;
    }

    return ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(term));
  }, [ingredients, ingredientSearch]);

  const initialValues = useMemo<RecipeFormValues>(() => {
    return {
      ingredient_id: editingRow?.ingredient_id ?? "",
      qty_used: editingRow?.qty_used ?? 0,
    };
  }, [editingRow]);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setEditingRow(null);
        setIngredientSearch("");
        setErrorMessage(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  return (
    <Formik<RecipeFormValues>
      initialValues={initialValues}
      enableReinitialize
      validationSchema={RecipeSchema}
      onSubmit={async (values, helpers) => {
        if (!menuItemId) {
          return;
        }

        const duplicate = recipeRows.some(
          (row) => row.ingredient_id === values.ingredient_id && row.id !== editingRow?.id
        );

        if (duplicate) {
          helpers.setFieldError("ingredient_id", "This ingredient is already in the recipe.");
          return;
        }

        setSaving(true);
        setErrorMessage(null);

        try {
          if (editingRow && editingRow.ingredient_id !== values.ingredient_id) {
            await deleteMenuItemRecipeIngredient(supabase, editingRow.id);
          }

          await upsertMenuItemRecipeIngredient(supabase, {
            menu_item_id: menuItemId,
            ingredient_id: values.ingredient_id,
            qty_used: values.qty_used,
          });

          const nextRows = await fetchMenuItemRecipe(supabase, menuItemId);
          setRecipeRows(nextRows);
          setEditingRow(null);
          helpers.resetForm({
            values: {
              ingredient_id: "",
              qty_used: 0,
            },
          });
        } catch (error) {
          console.error("Failed to save recipe row:", error);
          setErrorMessage("Failed to save recipe row.");
        } finally {
          setSaving(false);
        }
      }}
    >
      {({ values, errors, touched, handleChange, setValues }) => (
        <Form>
          <JojoDialog
            open={open}
            onOpenChange={handleClose}
            title={menuItem ? `Edit Recipe · ${menuItem.name}` : "Edit Recipe"}
            description="Map ingredients and consumed quantities for this menu item."
            primaryLabel={saving ? "Saving..." : editingRow ? "Update Ingredient" : "Add Ingredient"}
            disabled={saving || loading || !menuItemId}
          >
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="ml-2 text-sm text-slate-500">Loading recipe...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ingredient-search">Search Ingredient</Label>
                  <Input
                    id="ingredient-search"
                    value={ingredientSearch}
                    onChange={(event) => setIngredientSearch(event.target.value)}
                    placeholder="Type ingredient name..."
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="ingredient_id">Ingredient</Label>
                  <select
                    id="ingredient_id"
                    name="ingredient_id"
                    value={values.ingredient_id}
                    onChange={handleChange}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select ingredient</option>
                    {filteredIngredients.map((ingredient) => (
                      <option key={ingredient.id} value={ingredient.id}>
                        {ingredient.name} ({ingredient.unit})
                      </option>
                    ))}
                  </select>
                  {touched.ingredient_id && errors.ingredient_id ? (
                    <p className="mt-1 text-xs text-red-600">{errors.ingredient_id}</p>
                  ) : null}
                </div>

                <div>
                  <Label htmlFor="qty_used">Qty Used</Label>
                  <Input
                    id="qty_used"
                    name="qty_used"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={values.qty_used}
                    onChange={handleChange}
                    className="mt-1"
                  />
                  {touched.qty_used && errors.qty_used ? (
                    <p className="mt-1 text-xs text-red-600">{errors.qty_used}</p>
                  ) : null}
                </div>

                {editingRow ? (
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingRow(null);
                        setValues({ ingredient_id: "", qty_used: 0 });
                      }}
                    >
                      Cancel Edit
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Current Recipe</p>

                  {recipeRows.length === 0 ? (
                    <p className="text-sm text-slate-500">No recipe set</p>
                  ) : (
                    <div className="space-y-2">
                      {recipeRows.map((row) => {
                        const rowIngredient = normalizeIngredient(row.ingredients);
                        const ingredientName = getIngredientName(row.ingredient_id, rowIngredient, ingredients);
                        const unit = rowIngredient?.unit ?? ingredients.find((i) => i.id === row.ingredient_id)?.unit ?? "unit";

                        return (
                          <div
                            key={row.id}
                            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{ingredientName}</p>
                              <p className="text-xs text-slate-500">
                                {Number(row.qty_used).toFixed(4)} {unit}
                              </p>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingRow(row);
                                  setValues({
                                    ingredient_id: row.ingredient_id,
                                    qty_used: Number(row.qty_used),
                                  });
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (!menuItemId) {
                                    return;
                                  }
                                  setSaving(true);
                                  setErrorMessage(null);
                                  try {
                                    await deleteMenuItemRecipeIngredient(supabase, row.id);
                                    const nextRows = await fetchMenuItemRecipe(supabase, menuItemId);
                                    setRecipeRows(nextRows);
                                    if (editingRow?.id === row.id) {
                                      setEditingRow(null);
                                      setValues({ ingredient_id: "", qty_used: 0 });
                                    }
                                  } catch (error) {
                                    console.error("Failed to delete recipe row:", error);
                                    setErrorMessage("Failed to delete recipe row.");
                                  } finally {
                                    setSaving(false);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
              </div>
            )}
          </JojoDialog>
        </Form>
      )}
    </Formik>
  );
}
