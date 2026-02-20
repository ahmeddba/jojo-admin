import { format } from "date-fns";
import { StockAudit } from "@/lib/database.types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Package, Truck, AlertTriangle, Trash2, PlusCircle, Edit } from "lucide-react";
import { formatQuantity } from "@/lib/utils";

interface StockHistoryProps {
  audits: StockAudit[];
}

export function StockHistory({ audits }: StockHistoryProps) {
  const getActionIcon = (type: string) => {
    switch (type) {
      case "RESTOCK": return <Truck className="h-4 w-4 text-green-600" />;
      case "CONSUME": return <Package className="h-4 w-4 text-slate-500" />;
      case "ADJUST": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "DELETE": return <Trash2 className="h-4 w-4 text-red-500" />;
      case "CREATE": return <PlusCircle className="h-4 w-4 text-blue-500" />;
      case "UPDATE": return <Edit className="h-4 w-4 text-indigo-500" />;
      default: return null;
    }
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case "RESTOCK": return "Restock";
      case "CONSUME": return "Consumption";
      case "ADJUST": return "Adjustment";
      case "DELETE": return "Deleted";
      case "CREATE": return "Created";
      case "UPDATE": return "Updated";
      default: return type;
    }
  };

  if (audits.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
        <p className="text-slate-500">No stock history found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead className="w-[180px]">Date</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Ingredient</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Quantity After</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {audits.map((audit) => (
            <TableRow key={audit.id}>
              <TableCell className="text-xs text-slate-500 font-mono">
                {format(new Date(audit.created_at), "dd MMM yyyy, HH:mm")}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getActionIcon(audit.action_type)}
                  <span className="text-sm font-medium text-slate-700">{getActionLabel(audit.action_type)}</span>
                </div>
              </TableCell>
              <TableCell className="font-medium text-slate-900">
                {audit.ingredient_name}
              </TableCell>
              <TableCell>
                <span className={`text-sm font-bold ${
                  audit.qty_change > 0 ? "text-green-600" : 
                  audit.qty_change < 0 ? "text-red-600" : "text-slate-500"
                }`}>
                  {audit.qty_change > 0 ? "+" : ""}
                  {formatQuantity(audit.qty_change, "")}
                </span>
              </TableCell>
              <TableCell className="text-slate-500">
                 {formatQuantity(audit.qty_after, "")}
              </TableCell>
              <TableCell className="text-xs text-slate-500 max-w-[200px]">
                {(() => {
                  const info = audit.supplier_info as { name?: string; invoice_number?: string } | null;
                  return (
                    info && (
                      <div className="space-y-1">
                        {info.name && (
                          <p><span className="font-semibold">Supplier:</span> {info.name}</p>
                        )}
                        {info.invoice_number && (
                          <p><span className="font-semibold">Inv #:</span> {info.invoice_number}</p>
                        )}
                      </div>
                    )
                  );
                })()}
                {audit.action_type === 'DELETE' && (
                    <span className="italic">Item deleted</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
