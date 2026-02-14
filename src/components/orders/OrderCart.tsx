"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import type { FormikProps } from "formik";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CartItem } from "@/lib/database.types";

export type OrderMetaFormValues = {
  table_number: string;
  notes: string;
};

type OrderCartProps = {
  cartItems: CartItem[];
  totalTnd: number;
  submitting: boolean;
  onIncreaseQty: (item: CartItem) => void;
  onDecreaseQty: (item: CartItem) => void;
  onRemove: (item: CartItem) => void;
  formik: FormikProps<OrderMetaFormValues>;
};

function formatMoney(value: number): string {
  return `${value.toFixed(3)} TND`;
}

export function OrderCart({
  cartItems,
  totalTnd,
  submitting,
  onIncreaseQty,
  onDecreaseQty,
  onRemove,
  formik,
}: OrderCartProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">Current Order</h2>

      <div className="mt-4 space-y-3">
        {cartItems.length === 0 ? (
          <EmptyState title="Cart is empty" description="Add menu items or deals to start the order." />
        ) : (
          cartItems.map((item) => (
            <article
              key={`${item.item_type}-${item.item_id}`}
              className="rounded-md border border-slate-200 p-3 dark:border-slate-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name_snapshot}</p>
                  <p className="text-xs uppercase text-slate-500">{item.item_type}</p>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {formatMoney(item.line_total_tnd)}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onDecreaseQty(item)}
                    disabled={item.qty <= 1 || submitting}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="min-w-8 text-center text-sm font-semibold">{item.qty}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onIncreaseQty(item)}
                    disabled={submitting}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <Button type="button" variant="outline" size="sm" onClick={() => onRemove(item)} disabled={submitting}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="mt-4 space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <div>
          <Label htmlFor="table_number">Table Number *</Label>
          <Input
            id="table_number"
            name="table_number"
            value={formik.values.table_number}
            onChange={formik.handleChange}
            className="mt-1"
            placeholder="Required (example: 12)"
          />
          {formik.touched.table_number && typeof formik.errors.table_number === "string" ? (
            <p className="mt-1 text-xs text-red-600">{formik.errors.table_number}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            name="notes"
            value={formik.values.notes}
            onChange={formik.handleChange}
            rows={3}
            className="mt-1"
            placeholder="Any order notes..."
          />
          {formik.touched.notes && typeof formik.errors.notes === "string" ? (
            <p className="mt-1 text-xs text-red-600">{formik.errors.notes}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-md bg-slate-50 p-3 dark:bg-slate-700/40">
        <div className="flex items-center justify-between text-base font-bold text-slate-900 dark:text-white">
          <span>Total</span>
          <span>{formatMoney(totalTnd)}</span>
        </div>
      </div>

      <Button
        type="submit"
        className="mt-4 w-full"
        disabled={cartItems.length === 0 || submitting}
      >
        {submitting ? "Sending..." : "Confirm & Send"}
      </Button>
    </div>
  );
}
