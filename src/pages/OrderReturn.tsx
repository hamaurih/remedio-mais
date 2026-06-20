import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/store";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";

type Status = "success" | "pending" | "failure";

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
      await supabase.functions.invoke("check-mercado-pago-status", { body: { order_id: orderId } });
    } catch {}
    const { data } = await supabase.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
    setOrder(data);
    const { data: evs } = await supabase.from("order_events").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
    setEvents(evs || []);
    setLoading(false);
  };

  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
    if (!orderId) return;
    const ch = supabase
      .channel(`order_${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_events", filter: `order_id=eq.${orderId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const isPaid = order?.payment_status === "approved";
  const effective: Status = isPaid ? "success" : status;

  const icon = effective === "success" ? <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
    : effective === "pending" ? <Clock className="h-14 w-14 text-amber-500 mx-auto" />
    : <XCircle className="h-14 w-14 text-destructive mx-auto" />;
  const title = effective === "success" ? "Pagamento aprovado!"
    : effective === "pending" ? "Pagamento em análise"
    : "Pagamento não aprovado";

  return (
    <Layout>
      <div className="container py-10 max-w-xl">
        <div className="bg-card border rounded-xl p-6 shadow-card text-center space-y-4">
          {icon}
          <h1 className="text-2xl font-extrabold">{title}</h1>

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
