import { Link } from "react-router-dom";
import {
  Package, ShoppingBag, FileText, AlertTriangle, CheckCircle2,
  DollarSign, TrendingUp, Boxes, Activity, Barcode,
} from "lucide-react";
import { format } from "date-fns";
import { formatBRL } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminDashboardCharts } from "@/components/admin/dashboard/AdminDashboardCharts";
import {
  ADMIN_DASHBOARD_RANGES,
  useAdminDashboardData,
} from "@/hooks/admin/useAdminDashboardData";

export default function AdminDashboard() {
  const {
    rangeKey,
    setRangeKey,
    days,
    kpis,
    series,
    topProducts,
    catalog,
    lowStock,
    recentOrders,
  } = useAdminDashboardData();
  const k = kpis.data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Painel BI</h1>
          <p className="text-sm text-muted-foreground">Visão executiva: vendas, catálogo, estoque e operação.</p>
        </div>
        <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg">
          {ADMIN_DASHBOARD_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                rangeKey === r.key ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label={`Receita (${days}d)`}
          value={formatBRL(k?.revenueRange ?? 0)}
          hint={`Total acumulado pago: ${formatBRL(k?.revenuePaid ?? 0)}`}
          accent
        />
        <KpiCard
          icon={ShoppingBag}
          label={`Pedidos (${days}d)`}
          value={k?.ordersInRange ?? "—"}
          hint={`${k?.ordersPaid ?? 0} pagos · ${k?.ordersPending ?? 0} pendentes`}
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket médio"
          value={formatBRL(k?.ticket ?? 0)}
          hint={k?.ordersPaid ? `base ${k.ordersPaid} pedidos pagos` : "ainda sem vendas"}
        />
        <KpiCard
          icon={FileText}
          label="Receitas pendentes"
          value={k?.prescPending ?? "—"}
          hint={`${k?.presc ?? 0} no total`}
          warn={(k?.prescPending ?? 0) > 0}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Boxes} label="Valor em estoque" value={formatBRL(k?.stockValue ?? 0)} hint="ativos · stock × preço" />
        <KpiCard icon={Package} label="Catálogo ativo" value={k?.prodActive ?? "—"} hint={`${k?.prodAll ?? 0} cadastrados`} />
        <KpiCard
          icon={Barcode}
          label="Sem EAN c/ estoque"
          value={k?.prodNoEANStock ?? "—"}
          hint={`${k?.prodNoEAN ?? 0} sem EAN no total`}
          warn={(k?.prodNoEANStock ?? 0) > 0}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Estoque baixo"
          value={k?.prodLow ?? "—"}
          hint="≤ 5 unidades · ativos"
          warn={(k?.prodLow ?? 0) > 0}
        />
      </div>

      <AdminDashboardCharts
        days={days}
        series={series.data}
        topProducts={topProducts.data}
        catalog={catalog.data}
        paymentStatus={k ? {
          paid: k.ordersPaid,
          pending: k.ordersPending,
          cancelled: k.ordersCancelled,
        } : undefined}
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Últimos pedidos</CardTitle>
            <Button asChild size="sm" variant="ghost"><Link to="/admin/pedidos">Ver todos</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentOrders.data?.length ? recentOrders.data.map((o: any) => (
              <div key={o.id} className="flex justify-between items-center border-b last:border-0 pb-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{o.customer_name || "Cliente"}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(o.created_at), "dd/MM HH:mm")}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatBRL(o.total)}</div>
                  <Badge variant={o.payment_status === "approved" ? "default" : "outline"} className="text-[10px]">
                    {o.payment_status || "—"}
                  </Badge>
                </div>
              </div>
            )) : <div className="text-xs text-muted-foreground py-6 text-center">Nenhum pedido ainda.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex gap-2 items-center"><AlertTriangle className="h-4 w-4 text-primary" /> Estoque crítico</CardTitle>
            <Button asChild size="sm" variant="ghost"><Link to="/admin/estoque">Gerenciar</Link></Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {lowStock.data?.length ? lowStock.data.map((p: any) => (
              <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span className="truncate pr-2">{p.name}</span>
                <span className={`font-bold tabular-nums ${p.stock <= 0 ? "text-destructive" : "text-amber-600"}`}>{p.stock}</span>
              </div>
            )) : <div className="text-xs text-muted-foreground py-6 text-center">Tudo ok.</div>}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader><CardTitle className="text-base flex gap-2 items-center"><Activity className="h-4 w-4 text-primary" /> Saúde da operação</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <HealthRow label="Sincronizações Trier (período)" value={k?.syncRecent ?? 0} ok={(k?.syncRecent ?? 0) > 0} />
            <HealthRow label="Produtos sem EAN" value={k?.prodNoEAN ?? 0} ok={(k?.prodNoEAN ?? 0) === 0} bad={(k?.prodNoEAN ?? 0) > 500} />
            <HealthRow label="Em oferta" value={k?.prodSale ?? 0} ok={(k?.prodSale ?? 0) > 0} />
            <HealthRow label="Clientes cadastrados" value={k?.customers ?? 0} ok={(k?.customers ?? 0) > 0} />
            <div className="pt-2 grid grid-cols-2 gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/admin/produtos">Produtos</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/admin/integrations/trier">Trier</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/admin/ofertas">Ofertas</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/admin/diagnostico-home">Diagnóstico</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, hint, accent, warn,
}: { icon: any; label: string; value: any; hint?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 shadow-card transition-all hover:shadow-lg ${
      accent ? "bg-gradient-to-br from-primary/10 via-card to-card border-primary/30" :
      warn ? "border-amber-500/40 bg-amber-50/40" : "bg-card"
    }`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
        <Icon className={`h-4 w-4 ${accent ? "text-primary" : warn ? "text-amber-600" : "text-muted-foreground"}`} />
      </div>
      <div className={`text-3xl font-extrabold mt-2 tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function HealthRow({ label, value, ok, bad }: { label: string; value: number; ok?: boolean; bad?: boolean }) {
  const color = bad ? "text-destructive" : ok ? "text-emerald-600" : "text-muted-foreground";
  const Dot = bad ? AlertTriangle : ok ? CheckCircle2 : Activity;
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold tabular-nums flex items-center gap-1 ${color}`}>
        <Dot className="h-3.5 w-3.5" /> {value}
      </span>
    </div>
  );
}
