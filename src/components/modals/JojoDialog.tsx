"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode; // form body
  primaryLabel: string;
  onPrimaryClick?: () => void;
  secondaryLabel?: string;
  variant?: "default" | "destructive";
  disabled?: boolean;
  showSecondary?: boolean;
};

export const JojoDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  primaryLabel,
  onPrimaryClick,
  secondaryLabel = "Cancel",
  variant = "default",
  disabled = false,
  showSecondary = true,
}: Props & { showSecondary?: boolean }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white rounded-[12px] shadow-jojo border border-jojo-border">
        <DialogHeader className="pb-2">
          <DialogTitle className="font-display text-2xl text-jojo-text">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-jojo-text-secondary">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-2">{children}</div>

        <DialogFooter className="pt-4 border-t border-jojo-border/40 mt-4">
          {showSecondary && (
            <Button
              type="button"
              variant="outline"
              className="bg-jojo-surface-light text-jojo-text-secondary hover:bg-jojo-surface"
              onClick={() => onOpenChange(false)}
              disabled={disabled}
            >
              {secondaryLabel}
            </Button>
          )}
          <Button
            type="submit"
            className={
              variant === "destructive"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-jojo-green hover:bg-jojo-green-light text-white"
            }
            onClick={onPrimaryClick}
            disabled={disabled}
          >
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
