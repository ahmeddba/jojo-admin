"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppToastProps = {
  open: boolean;
  title: string;
  description?: string;
  variant?: "error" | "success" | "info";
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose: () => void;
};

export function AppToast({
  open,
  title,
  description,
  variant = "info",
  action,
  onClose,
}: AppToastProps) {
  if (!open) {
    return null;
  }

  const tone =
    variant === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : variant === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className="fixed right-5 top-5 z-[100] w-[360px] max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-top-2 duration-300">
      <div className={cn("rounded-lg border p-4 shadow-lg", tone)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold">{title}</p>
            {description ? <p className="mt-1 text-xs leading-5">{description}</p> : null}
            {action && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-8 border-current bg-transparent px-3 text-current hover:bg-white/20 hover:text-current"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-7 w-7 p-0 hover:bg-transparent"
            onClick={onClose}
            aria-label="Close toast"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
