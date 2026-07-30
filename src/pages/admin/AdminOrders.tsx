import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, buildWhatsAppLink } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageCircle, Copy, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { RefundPanel } from "@/components/admin/RefundPanel";

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Pendente", approved: "Aprovado", rejected: "Recusado",
  cancelled: "Cancelado", refunded: "Estornado", chargeback: "Chargeback",
  partially_refunded: "Estorno parcial",
};
const FULFILL_LABEL: Record<string, string> = {
  unfulfilled: "Não iniciado", picking: "Separando", packed: "Embalado",
  shipped: "Despachado", delivered: "Entregue", cancelled: "Cancelado",
};

const STATUSES = [
  "novo", "em_atendimento", "aguardando_pagamento", "aprovado", "em_separacao",
  "indisponivel", "pronto_retirada", "saiu_para_entrega", "entregue", "retirado",
  "finalizado", "reembolso_pendente", "reembolsado", "cancelado",
];
const LABEL: Record<string, string> = {
  novo: "Novo", em_atendimento: "Em atendimento", aguardando_pagamento: "Aguardando pagamento",
  aprovado: "Aprovado", em_separacao: "Em separação", indisponivel: "Indisponível",
  pronto_retirada: "Pronto p/ retirada", saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue", retirado: "Retirado", finalizado: "Finalizado",
  reembolso_pendente: "Reembolso pendente", reembolsado: "Reembolsado", cancelado: "Cancelado",
};

const ITEM_STATUSES = [
  { v: "disponivel", l: "Disponível" },
  { v: "separado", l: "Separado" },
  { v: "indisponivel", l: "Indisponível" },
  { v: "substituir", l: "Substituir" },
  { v: "removido", l: "Removido" },
];
const ITEM_BADGE: Record<string, string> = {
  disponivel: "bg-muted text-foreground",
  separado: "bg-green-100 text-green-800",
  indisponivel: "bg-red-100 text-red-800",
  substituir: "bg-amber-100 text-amber-800",
  removido: "bg-zinc-200 text-zinc-700",
};

const TABS: Array<{ key: string; label: string; match: (o: any) => boolean }> = [
  { key: "todos", label: "Todos", match: () => true },
  { key: "novo", label: "Novos", match: (o) => o.status === "novo" },
  { key: "aprovado", label: "Aprovados", match: (o) => o.status === "aprovado" || o.payment_status === "approved" },
  { key: "em_separacao", label: "Em separação", match: (o) => o.status === "em_separacao" || o.fulfillment_status === "picking" },
  { key: "indisponivel", label: "Indisponível", match: (o) => o.status === "indisponivel" },
  { key: "pronto_retirada", label: "Pronto retirada", match: (o) => o.status === "pronto_retirada" },
  { key: "saiu_para_entrega", label: "Enviado", match: (o) => o.status === "saiu_para_entrega" || o.fulfillment_status === "shipped" },
  { key: "entregue", label: "Entregue", match: (o) => ["entregue", "retirado", "finalizado"].includes(o.status) || o.fulfillment_status === "delivered" },
  { key: "reembolso_pendente", label: "Reembolso pendente", match: (o) => o.status === "reembolso_pendente" || ["pending", "in_progress"].includes(o.refund_status_hint) },
  { key: "cancelado", label: "Cancelado", match: (o) => o.status === "cancelado" || o.payment_status === "cancelled" },
];

