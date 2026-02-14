"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Topbar } from "@/components/layout/topbar";
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
  markOrderWebhookFailed,
} from "@/lib/queries/orders";
import type {
  BusinessUnit,
  CartItem,
  MenuItem,
  Order,
  PosDeal,
  Ticket,
  ZReport,
} from "@/lib/database.types";
import { BusinessUnitToggle } from "@/components/orders/BusinessUnitToggle";
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

async function sendOrderToN8n(payload: {
  order_id: string;
  business_unit: BusinessUnit;
  items: Array<{
    item_type: "menu" | "deal";
    item_id: string;
    name_snapshot: string;
    qty: number;
    unit_price_tnd: number;
    line_total_tnd: number;
  }>;
  total_tnd: number;
  table_number: string;
  notes: string | null;
}): Promise<{ ok: boolean; external_ref?: string; error?: string }> {
  const response = await fetch("/api/n8n/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as {
    ok?: boolean;
    external_ref?: string;
    error?: string;
  };

  if (!response.ok || !body.ok) {
    return {
      ok: false,
      error: body.error ?? "Failed to call n8n webhook",
    };
  }

  return {
    ok: true,
    external_ref: body.external_ref,
  };
}

function getInventoryAlertsCount(result: { alerts_generated?: number; ingredients?: Array<{ alert_generated: boolean }> }): number {
  if (typeof result.alerts_generated === "number") {
    return result.alerts_generated;
  }
  return (result.ingredients ?? []).filter((item) => item.alert_generated).length;
}

export default function OrdersPage() {
  const supabase = createClient();

  const [mode, setMode] = useState<BusinessUnit>("restaurant");
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
  }>({
    open: false,
    title: "",
    description: "",
    variant: "info",
  });

  const notify = useCallback(
    (variant: "error" | "success" | "info", title: string, description: string) => {
      setToast({ open: true, title, description, variant });
      window.setTimeout(() => {
        setToast((prev) => ({ ...prev, open: false }));
      }, 4500);
    },
    []
  );

  const loadPageData = useCallback(async () => {
    setLoading(true);
    try {
      const [menuData, dealsData, orderData] = await Promise.all([
        fetchMenuCatalog(supabase, mode),
        fetchDealsCatalog(supabase, mode),
        fetchRecentOrders(supabase, mode),
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
  }, [mode, notify, supabase]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    setSelectedCategory("All");
    setSearch("");
    setCartItems([]);
    setZResult(null);
  }, [mode]);

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

        const payloadItems = items.map((item) => ({
          item_type: item.item_type,
          item_id: item.item_id as string,
          name_snapshot: item.name_snapshot,
          qty: item.qty,
          unit_price_tnd: item.unit_price_tnd,
          line_total_tnd: item.line_total_tnd,
        }));

        const webhook = await sendOrderToN8n({
          order_id: order.id,
          business_unit: order.business_unit,
          items: payloadItems,
          total_tnd: order.total_tnd,
          table_number: order.table_number ?? "UNKNOWN",
          notes: order.notes,
        });

        if (!webhook.ok) {
          await markOrderWebhookFailed(supabase, order.id, webhook.error ?? "Webhook failed");
          await loadPageData();
          notify("error", "Webhook failed", webhook.error ?? "Retry failed");
          return;
        }

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
            notify("info", `${alertsGenerated} stock alerts generated`, "Review inventory thresholds.");
          }
        }
      } catch (error) {
        console.error("Retry webhook failed:", error);
        notify("error", "Retry failed", error instanceof Error ? error.message : "Unknown error");
      } finally {
        setSubmitting(false);
      }
    },
    [loadPageData, notify, submitting, supabase]
  );

  const handleGenerateZ = useCallback(async () => {
    setZGenerating(true);
    try {
      const report = await generateZReport(supabase, mode, zDate);
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
  }, [mode, notify, supabase, zDate]);

  return (
    <AppLayout>
      <AppToast
        open={toast.open}
        title={toast.title}
        description={toast.description}
        variant={toast.variant}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      <TicketPreviewDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        order={ticketOrder}
        ticket={ticketData}
      />

      <Topbar
        title="Orders & Tickets"
        subtitle="POS ordering flow with n8n webhook confirmation and ticket generation"
        showRestaurantCoffeeToggle={false}
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BusinessUnitToggle value={mode} onChange={setMode} />

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <Label htmlFor="z-date" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Z Report
            </Label>
            <Input
              id="z-date"
              type="date"
              value={zDate}
              onChange={(event) => setZDate(event.target.value)}
              className="h-8 w-[170px]"
            />
            <Button type="button" size="sm" onClick={handleGenerateZ} disabled={zGenerating}>
              {zGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Z"}
            </Button>
          </div>
        </div>

        {zResult ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="font-semibold text-slate-900 dark:text-white">Z Summary ({zResult.day})</p>
            <p className="text-slate-600 dark:text-slate-300">
              Total orders: {zResult.total_orders} · Total revenue: {money(zResult.total_revenue_tnd)}
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
                const orderId = await createPendingOrder(supabase, {
                  businessUnit: mode,
                  tableNumber: values.table_number,
                  notes: values.notes,
                  items: cartItems,
                });

                const webhook = await sendOrderToN8n({
                  order_id: orderId,
                  business_unit: mode,
                  items: cartItems.map((item) => ({
                    item_type: item.item_type,
                    item_id: item.item_id,
                    name_snapshot: item.name_snapshot,
                    qty: item.qty,
                    unit_price_tnd: item.unit_price_snapshot,
                    line_total_tnd: item.line_total_tnd,
                  })),
                  total_tnd: totalTnd,
                  table_number: values.table_number.trim(),
                  notes: values.notes.trim() || null,
                });

                if (!webhook.ok) {
                  await markOrderWebhookFailed(supabase, orderId, webhook.error ?? "Webhook failed");
                  await loadPageData();
                  notify(
                    "error",
                    "Webhook failed",
                    "Order saved as FAILED_WEBHOOK. You can retry from recent orders."
                  );
                  return;
                }

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
                    notify("info", `${alertsGenerated} stock alerts generated`, "Review inventory thresholds.");
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

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">Recent Orders</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Last 10 orders for {mode}</p>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : recentOrders.length === 0 ? (
            <EmptyState title="No recent orders" description="Create your first order from the catalog." />
          ) : (
            <div className="mt-4 space-y-3">
              {recentOrders.map((order) => {
                const ticket = normalizeTicket(order);
                return (
                  <article
                    key={order.id}
                    className="rounded-md border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {dateTime(order.created_at)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {money(order.total_tnd)} · Table {order.table_number || "-"}
                        </p>
                      </div>
                      <Badge variant={orderStatusBadgeVariant(order.status)}>{order.status}</Badge>
                    </div>

                    {order.status === "FAILED_WEBHOOK" ? (
                      <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          <span>{order.webhook_error || "Webhook failed"}</span>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!ticket}
                        onClick={() => openTicketDialog(order)}
                      >
                        Open Ticket
                      </Button>

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
