import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Bot, CheckCircle2, Clock3, MessageCircle, RefreshCw,
  ShieldCheck, ShoppingBag, TrendingUp, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/store";

type AiOrder = {
  id: string;
  order_code: string | null;
  created_at: string;
  customer_name: string | null;
  total: number | null;
  payment_status: string | null;
  order_status: string | null;
  status: string | null;
  source: string | null;
  sales_channel: string | null;
  trier_eligible: boolean | null;
  seller_notification_status: string | null;
  seller_notified_at: string | null;
  trier_sent: boolean | null;
};

const ranges = [
  { key: 7, label: "7 dias" },
  { key: 30, label: "30 dias" },
  { key: 90, label: "90 dias" },
];

export default function AdminAISales() {
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ["admin-ai-sales", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const db = supabase as any;
      const { data, error } = await db
        .from("orders")
        .select("id,order_code,created_at,customer_name,total,payment_status,order_status,status,source,sales_channel,trier_eligible,seller_notification_status,seller_notified_at,trier_sent")
        .or("source.eq.ia,sales_channel.eq.whatsapp")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as AiOrder[];
    },
    refetchInterval: 60_000,
  });

  const orders = query.data || [];
  const metrics = useMemo(() => {
    const paid = orders.filter((o) => o.payment_status === "approved");
    const total = paid.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const completed = orders.filter((o) => ["entregue", "concluido"].includes(String(o.order_status || "").toLowerCase()) || String(o.status || "").toLowerCase() === "finalizado");
    const cancelled = orders.filter((o) => ["cancelado", "cancelled"].includes(String(o.order_status || "").toLowerCase()) || ["cancelado", "cancelled"].includes(String(o.status || "").toLowerCase()));
    const notified = orders.filter((o) => o.seller_notification_status === "sent");
    const pendingNotification = orders.filter((o) => o.seller_notification_status === "pending");
    const blocked = orders.filter((o) => o.trier_eligible === false);
    return {
      count: orders.length,
      total,
      ticket: paid.length ? total / paid.length : 0,
      completed: completed.length,
      cancelled: cancelled.length,
      notified: notified.length,
      pendingNotification: pendingNotification.length,
      blocked: blocked.length,
    };
  }, [orders]);

  return (
    <div className="min-h-full bg-muted/20">
      <div className="max-w-[1480px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Button asChild variant="ghost" size="sm" className="px-0 mb-2">
              <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" />Voltar ao início</Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center"><Bot className="h-6 w-6" /></div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">Gestão de vendas por IA</h1>
                <p className="text-sm text-muted-foreground">Acompanhe pedidos originados pelo WhatsApp/IA e a atuação dos vendedores.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg">
              {ranges.map((range) => (
                <button key={range.key} onClick={() => setDays(range.key)} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${days === range.key ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {range.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon" onClick={() => query.refetch()} aria-label="Atualizar"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>
          </div>
        </div>

        {query.error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar as vendas da IA. Atualize a página ou verifique as permissões do usuário.</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric icon={ShoppingBag} label="Pedidos IA" value={String(metrics.count)} hint={`últimos ${days} dias`} />
          <Metric icon={TrendingUp} label="Faturamento" value={formatBRL(metrics.total)} hint={`${metrics.count} pedidos encontrados`} accent />
          <Metric icon={MessageCircle} label="Ticket médio" value={formatBRL(metrics.ticket)} hint="somente pedidos pagos" />
          <Metric icon={ShieldCheck} label="Bloqueados no Trier" value={String(metrics.blocked)} hint="proteção ativa" safe />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric icon={CheckCircle2} label="Notificados" value={String(metrics.notified)} hint="vendedores avisados" safe />
          <Metric icon={Clock3} label="Aguardando aviso" value={String(metrics.pendingNotification)} hint="fila interna" warn={metrics.pendingNotification > 0} />
          <Metric icon={CheckCircle2} label="Concluídos" value={String(metrics.completed)} hint="entregues/finalizados" />
          <Metric icon={XCircle} label="Cancelados" value={String(metrics.cancelled)} hint="no período" warn={metrics.cancelled > 0} />
        </div>

        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="p-5 flex flex-col md:flex-row md:items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="font-bold">Regra operacional ativa</div>
              <p className="text-sm text-muted-foreground mt-1">Pedidos criados pelo WhatsApp/IA são registrados no ERP, notificam a equipe e permanecem bloqueados para envio automático ao Trier.</p>
            </div>
            <Badge variant="secondary" className="w-fit">Proteção ativa</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="text-lg">Pedidos originados pela IA</CardTitle><p className="text-sm text-muted-foreground mt-1">Últimos pedidos do período selecionado.</p></div>
            <Badge variant="outline">{orders.length} registros</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {query.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Carregando vendas da IA...</div> : orders.length === 0 ? (
              <div className="p-10 text-center"><Bot className="h-10 w-10 mx-auto text-muted-foreground/50" /><p className="font-semibold mt-3">Nenhuma venda da IA no período.</p><p className="text-sm text-muted-foreground mt-1">Quando uma venda vier pelo WhatsApp, ela aparecerá aqui.</p></div>
            ) : (
              <div className="divide-y">
                {orders.map((order) => <AiOrderRow key={order.id} order={order} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AiOrderRow({ order }: { order: AiOrder }) {
  const notification = order.seller_notification_status === "sent";
  const blocked = order.trier_eligible === false;
  return (
    <div className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{order.order_code || `#${order.id.slice(0, 6)}`}</span>
          <Badge variant="secondary">WhatsApp/IA</Badge>
          {order.payment_status === "approved" && <Badge>Pago</Badge>}
        </div>
        <div className="text-sm mt-1 truncate">{order.customer_name || "Cliente não informado"}</div>
        <div className="text-xs text-muted-foreground mt-1">{new Date(order.created_at).toLocaleString("pt-BR")}</div>
      </div>
      <div className="flex items-center gap-6">
        <div><div className="text-xs text-muted-foreground">Total</div><div className="font-black">{formatBRL(Number(order.total || 0))}</div></div>
        <div><div className="text-xs text-muted-foreground">Vendedor</div><Badge variant={notification ? "default" : "outline"}>{notification ? "Notificado" : "Pendente"}</Badge></div>
        <div><div className="text-xs text-muted-foreground">Trier</div><Badge variant={blocked ? "destructive" : "outline"}>{blocked ? "Bloqueado" : order.trier_sent ? "Enviado" : "Não enviado"}</Badge></div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint, accent, warn, safe }: { icon: any; label: string; value: string; hint: string; accent?: boolean; warn?: boolean; safe?: boolean }) {
  return <div className={`rounded-xl border p-5 shadow-sm bg-card ${accent ? "border-primary/30 bg-primary/[0.03]" : warn ? "border-amber-500/40 bg-amber-50/40" : safe ? "border-emerald-500/30 bg-emerald-50/30" : ""}`}>
    <div className="flex items-center justify-between"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><Icon className={`h-4 w-4 ${safe ? "text-emerald-600" : warn ? "text-amber-600" : accent ? "text-primary" : "text-muted-foreground"}`} /></div>
    <div className="text-2xl font-black mt-2 tabular-nums">{value}</div><div className="text-xs text-muted-foreground mt-1">{hint}</div>
  </div>;
}
