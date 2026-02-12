"use client";

import { Search } from "lucide-react";

type Props = {
  placeholder?: string;
  value?: string;
  onChange?: (val: string) => void;
};

export const SearchInput: React.FC<Props> = ({ placeholder, value, onChange }) => (
  <div className="relative w-64">
    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-jojo-text-secondary" />
    <input
      className="w-full pl-9 pr-3 py-2 rounded-md bg-white border border-jojo-border text-sm focus:outline-none focus:ring-2 focus:ring-jojo-green"
      placeholder={placeholder ?? "Search..."}
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  </div>
);
