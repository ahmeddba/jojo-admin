"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function categoryFromMenuItem(item: MenuItem): string {
  if (item.category && item.category.trim()) {
    return item.category.trim();
  }
  if (item.menu_categories?.name) {
    return item.menu_categories.name;
  }
  return "Uncategorized";
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
    const values = menuItems.map(categoryFromMenuItem);
    return ["All", ...Array.from(new Set(values))];
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">Catalog</h2>
        <SearchInput placeholder="Search products..." value={search} onChange={onSearchChange} />
      </div>

      <Tabs value={tab} onValueChange={(next) => onTabChange(next === "deals" ? "deals" : "menu")}>
        <TabsList className="bg-slate-100 p-1 dark:bg-slate-700/60">
          <TabsTrigger value="menu">Menu Items</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
        </TabsList>

        <TabsContent value="menu" className="space-y-4 pt-3">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onCategoryChange(category)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  selectedCategory === category
                    ? "border-jojo-green bg-jojo-green text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-700/40 dark:text-slate-200"
                }`}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredMenuItems.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <div className="relative h-32 bg-slate-100 dark:bg-slate-700">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-black/35" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <p className="line-clamp-1 text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-xs font-bold text-white">{formatMoney(getMenuPrice(item))}</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.description}</p>
                    <Button className="mt-3 w-full" size="sm" onClick={() => onAddMenuItem(item)}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deals" className="space-y-4 pt-3">
          {filteredDeals.length === 0 ? (
            <EmptyState title="No deals" description="No active deals match your search." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredDeals.map((deal) => (
                <article
                  key={deal.id}
                  className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <div className="relative h-32 bg-slate-100 dark:bg-slate-700">
                    {deal.image_url ? (
                      <img
                        src={deal.image_url}
                        alt={deal.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-black/35" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <p className="line-clamp-1 text-sm font-semibold text-white">{deal.name}</p>
                      <p className="text-xs font-bold text-white">{formatMoney(getDealPrice(deal))}</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{deal.description}</p>
                    <Button className="mt-3 w-full" size="sm" onClick={() => onAddDeal(deal)}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
