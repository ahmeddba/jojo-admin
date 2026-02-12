import { cn } from "@/lib/utils";

type Status = "in-stock" | "low-stock" | "out-of-stock";

export const StatusPill = ({ status }: { status: Status }) => {
  const label =
    status === "in-stock" ? "In Stock" : status === "low-stock" ? "Low Stock" : "Out of Stock";

  const cls =
    status === "in-stock"
      ? "bg-[#E8F5E9] text-[#1B4332]"
      : status === "low-stock"
      ? "bg-[#FFF8E1] text-[#78350F]"
      : "bg-[#FFEBEE] text-[#B71C1C]";

  return (
    <span className={cn("px-2 py-0.5 text-[11px] font-medium rounded-full", cls)}>{label}</span>
  );
};
