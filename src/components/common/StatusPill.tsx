import { cn } from "@/lib/utils";

type Status = "in-stock" | "low-stock" | "out-of-stock" | "new-item";

export const StatusPill = ({ status }: { status: Status }) => {
  const label =
    status === "in-stock"
      ? "In Stock"
      : status === "low-stock"
      ? "Low Stock"
      : status === "new-item"
      ? "New Item"
      : "Out of Stock";

  const cls =
    status === "in-stock"
      ? "bg-[#E8F5E9] text-[#1B4332]"
      : status === "low-stock"
      ? "bg-[#FFF8E1] text-[#78350F]"
      : status === "new-item"
      ? "bg-[#E3F2FD] text-[#1565C0]"
      : "bg-[#FFEBEE] text-[#B71C1C]";

  return (
    <span className={cn("px-2 py-0.5 text-[11px] font-medium rounded-full", cls)}>{label}</span>
  );
};
