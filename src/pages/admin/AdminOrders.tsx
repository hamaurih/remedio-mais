import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/store";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STATUSES = ["novo", "em_preparo", "pronto", "entregue", "cancelado"];

export default function AdminOrders() {
  const qc = useQueryClient();
  const [view, setView] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ["admin_orders"],
    queryFn: async () => (await supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false })).data || [],
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["admin_orders"] }); }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-extrabold mb-6">Pedidos</h1>
      <div className="bg-card border rounded-xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr><th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Telefone</th><th className="p-3">Total</th><th className="p-3">Status</th><th></th></tr></thead>
          <tbody>
            {data?.map((o: any) => (
              <tr key={o.id} className="border-t">
                <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-medium">{o.customer_name}</td>
                <td className="p-3">{o.customer_phone}</td>
                <td className="p-3 price">{formatBRL(o.total)}</td>
                <td className="p-3">
                  <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                    <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => setView(o)}>Ver</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pedido</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-2 text-sm">
              <div><strong>Cliente:</strong> {view.customer_name}</div>
              <div><strong>Telefone:</strong> {view.customer_phone}</div>
              <div><strong>Entrega:</strong> {view.delivery_method === "pickup" ? "Retirar na loja" : `Entrega - ${view.customer_address}`}</div>
              <div className="border-t pt-2 mt-2">
                {view.order_items?.map((it: any) => (
                  <div key={it.id} className="flex justify-between"><span>{it.quantity}x {it.product_name}</span><span>{formatBRL(it.unit_price * it.quantity)}</span></div>
                ))}
              </div>
              <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span className="price">{formatBRL(view.total)}</span></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
