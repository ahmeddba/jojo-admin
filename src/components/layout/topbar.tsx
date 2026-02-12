"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { SegmentedToggle } from "../common/SegmentedToggle";
import { SearchInput } from "../common/SearchInput";

type Props = {
  title: string;
  subtitle?: string;
  showRestaurantCoffeeToggle?: boolean;
  toggleLabels?: [string, string];
  onModeChange?: (mode: "restaurant" | "coffee") => void;
};

export const Topbar: React.FC<Props> = ({
  title,
  subtitle,
  showRestaurantCoffeeToggle = true,
  toggleLabels = ["Restaurant", "Coffee"],
  onModeChange,
}) => {
  const [mode, setMode] = useState<"restaurant" | "coffee">("restaurant");

  const handleChange = (value: string) => {
    const m = value === "coffee" ? "coffee" : "restaurant";
    setMode(m);
    onModeChange?.(m);
  };

  return (
    <header className="flex items-center justify-between mb-6">
      <div>
        <h1 className="font-display text-4xl font-bold text-jojo-text">{title}</h1>
        {subtitle && (
          <p className="text-sm text-jojo-text-secondary mt-1">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {showRestaurantCoffeeToggle && (
          <SegmentedToggle
            options={[
              { value: "restaurant", label: toggleLabels[0] },
              { value: "coffee", label: toggleLabels[1] },
            ]}
            value={mode}
            onChange={handleChange}
          />
        )}

        <SearchInput placeholder="Search data..." />

        <button className="p-2 rounded-full hover:bg-jojo-surface transition-colors">
          <Bell className="h-5 w-5 text-jojo-text-secondary" />
        </button>

        <div className="h-10 w-10 rounded-full border-2 border-jojo-green overflow-hidden bg-jojo-surface flex items-center justify-center text-xs font-semibold text-jojo-green">
          JB
        </div>
      </div>
    </header>
  );
};
