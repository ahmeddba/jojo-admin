"use client";

import { useMemo } from "react";

import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";


import { cn } from "@/lib/utils";
import type { MenuItem, PosDeal } from "@/lib/database.types";

export type CatalogTab = "menu" | "deals";

type ProductCatalogProps = {
  tab: CatalogTab;
  onTabChange: (tab: CatalogTab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  menuItems: MenuItem[];
  deals: PosDeal[];
  onAddMenuItem: (item: MenuItem) => void;
  onAddDeal: (deal: PosDeal) => void;
};

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

function formatMoney(value: number): string {
  return `${value.toFixed(3)} TND`;
}

function categoryFromMenuItem(item: MenuItem): string | null {
  if (item.category && item.category.trim()) {
    return item.category.trim();
  }
  if (item.menu_categories?.name) {
    return item.menu_categories.name;
  }
  return null;
}

export function ProductCatalog({
  tab,
  onTabChange,
  search,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  menuItems,
  deals,
  onAddMenuItem,
  onAddDeal,
}: ProductCatalogProps) {
  const categories = useMemo(() => {
    const values = menuItems
      .map(categoryFromMenuItem)
      .filter((c): c is string => c !== null);
    return ["All", ...Array.from(new Set(values))].sort();
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return menuItems.filter((item) => {
      const category = categoryFromMenuItem(item);
      const categoryMatch = selectedCategory === "All" || selectedCategory === category;
      const searchMatch =
        normalizedSearch.length === 0 ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.description.toLowerCase().includes(normalizedSearch);

      return categoryMatch && searchMatch;
    });
  }, [menuItems, search, selectedCategory]);

  const filteredDeals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return deals.filter((deal) => {
      return (
        normalizedSearch.length === 0 ||
        deal.name.toLowerCase().includes(normalizedSearch) ||
        deal.description.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [deals, search]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-slate-900">Catalog</h2>
        <SearchInput placeholder="Search products..." value={search} onChange={onSearchChange} />
      </div>

      <div className="mb-6 flex items-center">
        <div className="flex p-1 bg-slate-200 rounded-lg">
          <button
             type="button"
            onClick={() => onTabChange("menu")}
            className={`px-6 py-2 rounded-md font-semibold transition-all ${
              tab === "menu"
                ? "bg-white text-primary shadow"
                : "text-slate-600"
            }`}
          >
            Menu Items
          </button>
          <button
             type="button"
            onClick={() => onTabChange("deals")}
            className={`px-6 py-2 rounded-md font-semibold transition-all ${
              tab === "deals"
                ? "bg-white text-primary shadow"
                : "text-slate-600"
            }`}
          >
            Deals
          </button>
        </div>
      </div>

      {tab === "menu" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onCategoryChange(category)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  selectedCategory === category
                    ? "border-jojo-green bg-jojo-green text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {filteredMenuItems.length === 0 ? (
            <EmptyState
              title="No menu items"
              description="No available menu items match your search or category filter."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filteredMenuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onAddMenuItem(item)}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="relative h-28 w-full overflow-hidden bg-slate-100">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <span className="text-3xl">🍽️</span>
                      </div>
                    )}

                    {!item.available && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                          Unavailable
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-3">
                    <h3 className="line-clamp-2 text-sm font-bold text-slate-900 leading-tight">
                      {item.name}
                    </h3>
                    <p className="mt-auto pt-2 text-sm font-bold text-primary">
                      {formatMoney(getMenuPrice(item))}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "deals" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
          {filteredDeals.length === 0 ? (
            <EmptyState title="No deals" description="No active deals match your search." />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filteredDeals.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => onAddDeal(deal)}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="relative h-28 w-full overflow-hidden bg-slate-100">
                    {deal.image_url ? (
                      <img
                        src={deal.image_url}
                        alt={deal.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <span className="text-3xl">🏷️</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-3">
                    <h3 className="line-clamp-2 text-sm font-bold text-slate-900 leading-tight">
                      {deal.name}
                    </h3>
                    <p className="mt-auto pt-2 text-sm font-bold text-primary">
                      {formatMoney(getDealPrice(deal))}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    );
  }
