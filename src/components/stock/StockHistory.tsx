import { format } from "date-fns";
import type { InventoryMovement } from "@/lib/database.types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Package,
  Truck,
  AlertTriangle,
  Undo2,
  RotateCcw,
  ShoppingCart,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { formatQuantity } from "@/lib/utils";

interface StockHistoryProps {
  movements: InventoryMovement[];
  onUndo: (movementId: string) => void;
  undoing: string | null;
}

export function StockHistory({ movements, onUndo, undoing }: StockHistoryProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "RESTOCK":
        return <Truck className="h-4 w-4 text-green-600" />;
      case "CONSUME":
        return <ShoppingCart className="h-4 w-4 text-slate-500" />;
      case "ADJUST":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "REVERSAL":
        return <RotateCcw className="h-4 w-4 text-red-500" />;
      case "CREATE":
        return <PlusCircle className="h-4 w-4 text-blue-500" />;
      case "DELETE":
        return <Trash2 className="h-4 w-4 text-red-600" />;
      default:
        return <Package className="h-4 w-4 text-slate-400" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "RESTOCK":
        return "Restock";
      case "CONSUME":
        return "Consumption";
      case "ADJUST":
        return "Adjustment";
      case "REVERSAL":
        return "Reversal";
      case "CREATE":
        return "Created";
      case "DELETE":
        return "Deleted";
      default:
        return type;
    }
  };

  /**
   * Determine if the Undo button should show for a movement.
   * Only RESTOCK movements that are NOT reversed and are the most
   * recent movement for their ingredient can be undone.
   */
  const canUndo = (movement: InventoryMovement): boolean => {
    if (movement.is_reversed) return false;
    if (movement.movement_type === "REVERSAL") return false;
    // Only allow undo on RESTOCK (could extend to ADJUST later)
    if (movement.movement_type !== "RESTOCK") return false;

    // Check if there are subsequent movements for the same ingredient
    const hasSubsequent = movements.some(
      (m) =>
        m.ingredient_id === movement.ingredient_id &&
        new Date(m.created_at) > new Date(movement.created_at) &&
        m.id !== movement.id
    );

    return !hasSubsequent;
  };

  if (movements.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
        <p className="text-slate-500">No inventory movements found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead className="w-[180px]">Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Ingredient</TableHead>
            <TableHead>Qty Change</TableHead>
            <TableHead>Value (TND)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => (
            <TableRow
              key={movement.id}
              className={
                movement.is_reversed
                  ? "bg-slate-50/50 opacity-60"
                  : movement.movement_type === "REVERSAL"
                    ? "bg-red-50/30"
                    : ""
              }
            >
              <TableCell className="text-xs text-slate-500 font-mono">
                {format(new Date(movement.created_at), "dd MMM yyyy, HH:mm")}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getTypeIcon(movement.movement_type)}
                  <span className="text-sm font-medium text-slate-700">
                    {getTypeLabel(movement.movement_type)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-medium text-slate-900">
                {movement.ingredient_name ?? "—"}
              </TableCell>
              <TableCell>
                <span
                  className={`text-sm font-bold ${
                    movement.qty_change > 0
                      ? "text-green-600"
                      : movement.qty_change < 0
                        ? "text-red-600"
                        : "text-slate-500"
                  }`}
                >
                  {movement.qty_change > 0 ? "+" : ""}
                  {formatQuantity(movement.qty_change, "")}
                </span>
              </TableCell>
              <TableCell>
                <span
                  className={`text-sm font-medium ${
                    movement.amount_tnd_delta > 0
                      ? "text-green-600"
                      : movement.amount_tnd_delta < 0
                        ? "text-red-600"
                        : "text-slate-500"
                  }`}
                >
                  {movement.amount_tnd_delta > 0 ? "+" : ""}
                  {Number(movement.amount_tnd_delta).toFixed(3)} TND
                </span>
              </TableCell>
              <TableCell>
                {movement.is_reversed && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-600">
                    Reversed
                  </span>
                )}
                {movement.movement_type === "REVERSAL" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                    ↩ Reversal
                  </span>
                )}
              </TableCell>
              <TableCell className="text-center">
                {canUndo(movement) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    onClick={() => onUndo(movement.id)}
                    disabled={undoing === movement.id}
                  >
                    {undoing === movement.id ? (
                      <span className="flex items-center gap-1">
                        <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                        Undoing…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Undo2 className="h-3.5 w-3.5" />
                        Undo
                      </span>
                    )}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
