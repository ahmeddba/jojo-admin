import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatQuantity(quantity: number | string | undefined | null, unit: string | undefined | null): string {
  const qty = Number(quantity);
  const u = unit?.toLowerCase().trim();

  if (isNaN(qty)) return "0";

  if (u === "pcs" || u === "piece" || u === "pieces") {
    return Math.floor(qty).toString();
  }

  // Check if it's effectively an integer (e.g. 5.000) to keep it clean, OR stick to strict 3 decimals as requested?
  // Request said: "fix the number of digits to 3 after the , and for pieces let it whole numbers"
  // So strict 3 decimals for non-pieces.
  return qty.toFixed(3);
}
