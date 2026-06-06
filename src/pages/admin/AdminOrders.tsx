import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, buildWhatsAppLink } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageCircle, Copy } from "lucide-react";

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Pendente", approved: "Aprovado", rejected: "Recusado",
  cancelled: "Cancelado", refunded: "Estornado", chargeback: "Chargeback",
};
const FULFILL_LABEL: Record<string, string> = {
  unfulfilled: "Não iniciado", picking: "Separando", packed: "Embalado",
  shipped: "Despachado", delivered: "Entregue", cancelled: "Cancelado",
};


const STATUSES = [
  "novo", "em_atendimento", "aguardando_pagamento", "separando",
  "saiu_para_entrega", "retirado", "finalizado", "cancelado",
];
const LABEL: Record<string, string> = {
  novo: "Novo", em_atendimento: "Em atendimento", aguardando_pagamento: "Aguardando pagamento",
  separando: "Separando", saiu_para_entrega: "Saiu para entrega", retirado: "Retirado",
  finalizado: "Finalizado", cancelado: "Cancelado",
};

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

  const orderMessage = (o: any) => {
    const items = (o.order_items || []).map((it: any) => `• ${it.quantity}x ${it.product_name} - ${formatBRL(it.unit_price * it.quantity)}`).join("\n");
    return `Olá ${o.customer_name}, sobre seu pedido:\n\n${items}\n\nTotal: ${formatBRL(o.total)}\n${o.delivery_method === "pickup" ? "Retirada na loja" : `Entrega: ${o.customer_address}`}`;
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-extrabold mb-6">Pedidos</h1>
      <div className="bg-card border rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr>
            <th className="p-3">#</th><th className="p-3">Data</th><th className="p-3">Cliente</th>
            <th className="p-3">Tipo</th><th className="p-3">Total</th>
            <th className="p-3">Pagamento</th><th className="p-3">Separação</th>
            <th className="p-3">Status</th><th></th>
          </tr></thead>
          <tbody>
            {data?.map((o: any) => (
              <tr key={o.id} className="border-t">
                <td className="p-3 text-xs font-mono">{o.id.slice(0, 6)}</td>
                <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-medium">{o.customer_name}<div className="text-xs text-muted-foreground">{o.customer_phone}</div></td>
                <td className="p-3 text-xs">{o.delivery_method === "pickup" ? "Retirada" : "Entrega"}</td>
                <td className="p-3 price">{formatBRL(o.total)}</td>
                <td className="p-3"><Badge variant="secondary">{PAYMENT_LABEL[o.payment_status] || o.payment_status || "—"}</Badge></td>
                <td className="p-3"><Badge variant="outline">{FULFILL_LABEL[o.fulfillment_status] || o.fulfillment_status || "—"}</Badge></td>
                <td className="p-3">
                  <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                    <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{LABEL[s] || s}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => setView(o)}>Ver</Button></td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhum pedido ainda.</td></tr>}
          </tbody>

        </table>
      </div>
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Pedido #{view?.id?.slice(0, 6)}</DialogTitle></DialogHeader>
          {view && (
            <Tabs defaultValue="resumo">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="resumo" className="space-y-2 text-sm pt-3">
                <div><strong>Cliente:</strong> {view.customer_name}</div>
                <div><strong>Telefone:</strong> {view.customer_phone}</div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">Pgto: {PAYMENT_LABEL[view.payment_status] || view.payment_status}</Badge>
                  <Badge variant="outline">Separação: {FULFILL_LABEL[view.fulfillment_status] || view.fulfillment_status}</Badge>
                </div>
                <div><strong>Entrega:</strong> {view.delivery_method === "pickup" ? "Retirar na loja" : `Entrega - ${view.customer_address}`}</div>
                {view.notes && <div><strong>Obs:</strong> {view.notes}</div>}
                <div className="border-t pt-2 mt-2">
                  {view.order_items?.map((it: any) => (
                    <div key={it.id} className="flex justify-between"><span>{it.quantity}x {it.product_name}</span><span>{formatBRL(it.unit_price * it.quantity)}</span></div>
                  ))}
                </div>
                <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span className="price">{formatBRL(view.total)}</span></div>
                <div className="flex gap-2 pt-3 border-t">
                  <Button className="flex-1 bg-whatsapp hover:bg-whatsapp/90 text-white" asChild>
                    <a href={buildWhatsAppLink(view.customer_phone, orderMessage(view))} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-2" />WhatsApp</a>
                  </Button>
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(orderMessage(view)); toast.success("Mensagem copiada"); }}>
                    <Copy className="h-4 w-4 mr-2" />Copiar
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="historico" className="pt-3">
                <OrderHistory orderId={view.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