export default function AdminOrders() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [view, setView] = useState<any>(null);
  const [tab, setTab] = useState("todos");

  const { data } = useQuery({
    queryKey: ["admin_orders"],
    queryFn: async () => (await supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false })).data || [],
  });

  const updateStatus = async (id: string, status: string) => {
    const operationalPatch: Record<string, string> = { status };
    if (status === "em_separacao") operationalPatch.fulfillment_status = "picking";
    if (status === "pronto_retirada") {
      operationalPatch.fulfillment_status = "packed";
      operationalPatch.delivery_status = "ready_for_pickup";
    }
    if (status === "saiu_para_entrega") {
      operationalPatch.fulfillment_status = "shipped";
      operationalPatch.delivery_status = "out_for_delivery";
    }
    if (["entregue", "retirado", "finalizado"].includes(status)) {
      operationalPatch.fulfillment_status = "delivered";
      operationalPatch.delivery_status = "delivered";
    }
    if (status === "cancelado") {
      operationalPatch.fulfillment_status = "cancelled";
      operationalPatch.delivery_status = "cancelled";
    }
    const { error } = await supabase.from("orders").update(operationalPatch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["admin_orders"] }); }
  };

  const updateItemStatus = async (itemId: string, status: string) => {
    const { error } = await supabase.from("order_items").update({ item_status: status }).eq("id", itemId);
    if (error) toast.error(error.message);
    else {
      toast.success("Item atualizado");
      qc.invalidateQueries({ queryKey: ["admin_orders"] });
      if (view) {
        const refreshed = await supabase.from("orders").select("*, order_items(*)").eq("id", view.id).maybeSingle();
        if (refreshed.data) setView(refreshed.data);
      }
    }
  };

  const updateItemNotes = async (itemId: string, notes: string) => {
    const { error } = await supabase.from("order_items").update({ item_notes: notes }).eq("id", itemId);
    if (error) toast.error(error.message); else toast.success("Observação salva");
  };

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of TABS) out[t.key] = 0;
    (data || []).forEach((o: any) => TABS.forEach((t) => { if (t.match(o)) out[t.key]++; }));
    return out;
  }, [data]);

  const filtered = (data || []).filter((o: any) => TABS.find((t) => t.key === tab)!.match(o));

  const orderMessage = (o: any) => {
    const items = (o.order_items || [])
      .filter((it: any) => it.item_status !== "removido")
      .map((it: any) => `• ${it.quantity}x ${it.product_name} - ${formatBRL(it.unit_price * it.quantity)}`)
      .join("\n");
    return `Olá ${o.customer_name}, sobre seu pedido:\n\n${items}\n\nTotal: ${formatBRL(o.total)}\n${o.delivery_method === "pickup" ? "Retirada na loja" : `Entrega: ${o.customer_address}`}`;
  };

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-extrabold">Pedidos</h1>
        {!isAdmin && <Badge variant="outline">Visão vendedor</Badge>}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent"
            }`}
          >
            {t.label} <span className="opacity-70 ml-1">{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="bg-card border rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="p-3">#</th><th className="p-3">Data</th><th className="p-3">Cliente</th>
              <th className="p-3">Tipo</th>
              {isAdmin && <th className="p-3">Total</th>}
              {isAdmin && <th className="p-3">Pagamento</th>}
              <th className="p-3">Separação</th>
              <th className="p-3">Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o: any) => {
              const hasUnavailable = (o.order_items || []).some((it: any) => it.item_status === "indisponivel" || it.item_status === "substituir");
              return (
                <tr key={o.id} className="border-t">
                  <td className="p-3 text-xs font-mono">{o.id.slice(0, 6)}</td>
                  <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3 font-medium">
                    {o.customer_name}
                    <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                    {hasUnavailable && (
                      <div className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> item indisponível
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-xs">{o.delivery_method === "pickup" ? "Retirada" : "Entrega"}</td>
                  {isAdmin && <td className="p-3 price">{formatBRL(o.total)}</td>}
                  {isAdmin && (
                    <td className="p-3">
                      <Badge variant="secondary">{PAYMENT_LABEL[o.payment_status] || o.payment_status || "—"}</Badge>
                    </td>
                  )}
                  <td className="p-3"><Badge variant="outline">{FULFILL_LABEL[o.fulfillment_status] || o.fulfillment_status || "—"}</Badge></td>
                  <td className="p-3">
                    <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                      <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{LABEL[s] || s}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setView(o)}>Ver</Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={isAdmin ? 9 : 7} className="p-8 text-center text-muted-foreground">Nenhum pedido neste filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Pedido #{view?.id?.slice(0, 6)}</DialogTitle></DialogHeader>
          {view && (
            <Tabs defaultValue="separacao">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="separacao">Separação</TabsTrigger>
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="reembolso">Reembolso</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="separacao" className="pt-3 space-y-2">
                <div className="text-xs text-muted-foreground mb-2">Marque o status de cada item conforme separar o pedido.</div>
                {view.order_items?.map((it: any) => (
                  <ItemRow key={it.id} item={it} onStatus={updateItemStatus} onNotes={updateItemNotes} />
                ))}
              </TabsContent>

              <TabsContent value="resumo" className="space-y-2 text-sm pt-3">
                <div><strong>Cliente:</strong> {view.customer_name}</div>
                <div><strong>Telefone:</strong> {view.customer_phone}</div>
                {isAdmin && (
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">Pgto: {PAYMENT_LABEL[view.payment_status] || view.payment_status}</Badge>
                    <Badge variant="outline">Separação: {FULFILL_LABEL[view.fulfillment_status] || view.fulfillment_status}</Badge>
                  </div>
                )}
                <div><strong>Entrega:</strong> {view.delivery_method === "pickup" ? "Retirar na loja" : `Entrega - ${view.customer_address}`}</div>
                {view.notes && <div><strong>Obs:</strong> {view.notes}</div>}
                <div className="border-t pt-2 mt-2">
                  {view.order_items?.map((it: any) => (
                    <div key={it.id} className="flex justify-between">
                      <span>{it.quantity}x {it.product_name}</span>
                      {isAdmin && <span>{formatBRL(it.unit_price * it.quantity)}</span>}
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span className="price">{formatBRL(view.total)}</span></div>
                )}
                <div className="flex gap-2 pt-3 border-t">
                  <Button className="flex-1 bg-whatsapp hover:bg-whatsapp/90 text-white" asChild>
                    <a href={buildWhatsAppLink(view.customer_phone, orderMessage(view))} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4 mr-2" />WhatsApp
                    </a>
                  </Button>
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(orderMessage(view)); toast.success("Mensagem copiada"); }}>
                    <Copy className="h-4 w-4 mr-2" />Copiar
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="reembolso">
                <RefundPanel order={view} />
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

function ItemRow({ item, onStatus, onNotes }: { item: any; onStatus: (id: string, s: string) => void; onNotes: (id: string, n: string) => void }) {
  const [notes, setNotes] = useState(item.item_notes || "");
  const status = item.item_status || "disponivel";
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-start gap-3">
        {item.product_image_url && (
          <img src={item.product_image_url} alt="" className="w-12 h-12 rounded object-cover border" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{item.quantity}x {item.product_name}</div>
          {item.variant_label && <div className="text-xs text-muted-foreground">{item.variant_label}</div>}
        </div>
        <Badge className={`text-[10px] ${ITEM_BADGE[status] || ""}`} variant="outline">
          {ITEM_STATUSES.find((s) => s.v === status)?.l || status}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {ITEM_STATUSES.map((s) => (
          <button
            key={s.v}
            onClick={() => onStatus(item.id, s.v)}
            className={`px-2 py-1 rounded text-[11px] font-medium border ${
              status === s.v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            }`}
          >
            {s.l}
          </button>
        ))}
      </div>
      {(status === "indisponivel" || status === "substituir" || notes) && (
        <div className="mt-2 flex gap-2">
          <Textarea
            placeholder="Observação (ex: marca alternativa, motivo da indisponibilidade)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-xs"
          />
          <Button size="sm" variant="outline" onClick={() => onNotes(item.id, notes)}>Salvar</Button>
        </div>
      )}
    </div>
  );
}

function OrderHistory({ orderId }: { orderId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["order_events", orderId],
    queryFn: async () => (await supabase.from("order_events").select("*").eq("order_id", orderId).order("created_at", { ascending: false })).data || [],
  });
  if (isLoading) return <div className="text-xs text-muted-foreground">Carregando...</div>;
  if (!data?.length) return <div className="text-xs text-muted-foreground">Sem eventos registrados.</div>;
  return (
    <div className="space-y-2 max-h-80 overflow-auto">
      {data.map((e: any) => (
        <div key={e.id} className="text-xs border rounded p-2">
          <div className="flex justify-between">
            <span className="font-semibold">{e.type}</span>
            <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</span>
          </div>
          {(e.old_status || e.new_status) && (
            <div className="text-muted-foreground">{e.old_status || "—"} → <strong>{e.new_status || "—"}</strong></div>
          )}
          {e.message && <div>{e.message}</div>}
        </div>
      ))}
    </div>
  );
}
