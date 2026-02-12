"use client";

import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

export const SegmentedToggle = ({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) => {
  return (
    <div className="inline-flex p-1 bg-jojo-surface-light rounded-full border border-jojo-border/60">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-4 py-1 text-xs font-medium rounded-full transition-colors",
              active
                ? "bg-jojo-green text-white shadow"
                : "text-jojo-text-secondary hover:bg-jojo-surface"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
