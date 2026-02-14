"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { BusinessUnit, Order, Ticket } from "@/lib/database.types";

type TicketPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  ticket: Ticket | null;
};

function formatMoney(value: number): string {
  return `${Number(value).toFixed(3)} TND`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("fr-TN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelBusinessUnit(value: BusinessUnit): string {
  return value === "coffee" ? "Coffee" : "Restaurant";
}

export function TicketPreviewDialog({
  open,
  onOpenChange,
  order,
  ticket,
}: TicketPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ticket Preview</DialogTitle>
        </DialogHeader>

        {!order || !ticket ? (
          <p className="text-sm text-slate-500">No ticket available for this order.</p>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 font-mono text-sm text-slate-900">
            <p className="text-center font-bold">La Storia di JOJO</p>
            <p className="mt-2 text-center">{formatDateTime(ticket.created_at)}</p>
            <p className="text-center">Ticket #{ticket.ticket_number}</p>
            <p className="text-center">Business Unit: {labelBusinessUnit(order.business_unit)}</p>
            <p className="mt-3 border-t border-slate-300 pt-2">Items</p>

            <div className="mt-1 space-y-1">
              {(order.order_items ?? []).length === 0 ? (
                <p className="text-xs">No items</p>
              ) : (
                (order.order_items ?? []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-xs">
                    <p className="line-clamp-1">
                      {item.qty} x {item.name_snapshot}
                    </p>
                    <p>{formatMoney(item.line_total_tnd)}</p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 border-t border-slate-300 pt-2">
              <div className="flex items-center justify-between font-bold">
                <span>Total</span>
                <span>{formatMoney(order.total_tnd)}</span>
              </div>
              <p className="mt-1 text-xs">Table: {order.table_number || "-"}</p>
              <p className="text-xs">Notes: {order.notes || "-"}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
