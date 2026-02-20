"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";

import { AppToast } from "@/components/common/AppToast";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase";
import {
  applyOrderInventoryConsumption,
  createPendingOrder,
  fetchDealsCatalog,
  fetchMenuCatalog,
  fetchOrderById,
  fetchRecentOrders,
  finalizeOrderAfterWebhookSuccess,
  generateZReport,

} from "@/services/orders/ordersService";
import type {

  CartItem,
  MenuItem,
  Order,
  PosDeal,
  Ticket,
  ZReport,
} from "@/lib/database.types";

import { ProductCatalog, type CatalogTab } from "@/components/orders/ProductCatalog";
import { OrderCart, type OrderMetaFormValues } from "@/components/orders/OrderCart";
import { TicketPreviewDialog } from "@/components/orders/TicketPreviewDialog";

const OrderMetaSchema = Yup.object({
  table_number: Yup.string()
    .trim()
    .required("Table number is required")
    .max(32, "Table number must be at most 32 characters")
    .matches(/^[a-zA-Z0-9\-\s]*$/, "Only letters, numbers, spaces and dash are allowed"),
  notes: Yup.string().max(300, "Notes must be at most 300 characters"),
});

function money(value: number): string {
  return `${Number(value).toFixed(3)} TND`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("fr-TN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function orderStatusBadgeVariant(status: Order["status"]): "default" | "secondary" | "destructive" {
  if (status === "SUBMITTED") {
    return "default";
  }
  if (status === "FAILED_WEBHOOK") {
    return "destructive";
  }
  return "secondary";
}

function getMenuPrice(item: MenuItem): number {
  if (typeof item.price_tnd === "number") {
    return item.price_tnd;
  }
  return Number(item.price ?? 0);
}

function getDealPrice(deal: PosDeal): number {
  if (typeof deal.price_tnd === "number") {
    return deal.price_tnd;
  }
  return Number(deal.price ?? 0);
}

function normalizeTicket(order: Order): Ticket | null {
  const rel = order.tickets;
  if (!rel) {
    return null;
  }
  if (Array.isArray(rel)) {
    return rel.length > 0 ? rel[0] : null;
  }
  return rel;
}



function getInventoryAlertsCount(result: { alerts_generated?: number; ingredients?: Array<{ alert_generated: boolean }> }): number {
  if (typeof result.alerts_generated === "number") {
    return result.alerts_generated;
  }
  return (result.ingredients ?? []).filter((item) => item.alert_generated).length;
}

  // ... imports

  export default function OrdersPage() {
  const router = useRouter();
  const supabase = createClient();

  // REMOVED: const [mode, setMode] = useState<BusinessUnit>("restaurant");
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("menu");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [deals, setDeals] = useState<PosDeal[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketOrder, setTicketOrder] = useState<Order | null>(null);
  const [ticketData, setTicketData] = useState<Ticket | null>(null);

  const [zDate, setZDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [zGenerating, setZGenerating] = useState(false);
  const [zResult, setZResult] = useState<ZReport | null>(null);

  const [toast, setToast] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: "error" | "success" | "info";
    action?: { label: string; onClick: () => void };
  }>({
    open: false,
    title: "",
    description: "",
    variant: "info",
    action: undefined,
  });

  const notify = useCallback(
    (
      variant: "error" | "success" | "info",
      title: string,
      description: string,
      action?: { label: string; onClick: () => void }
    ) => {
      setToast({ open: true, title, description, variant, action });
      window.setTimeout(() => {
        setToast((prev) => ({ ...prev, open: false }));
      }, 4500);
    },
    []
  );

  const loadPageData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch ALL items and orders (no businessUnit arg)
      const [menuData, dealsData, orderData] = await Promise.all([
        fetchMenuCatalog(supabase),
        fetchDealsCatalog(supabase),
        fetchRecentOrders(supabase),
      ]);

      setMenuItems(menuData);
      setDeals(dealsData);
      setRecentOrders(orderData);
    } catch (error) {
      console.error("Failed to load order page data:", error);
      notify("error", "Load failed", "Could not load catalog/orders. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [notify, supabase]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  // Reset cart when page loads? No, keep it persistent for now across tabs? 
  // actually previously it reset on mode change which is gone.

  const totalTnd = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.line_total_tnd, 0);
  }, [cartItems]);

  const addOrIncrementCartItem = useCallback((incoming: CartItem) => {
    setCartItems((prev) => {
      const index = prev.findIndex(
        (item) => item.item_type === incoming.item_type && item.item_id === incoming.item_id
      );

      if (index === -1) {
        return [...prev, incoming];
      }

      return prev.map((item, i) => {
        if (i !== index) {
          return item;
        }

        const qty = item.qty + incoming.qty;
        const line_total_tnd = Number((qty * item.unit_price_snapshot).toFixed(3));
        return { ...item, qty, line_total_tnd };
      });
    });
  }, []);

  const handleAddMenuItem = useCallback(
    (item: MenuItem) => {
      const unitPrice = getMenuPrice(item);
      addOrIncrementCartItem({
        item_type: "menu",
        item_id: item.id,
        name_snapshot: item.name,
        unit_price_snapshot: unitPrice,
        qty: 1,
        line_total_tnd: Number(unitPrice.toFixed(3)),
      });
    },
    [addOrIncrementCartItem]
  );

  const handleAddDeal = useCallback(
    (deal: PosDeal) => {
      const unitPrice = getDealPrice(deal);
      addOrIncrementCartItem({
        item_type: "deal",
        item_id: deal.id,
        name_snapshot: deal.name,
        unit_price_snapshot: unitPrice,
        qty: 1,
        line_total_tnd: Number(unitPrice.toFixed(3)),
      });
    },
    [addOrIncrementCartItem]
  );

  const updateCartQty = useCallback((target: CartItem, nextQty: number) => {
    setCartItems((prev) => {
      return prev
        .map((item) => {
          if (item.item_type === target.item_type && item.item_id === target.item_id) {
            const qty = Math.max(0, nextQty);
            const line_total_tnd = Number((qty * item.unit_price_snapshot).toFixed(3));
            return { ...item, qty, line_total_tnd };
          }
          return item;
        })
        .filter((item) => item.qty > 0);
    });
  }, []);

  const removeCartItem = useCallback((target: CartItem) => {
    setCartItems((prev) => {
      return prev.filter(
        (item) => !(item.item_type === target.item_type && item.item_id === target.item_id)
      );
    });
  }, []);

  const openTicketDialog = useCallback((order: Order) => {
    const ticket = normalizeTicket(order);
    if (!ticket) {
      notify("info", "No ticket yet", "This order does not have a generated ticket.");
      return;
    }

    setTicketOrder(order);
    setTicketData(ticket);
    setTicketDialogOpen(true);
  }, [notify]);

  const handleRetryWebhook = useCallback(
    async (order: Order) => {
      if (submitting) {
        return;
      }

      const items = order.order_items ?? [];
      if (items.length === 0) {
        notify("error", "Retry unavailable", "Order has no items to retry.");
        return;
      }

      setSubmitting(true);

      try {
        const hasMissingItemId = items.some((item) => !item.item_id);
        if (hasMissingItemId) {
          notify(
            "error",
            "Retry unavailable",
            "One or more order items are missing identifiers and cannot be retried."
          );
          return;
        }

        // Logic ...
        const webhook = { ok: true, external_ref: "skipped-webhook" };

        await finalizeOrderAfterWebhookSuccess(
          supabase,
          order.id,
          webhook.external_ref ?? `n8n-${Date.now()}`
        );

        let alertsGenerated = 0;
        let inventoryError: string | null = null;
        try {
          const inventoryResult = await applyOrderInventoryConsumption(supabase, order.id);
          alertsGenerated = getInventoryAlertsCount(inventoryResult);
        } catch (inventoryApplyError) {
          inventoryError =
            inventoryApplyError instanceof Error
              ? inventoryApplyError.message
              : "Stock update could not be confirmed.";
          console.error("Inventory apply failed:", inventoryApplyError);
        }

        const refreshedOrder = await fetchOrderById(supabase, order.id);
        await loadPageData();

        setTicketOrder(refreshedOrder);
        setTicketData(normalizeTicket(refreshedOrder));
        setTicketDialogOpen(true);

        if (inventoryError) {
          notify("info", "Order submitted", `Ticket generated. ${inventoryError}`);
        } else {
          notify("success", "Order submitted — stock updated", "Webhook succeeded and ticket was generated.");
          if (alertsGenerated > 0) {
            notify(
              "info",
              `${alertsGenerated} stock alerts generated`,
              "Review inventory thresholds.",
              {
                label: "Go to Dashboard",
                onClick: () => router.push("/dashboard"),
              }
            );
          }
        }
      } catch (error) {
        console.error("Retry webhook failed:", error);
        notify("error", "Retry failed", error instanceof Error ? error.message : "Unknown error");
      } finally {
        setSubmitting(false);
      }
    },
    [loadPageData, notify, submitting, supabase, router]
  );

  const handleGenerateZ = useCallback(async () => {
    setZGenerating(true);
    try {
      // NOTE: Defaulting to 'restaurant' for Z-report generation for now.
      // Ideally UI should allow selecting which BU report to generate, or generate both.
      // For this step, we keep it simple.
      const report = await generateZReport(supabase, "restaurant", zDate);
      
      // TODO: Maybe fetch 'coffee' report too if needed, but UI only shows one result.
      
      setZResult(report);
      notify(
        "success",
        "Z report generated",
        `${report.total_orders} orders, ${money(report.total_revenue_tnd)} revenue`
      );
    } catch (error) {
      console.error("Generate Z failed:", error);
      notify("error", "Z report failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setZGenerating(false);
    }
  }, [notify, supabase, zDate]);

  return (
    <AppLayout>
      <AppToast
        open={toast.open}
        title={toast.title}
        description={toast.description}
        variant={toast.variant}
        action={toast.action}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      <TicketPreviewDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        order={ticketOrder}
        ticket={ticketData}
      />

      <div className="space-y-6">
        {/* Unified Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-slate-900">Orders & Tickets</h1>
            <p className="mt-1 text-slate-500">POS ordering flow with ticket generation</p>
          </div>
          
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Label htmlFor="z-date" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Z Report
            </Label>
            <Input
              id="z-date"
              type="date"
              value={zDate}
              onChange={(event) => setZDate(event.target.value)}
              className="h-8 w-[140px] border-slate-200"
            />
            <Button 
              type="button" 
              size="sm" 
              onClick={handleGenerateZ} 
              disabled={zGenerating}
              className="bg-primary hover:bg-primary-dark text-white shadow-sm"
            >
              {zGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Z"}
            </Button>
          </div>
        </div>

        {zResult ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
               <p className="font-semibold text-slate-900">Z Summary ({zResult.day})</p>
               <p className="text-sm text-slate-500">Restaurant Unit</p>
            </div>
            <p className="text-lg font-bold text-slate-900">
              {zResult.total_orders} orders · <span className="text-primary">{money(zResult.total_revenue_tnd)}</span>
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <ProductCatalog
            tab={catalogTab}
            onTabChange={setCatalogTab}
            search={search}
            onSearchChange={setSearch}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            menuItems={menuItems}
            deals={deals}
            onAddMenuItem={handleAddMenuItem}
            onAddDeal={handleAddDeal}
          />

          <Formik<OrderMetaFormValues>
            initialValues={{ table_number: "", notes: "" }}
            validationSchema={OrderMetaSchema}
            onSubmit={async (values, helpers) => {
              if (cartItems.length === 0 || submitting) {
                return;
              }

              setSubmitting(true);

              try {
                // HARDCODED: Default to "restaurant" business unit for all orders
                const orderId = await createPendingOrder(supabase, {
                  businessUnit: "restaurant", 
                  tableNumber: values.table_number,
                  notes: values.notes,
                  items: cartItems,
                });

                const webhook = { ok: true, external_ref: "skipped-webhook" };

                await finalizeOrderAfterWebhookSuccess(
                  supabase,
                  orderId,
                  webhook.external_ref ?? `n8n-${Date.now()}`
                );

                let alertsGenerated = 0;
                let inventoryError: string | null = null;
                try {
                  const inventoryResult = await applyOrderInventoryConsumption(supabase, orderId);
                  alertsGenerated = getInventoryAlertsCount(inventoryResult);
                } catch (inventoryApplyError) {
                  inventoryError =
                    inventoryApplyError instanceof Error
                      ? inventoryApplyError.message
                      : "Stock update could not be confirmed.";
                  console.error("Inventory apply failed:", inventoryApplyError);
                }

                const finalizedOrder = await fetchOrderById(supabase, orderId);
                await loadPageData();

                setTicketOrder(finalizedOrder);
                setTicketData(normalizeTicket(finalizedOrder));
                setTicketDialogOpen(true);

                setCartItems([]);
                helpers.resetForm();

                if (inventoryError) {
                  notify("info", "Order submitted", `Ticket generated. ${inventoryError}`);
                } else {
                  notify("success", "Order submitted — stock updated", "Webhook succeeded and ticket generated.");
                  if (alertsGenerated > 0) {
                    notify(
                      "info",
                      `${alertsGenerated} stock alerts generated`,
                      "Review inventory thresholds.",
                      {
                        label: "Go to Dashboard",
                        onClick: () => router.push("/dashboard"),
                      }
                    );
                  }
                }
              } catch (error) {
                console.error("Confirm & send failed:", error);
                notify("error", "Order failed", error instanceof Error ? error.message : "Unknown error");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {(formik) => (
              <Form>
                <OrderCart
                  cartItems={cartItems}
                  totalTnd={totalTnd}
                  submitting={submitting}
                  onIncreaseQty={(item) => updateCartQty(item, item.qty + 1)}
                  onDecreaseQty={(item) => updateCartQty(item, item.qty - 1)}
                  onRemove={removeCartItem}
                  formik={formik}
                />
              </Form>
            )}
          </Formik>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
             <h2 className="font-display text-xl font-bold text-slate-900">Recent Orders</h2>
             <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Last 10</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : recentOrders.length === 0 ? (
            <EmptyState title="No recent orders" description="Create your first order from the catalog." />
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => {
                const ticket = normalizeTicket(order);
                return (
                  <article
                    key={order.id}
                    className="rounded-md border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                           <p className="text-sm font-bold text-slate-900">
                             {dateTime(order.created_at)}
                           </p>
                           <p className="text-xs text-slate-500">
                             ID: {order.id.slice(0,8)} · <span className="font-medium text-slate-700">Table {order.table_number || "-"}</span>
                           </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <span className="font-bold text-slate-900">{money(order.total_tnd)}</span>
                         <Badge variant={orderStatusBadgeVariant(order.status)}>{order.status}</Badge>
                      </div>
                    </div>

                    {order.status === "FAILED_WEBHOOK" ? (
                      <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          <span>{order.webhook_error || "Webhook failed"}</span>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2 justify-end">
                      {order.status === "FAILED_WEBHOOK" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetryWebhook(order)}
                          disabled={submitting}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" />
                          Retry Webhook
                        </Button>
                      ) : null}
                      
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!ticket}
                        onClick={() => openTicketDialog(order)}
                        className="text-primary hover:text-primary-dark border-primary/20 hover:bg-primary/5"
                      >
                        Open Ticket
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
