"use client";

import { SegmentedToggle } from "@/components/common/SegmentedToggle";
import type { BusinessUnit } from "@/lib/database.types";

type BusinessUnitToggleProps = {
  value: BusinessUnit;
  onChange: (value: BusinessUnit) => void;
};

export function BusinessUnitToggle({ value, onChange }: BusinessUnitToggleProps) {
  return (
    <SegmentedToggle
      options={[
        { value: "restaurant", label: "Restaurant" },
        { value: "coffee", label: "Coffee" },
      ]}
      value={value}
      onChange={(next) => onChange(next === "coffee" ? "coffee" : "restaurant")}
    />
  );
}
