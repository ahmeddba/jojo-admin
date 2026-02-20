"use client";

import AppLayout from "@/components/layout/AppLayout";

import { useEffect, useState, useCallback } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { BestSellingChart } from "@/components/dashboard/BestSellingChart";
import { createClient } from "@/lib/supabase";
import {
  fetchTotalRevenue,
  fetchDailySales,
  fetchBestSelling,
  fetchRevenueTrend,
  fetchLowStockItems,
} from "@/services/dashboard/dashboardService";
import type {
  TotalRevenueResult,
  DailySalesResult,
  BestSellingItem,
  RevenueTrendPoint,
  IngredientWithStatus,
} from "@/lib/database.types";
import {
  DollarSign,
  ShoppingCart,
  ArrowUpRight,

  Sparkles,
  Loader2,
} from "lucide-react";

export default function DashboardPage() {
  const [mode, setMode] = useState<"restaurant" | "coffee">("restaurant");
  const [bestPeriod, setBestPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  // Data state
  const [revenue, setRevenue] = useState<TotalRevenueResult | null>(null);
  const [dailySales, setDailySales] = useState<DailySalesResult | null>(null);
  const [bestSelling, setBestSelling] = useState<BestSellingItem[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendPoint[]>([]);
  const [lowStock, setLowStock] = useState<IngredientWithStatus[]>([]);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rev, sales, best, trend, stock] = await Promise.all([
        fetchTotalRevenue(supabase, mode, "month"),
        fetchDailySales(supabase, mode),
        fetchBestSelling(supabase, mode, bestPeriod === "week" ? "week" : "month"),
        fetchRevenueTrend(supabase, mode, "week"),
        fetchLowStockItems(supabase, mode),
      ]);
      setRevenue(rev);
      setDailySales(sales);
      setBestSelling(best);
      setRevenueTrend(trend);
      setLowStock(stock);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, mode, bestPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const revenueDisplay = revenue
    ? `TND ${Number(revenue.total).toLocaleString("en", { minimumFractionDigits: 2 })}`
    : "—";

  const ordersDisplay = dailySales ? `${dailySales.count} orders` : "—";

  const summaryLines = [
    revenue
      ? `${mode === "restaurant" ? "Restaurant" : "Coffee bar"} monthly revenue: TND ${Number(revenue.total).toLocaleString("en", { minimumFractionDigits: 2 })}.`
      : null,
    bestSelling.length > 0
      ? `Top sellers: ${bestSelling.slice(0, 3).map((b) => b.name).join(", ")}.`
      : null,
    lowStock.length > 0
      ? `${lowStock.length} ingredient${lowStock.length > 1 ? "s" : ""} below safety stock.`
      : "All ingredients are at healthy levels.",
  ].filter(Boolean);

  return (
    <AppLayout>
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Welcome back, Admin!</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-full hover:bg-slate-200">
            <span className="sr-only">Notifications</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-600"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </button>
          <img
            alt="User avatar"
            className="h-12 w-12 rounded-full border-2 border-primary object-cover p-0.5"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB8hty-RNy7oYqGRNtN7_B8mzmsHkMYT1wcuKd4Z5I3pfWIz5pytmgdXMsXBMn6-zya-KVdGbGVzzYIReeH10zmIW7k4IPIbWDXAf6rr_FlrKBbVcGISUL0uCd6RlgQBuBfquHkKPqoe8p8C4uZIf2qbDE81bmQ3CanUysiRN5wNZ7kMTtQpiCmbY8-qITxHR19taeW4KkZG7gZZ3WqDRD_VR5pjKbFAinQWcu03ez2yEMnPiiZ3F75CD0fPMw4uxqrzGnWnyb4bGs_"
          />
        </div>
      </header>

      {/* AI Daily Summary */}
      <div className="mb-8 p-6 rounded-lg bg-walnut-brown/90 text-white flex gap-6 items-center shadow-lg">
        <Sparkles className="h-10 w-10 text-antique-gold" />
        <div>
          <h2 className="font-display text-xl font-bold text-antique-gold mb-1">AI Daily Summary</h2>
          <p className="text-slate-200">
            {loading ? "Loading insights..." : summaryLines.join(" ")}
          </p>
        </div>
      </div>

      {/* Filters Row */}
      <div className="mb-8 flex items-center justify-between">
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

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-slate-500">Loading dashboard data...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col gap-8">
            {/* Revenue & Sales Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 bg-white rounded-lg shadow-md border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-500">Total Revenue</h3>
                  <div className="p-2 bg-primary/10 rounded-full">
                    <DollarSign className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <p className="font-display text-4xl font-bold text-slate-900">{revenueDisplay}</p>
                <p className="text-sm text-green-600 mt-1 flex items-center">
                  <ArrowUpRight className="h-4 w-4 mr-1" />
                  This month
                </p>
              </div>
              
              <div className="p-6 bg-white rounded-lg shadow-md border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-500">Daily Sales</h3>
                  <div className="p-2 bg-antique-gold/20 rounded-full">
                    <ShoppingCart className="h-6 w-6 text-antique-gold" />
                  </div>
                </div>
                <p className="font-display text-4xl font-bold text-slate-900">{ordersDisplay}</p>
                <p className="text-sm text-slate-500 mt-1 flex items-center">
                  TND {dailySales ? Number(dailySales.total).toLocaleString("en", { minimumFractionDigits: 2 }) : "0.00"} today
                </p>
              </div>
            </div>

            {/* Revenue Trend Chart */}
            <div className="p-6 bg-white rounded-lg shadow-md border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl font-bold text-slate-900">Revenue Trend</h3>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-primary" />
                    <span className="text-slate-600">This Week</span>
                  </div>
                </div>
              </div>
              {revenueTrend.length > 0 ? (
                <RevenueTrendChart data={revenueTrend} />
              ) : (
                <EmptyState title="No Data" description="No revenue trend data available yet." />
              )}
            </div>

            {/* Best Selling Items Chart */}
            <div className="p-6 bg-white rounded-lg shadow-md border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display text-xl font-bold text-slate-900">Best-Selling Items</h3>
                <select 
                  className="text-xs bg-slate-50 border-none rounded-md py-1 px-2 text-slate-600 focus:ring-1 focus:ring-primary cursor-pointer font-chart"
                  value={bestPeriod}
                  onChange={(e) => setBestPeriod(e.target.value)}
                >
                  <option value="month">This Month</option>
                  <option value="week">This Week</option>
                </select>
              </div>
              {bestSelling.length > 0 ? (
                <BestSellingChart data={bestSelling} />
              ) : (
                <EmptyState title="No Sales Data" description="No sales data available for this period." />
              )}
            </div>
          </div>

          {/* Right column: Low Stock Alerts */}
          <div className="lg:col-span-1 p-6 bg-white rounded-lg shadow-md border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-xl font-bold text-slate-900">Low Stock Alerts</h3>
              <span className="px-3 py-1 text-sm font-semibold text-red-800 bg-red-200 rounded-full">
                {lowStock.length}
              </span>
            </div>
            <div className="space-y-4">
              {lowStock.length === 0 ? (
                 <EmptyState title="No Alerts" description="Stock is healthy." />
              ) : (
                lowStock.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <p className="text-sm text-slate-500">Min: {item.min_quantity} {item.unit}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${item.computed_status === 'out_of_stock' ? 'text-red-600' : 'text-amber-600'}`}>
                        {item.quantity} {item.unit}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">{item.computed_status.replace("_", " ")}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button className="w-full mt-6 py-2 text-center text-primary font-semibold bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
              View All Stock
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
