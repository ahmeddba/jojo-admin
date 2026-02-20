"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

/* ─── Types ─── */
type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* ─── Hook ─── */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx.toast;
}

/* ─── Styling per variant ─── */
const variantStyles: Record<
  ToastVariant,
  { bg: string; border: string; text: string; icon: typeof CheckCircle2 }
> = {
  success: {
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
    icon: CheckCircle2,
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: XCircle,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    icon: Info,
  },
};

/* ─── Provider ─── */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      // Auto-dismiss after 4 seconds
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  const toast = {
    success: (msg: string) => addToast(msg, "success"),
    error: (msg: string) => addToast(msg, "error"),
    warning: (msg: string) => addToast(msg, "warning"),
    info: (msg: string) => addToast(msg, "info"),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast Container — bottom-right */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm">
        {toasts.map((t) => {
          const style = variantStyles[t.variant];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              className={`
                flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg
                ${style.bg} ${style.border}
                animate-slide-in-right
              `}
              role="alert"
            >
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${style.text}`} />
              <p className={`text-sm font-medium ${style.text} flex-1`}>
                {t.message}
              </p>
              <button
                onClick={() => removeToast(t.id)}
                className={`shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors ${style.text}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
