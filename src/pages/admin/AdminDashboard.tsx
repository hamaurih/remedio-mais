import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Package, ShoppingBag, FileText, Tag, AlertTriangle, CheckCircle2,
  DollarSign, TrendingUp, Users, Boxes, Activity, Barcode, Percent, Layers,
} from "lucide-react";
import { formatBRL } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Legend,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const RANGES = [
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "365", label: "12 meses" },
] as const;

const PALETTE = ["hsl(var(--primary))", "#16a34a", "#f59e0b", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6", "#f43f5e"];

export default function AdminDashboard() {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("30");
  const days = Number(rangeKey);
  const since = useMemo(() => startOfDay(subDays(new Date(), days - 1)).toISOString(), [days]);

  const kpis = useQuery({
    queryKey: ["admin_bi_kpis", days],
    queryFn: async () => {
      const head = (q: any) => q.select("id", { count: "exact", head: true });
      const [
        prodAll, prodActive, prodLow, prodSale, prodNoEAN, prodNoEANStock,
        ordersAll, ordersPaid, ordersPending, ordersCancelled, ordersInRange,
        revenueAll, revenuePaid, revenueRange,
        customers, presc, prescPending,
        stockAgg, syncRecent,
      ] = await Promise.all([
        head(supabase.from("products")),
        head(supabase.from("products").eq("active", true)),
        head(supabase.from("products").lte("stock", 5).gt("stock", -9999).eq("active", true)),
        head(supabase.from("products").or("on_sale.eq.true,promo_price.not.is.null")),
        head(supabase.from("products").or("barcode.is.null,barcode.eq.")),
        head(supabase.from("products").or("barcode.is.null,barcode.eq.").gt("stock", 0)),
        head(supabase.from("orders")),
        head(supabase.from("orders").eq("payment_status", "approved")),
        head(supabase.from("orders").eq("payment_status", "pending")),
        head(supabase.from("orders").eq("payment_status", "cancelled")),
        head(supabase.from("orders").gte("created_at", since)),
        supabase.from("orders").select("total"),
        supabase.from("orders").select("total").eq("payment_status", "approved"),
        supabase.from("orders").select("total").eq("payment_status", "approved").gte("created_at", since),
        head(supabase.from("profiles")),
        head(supabase.from("prescriptions")),
        head(supabase.from("prescriptions").in("status", ["recebida", "pendente"])),
        supabase.from("products").select("stock,price").eq("active", true).gt("stock", 0),
        head(supabase.from("product_sync_logs").gte("created_at", since)),
      ]);

      const sum = (rows: any[] | null, key = "total") =>
        (rows || []).reduce((acc, r) => acc + Number(r[key] || 0), 0);
      const stockValue = (stockAgg.data || []).reduce(
        (a, r) => a + Number(r.stock || 0) * Number(r.price || 0),
        0,
      );

      return {
        prodAll: prodAll.count || 0,
        prodActive: prodActive.count || 0,
        prodLow: prodLow.count || 0,
        prodSale: prodSale.count || 0,
        prodNoEAN: prodNoEAN.count || 0,
        prodNoEANStock: prodNoEANStock.count || 0,
        ordersAll: ordersAll.count || 0,
        ordersPaid: ordersPaid.count || 0,
        ordersPending: ordersPending.count || 0,
        ordersCancelled: ordersCancelled.count || 0,
        ordersInRange: ordersInRange.count || 0,
        revenueAll: sum(revenueAll.data),
        revenuePaid: sum(revenuePaid.data),
        revenueRange: sum(revenueRange.data),
        ticket: ordersPaid.count ? sum(revenuePaid.data) / (ordersPaid.count || 1) : 0,
        customers: customers.count || 0,
        presc: presc.count || 0,
        prescPending: prescPending.count || 0,
        stockValue,
        syncRecent: syncRecent.count || 0,
      };
    },
  });

  const series = useQuery({
    queryKey: ["admin_bi_series", days],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("created_at,total,payment_status")
        .gte("created_at", since)
        .order("created_at");
      const buckets: Record<string, { date: string; receita: number; pedidos: number }> = {};
      for (let i = 0; i < days; i++) {
        const d = format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd");
        buckets[d] = { date: d, receita: 0, pedidos: 0 };
      }
      (data || []).forEach((o: any) => {
        const d = format(new Date(o.created_at), "yyyy-MM-dd");
        if (!buckets[d]) return;
        buckets[d].pedidos += 1;
        if (o.payment_status === "approved") buckets[d].receita += Number(o.total || 0);
      });
      return Object.values(buckets);
    },
  });

  const topProducts = useQuery({
    queryKey: ["admin_bi_top_products", days],
    queryFn: async () => {
      const { data: oids } = await supabase
        .from("orders")
        .select("id")
        .gte("created_at", since)
        .in("payment_status", ["approved", "pending"]);
      const ids = (oids || []).map((o: any) => o.id);
      if (!ids.length) return [] as any[];
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name,quantity,total")
        .in("order_id", ids);
      const map = new Map<string, { name: string; qtd: number; receita: number }>();
      (items || []).forEach((it: any) => {
        const k = it.product_name || "—";
        const cur = map.get(k) || { name: k, qtd: 0, receita: 0 };
        cur.qtd += Number(it.quantity || 0);
        cur.receita += Number(it.total || 0);
        map.set(k, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 10);
    },
  });

  const catalog = useQuery({
    queryKey: ["admin_bi_catalog"],
    queryFn: async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("category_id,stock,price,active")
        .eq("active", true);
      const { data: cats } = await supabase.from("categories").select("id,name");
      const map = new Map<string, { name: string; qtd: number; valor: number }>();
      (prods || []).forEach((p: any) => {
        const c = cats?.find((x: any) => x.id === p.category_id);
        const k = c?.name || "Sem categoria";
        const cur = map.get(k) || { name: k, qtd: 0, valor: 0 };
        cur.qtd += 1;
        cur.valor += Number(p.stock || 0) * Number(p.price || 0);
        map.set(k, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 10);
    },
  });

  const lowStock = useQuery({
    queryKey: ["admin_bi_low_stock"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,stock,minimum_stock,price")
        .eq("active", true)
        .lte("stock", 5)
        .order("stock")
        .limit(8);
      return data || [];
    },
  });

  const recentOrders = useQuery({
    queryKey: ["admin_bi_recent_orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,customer_name,total,payment_status,order_status,created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  const k = kpis.data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Painel BI</h1>
          <p className="text-sm text-muted-foreground">Visão executiva: vendas, catálogo, estoque e operação.</p>
        </div>
        <div className="flex gap-1 bg-secondary/60 p-1 rounded-lg">
          {RANGES.map((r) => (
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

      {/* HERO KPIs */}
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

      {/* SECONDARY KPIs */}
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

      {/* SALES CHART + STATUS DONUT */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Receita & Pedidos</CardTitle>
            <Badge variant="outline">{days} dias</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {series.data && series.data.some((d) => d.receita || d.pedidos) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series.data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => format(new Date(d), days > 90 ? "MMM" : "dd/MM", { locale: ptBR })}
                      fontSize={12}
                    />
                    <YAxis yAxisId="left" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} />
                    <Tooltip
                      formatter={(v: any, name) => name === "Receita" ? formatBRL(Number(v)) : v}
                      labelFormatter={(d) => format(new Date(d), "dd/MM/yyyy")}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="receita" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" dataKey="pedidos" name="Pedidos" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Ainda sem pedidos no período. O gráfico aparece automaticamente assim que entrarem vendas." />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Status de pagamento</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              {k && (k.ordersPaid + k.ordersPending + k.ordersCancelled) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      dataKey="value"
                      data={[
                        { name: "Pagos", value: k.ordersPaid },
                        { name: "Pendentes", value: k.ordersPending },
                        { name: "Cancelados", value: k.ordersCancelled },
                      ]}
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {["#16a34a", "#f59e0b", "#ef4444"].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Sem pedidos cadastrados ainda." />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TOP PRODUTOS + CATEGORIAS */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top 10 — Mais vendidos ({days}d)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-80">
              {topProducts.data && topProducts.data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts.data} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" fontSize={12} />
                    <YAxis dataKey="name" type="category" width={140} fontSize={11} tickFormatter={(v) => v.length > 22 ? v.slice(0, 22) + "…" : v} />
                    <Tooltip formatter={(v, n) => n === "receita" ? formatBRL(Number(v)) : v} />
                    <Bar dataKey="qtd" name="Quantidade" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Os campeões de venda aparecem aqui assim que houver pedidos pagos no período." />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Catálogo por categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="h-80">
              {catalog.data && catalog.data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={catalog.data} margin={{ bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" fontSize={11} angle={-30} textAnchor="end" interval={0} height={60} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(v, n) => n === "valor" ? formatBRL(Number(v)) : v} />
                    <Bar dataKey="qtd" name="Produtos" radius={[4, 4, 0, 0]}>
                      {catalog.data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Sem categorias ativas." />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OPERATIONAL LISTS */}
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
              <Button asChild size="sm" variant="outline"><Link to="/admin/trier">Trier</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/admin/ofertas">Ofertas</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/admin/home">Diagnóstico</Link></Button>
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

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-center text-sm text-muted-foreground px-6">
      {text}
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
