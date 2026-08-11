import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/store";
import { trackPurchase } from "@/lib/metaEvents";
import { CheckCircle2, Clock, XCircle, Loader2, Package, Truck, Store } from "lucide-react";

type Status = "success" | "pending" | "failure";

const STATUS_LABEL: Record<string, string> = {
  novo: "Pedido recebido", em_atendimento: "Em atendimento", aguardando_pagamento: "Aguardando pagamento",
  aprovado: "Pagamento aprovado", em_separacao: "Em separação", indisponivel: "Item indisponível",
  pronto_retirada: "Pronto para retirada", saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue", retirado: "Retirado", finalizado: "Concluído",
  reembolso_pendente: "Reembolso em análise", reembolsado: "Reembolsado", cancelado: "Cancelado",
  approved: "Pagamento aprovado", pending: "Pagamento pendente", rejected: "Pagamento recusado",
  refunded: "Estornado", partially_refunded: "Estornado parcialmente",
  picking: "Separando", packed: "Embalado", shipped: "Despachado", delivered: "Entregue",
};

function eventLabel(e: any) {
  if (e.type === "created") return "Pedido recebido";
  if (e.type === "refund_completed") return e.message || "Reembolso concluído";
  const s = e.new_status;
  return STATUS_LABEL[s] || e.message || s || e.type;
}

export default function OrderReturn({ status }: { status: Status }) {
  const loc = useLocation();
  const nav = useNavigate();
  const params = new URLSearchParams(loc.search);
  const orderId = params.get("order");
  const [order, setOrder] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      await supabase.functions.invoke("check-cielo-status", { body: { order_id: orderId } });
    } catch {
      // status opcional: segue com os dados já salvos
    }
    const { data } = await supabase.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
    setOrder(data);
    const { data: evs } = await supabase.from("order_events").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
    setEvents(evs || []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();  
    if (!orderId) return;
    const ch = supabase
      .channel(`order_${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_events", filter: `order_id=eq.${orderId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const isPaid = order?.payment_status === "approved";

  // Meta Purchase (browser) SOMENTE com pagamento aprovado. O mesmo event_id
  // (purchase:<order_id>) é usado pelo servidor, então a Meta deduplica.
  useEffect(() => {
    if (!isPaid || !order?.id) return;
    trackPurchase({
      id: order.id,
      total: Number(order.total ?? 0),
      items: (order.order_items || []).map((i: any) => ({
        id: String(i.product_id),
        quantity: Number(i.quantity) || 1,
        item_price: Number(i.unit_price) || 0,
      })),
    });
  }, [isPaid, order?.id]);
  const effective: Status = isPaid ? "success" : status;

  const icon = effective === "success" ? <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
    : effective === "pending" ? <Clock className="h-14 w-14 text-amber-500 mx-auto" />
    : <XCircle className="h-14 w-14 text-destructive mx-auto" />;
  const title = effective === "success" ? "Pagamento aprovado!"
    : effective === "pending" ? "Pagamento em análise"
    : "Pagamento não aprovado";

  const isPickup = order?.delivery_type === "pickup";

  return (
    <Layout>
      <div className="container py-10 max-w-xl">
        <div className="bg-card border rounded-xl p-6 shadow-card text-center space-y-4">
          {icon}
          <h1 className="text-2xl font-extrabold">{title}</h1>

          {effective === "success" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 p-4 text-left flex gap-3 items-start">
              <Package className="h-6 w-6 text-emerald-700 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-bold mb-1">Seu pedido já está sendo preparado! 🎉</div>
                <p className="leading-relaxed">
                  Recebemos seu pagamento e nossa equipe está separando seus produtos com todo cuidado.
                  {isPickup
                    ? " Avisaremos assim que estiver pronto para retirada na loja."
                    : " Em breve seu pedido será despachado para entrega no endereço informado."}
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs font-medium text-emerald-800">
                  {isPickup ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                  <span>{isPickup ? "Retirada na loja" : "Entrega em domicílio"}</span>
                </div>
              </div>
            </div>
          )}

          {loading && <Loader2 className="h-5 w-5 animate-spin mx-auto" />}

          {order && (
            <div className="text-left text-sm border-t pt-4 space-y-2">
              <div><strong>Pedido:</strong> #{String(order.id).slice(0, 8)}</div>
              <div><strong>Cliente:</strong> {order.customer_name}</div>
              <div><strong>Entrega:</strong> {order.delivery_type === "pickup" ? "Retirar na loja" : `Entrega - ${order.delivery_street}, ${order.delivery_number}`}</div>
              <div className="border-t pt-2">
                {order.order_items?.map((it: any) => (
                  <div key={it.id} className="flex justify-between"><span>{it.quantity}x {it.product_name}</span><span>{formatBRL(Number(it.unit_price) * it.quantity)}</span></div>
                ))}
              </div>
              <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span className="text-primary">{formatBRL(Number(order.total))}</span></div>
            </div>
          )}

          {order && events.length > 0 && (
            <div className="text-left border-t pt-4">
              <div className="text-sm font-semibold mb-2">Acompanhamento do pedido</div>
              <ol className="space-y-2">
                {events.filter((e) => ["created", "order_status", "payment_status", "fulfillment_status", "delivery_status", "refund_completed"].includes(e.type)).map((e) => (
                  <li key={e.id} className="flex gap-3 text-xs">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">{eventLabel(e)}</div>
                      <div className="text-muted-foreground text-[10px]">{new Date(e.created_at).toLocaleString("pt-BR")}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            {effective === "pending" && (
              <Button onClick={refresh} variant="outline" className="flex-1">Verificar novamente</Button>
            )}
            {effective === "failure" && order?.mercado_pago_checkout_url && (
              <Button asChild className="flex-1"><a href={order.mercado_pago_checkout_url}>Tentar pagar novamente</a></Button>
            )}
            <Button asChild className="flex-1" variant={effective === "success" ? "default" : "outline"}>
              <Link to="/">Voltar à loja</Link>
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
