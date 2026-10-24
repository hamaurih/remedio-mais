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
    <div className="mx-auto max-w-[1480px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm md:flex-row md:items-end md:justify-between md:p-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">BI Executivo</h1>
          <p className="mt-1 text-sm text-muted-foreground">Indicadores de vendas, estoque, catálogo e saúde operacional em uma única visão.</p>
        </div>
        <div className="flex w-fit gap-1 rounded-xl border bg-muted/40 p-1">
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
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

      <div className="grid gap-4 lg:grid-cols-3">
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
    <div className={`rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md md:p-5 ${
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
