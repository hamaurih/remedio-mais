import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/store";
import { BarChart3, Boxes, Package, RefreshCw, TrendingUp } from "lucide-react";

type AbcRow = { productId: string | null; name: string; quantity: number; revenue: number; share: number; cumulative: number; abc: "A" | "B" | "C" };
const ranges = [30, 90, 180, 365];

export default function AdminCurveABC() {
  const [days, setDays] = useState(90);
  const [filter, setFilter] = useState<"ALL" | "A" | "B" | "C">("ALL");
  const query = useQuery({
    queryKey: ["curve-abc", days],
    queryFn: async () => {
      const since = new Date(Date.now() - (days - 1) * 86400000).toISOString();
      const db = supabase as any;
      const pageSize = 1000;
      let from = 0;
      const rows: any[] = [];
      while (true) {
        const { data, error } = await db.from("order_items").select("product_id,product_name,quantity,total,orders!inner(created_at,payment_status)").eq("orders.payment_status", "approved").gte("orders.created_at", since).range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
        if (from >= 100000) break;
      }
      const grouped = new Map<string, { productId: string | null; name: string; quantity: number; revenue: number }>();
      rows.forEach((item: any) => {
        const key = item.product_id || `name:${item.product_name || "Sem nome"}`;
        const current = grouped.get(key) || { productId: item.product_id || null, name: item.product_name || "Produto sem nome", quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity || 0);
        current.revenue += Number(item.total || 0);
        grouped.set(key, current);
      });
      const sorted = Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
      const totalRevenue = sorted.reduce((sum, r) => sum + r.revenue, 0);
      let running = 0;
      const classified: AbcRow[] = sorted.map((row) => {
        const share = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
        const before = running;
        running += share;
        const abc: "A" | "B" | "C" = before < 80 ? "A" : before < 95 ? "B" : "C";
        return { ...row, share, cumulative: running, abc };
      });
      return { rows: classified, totalRevenue, totalQuantity: classified.reduce((sum, r) => sum + r.quantity, 0), counts: { A: classified.filter(r => r.abc === "A").length, B: classified.filter(r => r.abc === "B").length, C: classified.filter(r => r.abc === "C").length } };
    },
  });
  const visible = useMemo(() => filter === "ALL" ? (query.data?.rows || []) : (query.data?.rows || []).filter(r => r.abc === filter), [query.data, filter]);

  return <div className="p-4 md:p-6 lg:p-8 max-w-[1480px] mx-auto space-y-6">
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div><div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.16em]"><BarChart3 className="h-4 w-4" /> Inteligência de estoque</div><h1 className="text-3xl font-black tracking-tight mt-1">Curva ABC</h1><p className="text-sm text-muted-foreground mt-1 max-w-2xl">Classificação automática dos produtos pelo faturamento acumulado: A concentra aproximadamente 80% da receita, B até 95% e C o restante.</p></div>
      <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
    </div>
    <div className="flex flex-wrap gap-2">{ranges.map(range => <Button key={range} variant={days === range ? "default" : "outline"} size="sm" onClick={() => setDays(range)}>{range === 365 ? "12 meses" : `${range} dias`}</Button>)}</div>
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Summary title="Faturamento analisado" value={formatBRL(query.data?.totalRevenue || 0)} icon={TrendingUp} className="col-span-2 lg:col-span-1" />
      <Summary title="Itens vendidos" value={(query.data?.totalQuantity || 0).toLocaleString("pt-BR")} icon={Boxes} />
      <Summary title="Classe A" value={String(query.data?.counts.A || 0)} icon={Package} tone="A" />
      <Summary title="Classe B" value={String(query.data?.counts.B || 0)} icon={Package} tone="B" />
      <Summary title="Classe C" value={String(query.data?.counts.C || 0)} icon={Package} tone="C" />
    </div>
    <Card className="rounded-2xl overflow-hidden"><CardHeader className="border-b"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><CardTitle>Produtos classificados</CardTitle><div className="flex gap-1">{(["ALL","A","B","C"] as const).map(value => <Button key={value} size="sm" variant={filter === value ? "default" : "ghost"} onClick={() => setFilter(value)}>{value === "ALL" ? "Todos" : value}</Button>)}</div></div></CardHeader><CardContent className="p-0">
      {query.isLoading ? <div className="p-10 text-center text-muted-foreground">Calculando Curva ABC...</div> : query.isError ? <div className="p-10 text-center text-destructive">Não foi possível calcular a Curva ABC.</div> : !visible.length ? <div className="p-10 text-center text-muted-foreground">Ainda não existem vendas aprovadas suficientes neste período.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="text-left px-4 py-3">#</th><th className="text-left px-4 py-3">Produto</th><th className="text-right px-4 py-3">Qtd.</th><th className="text-right px-4 py-3">Faturamento</th><th className="text-right px-4 py-3">Participação</th><th className="text-right px-4 py-3">Acumulado</th><th className="text-center px-4 py-3">Classe</th></tr></thead><tbody>{visible.slice(0,300).map((row,index) => <tr key={`${row.productId || row.name}-${index}`} className="border-t hover:bg-muted/20"><td className="px-4 py-3 text-muted-foreground">{index+1}</td><td className="px-4 py-3 font-semibold min-w-[260px]">{row.name}</td><td className="px-4 py-3 text-right">{row.quantity.toLocaleString("pt-BR")}</td><td className="px-4 py-3 text-right font-semibold">{formatBRL(row.revenue)}</td><td className="px-4 py-3 text-right">{row.share.toFixed(2)}%</td><td className="px-4 py-3 text-right">{row.cumulative.toFixed(2)}%</td><td className="px-4 py-3 text-center"><AbcBadge value={row.abc} /></td></tr>)}</tbody></table></div>}
    </CardContent></Card>
  </div>;
}

function Summary({ title, value, icon: Icon, tone, className = "" }: { title: string; value: string; icon: any; tone?: "A" | "B" | "C"; className?: string }) {
  const toneClass = tone === "A" ? "text-emerald-700 bg-emerald-500/10" : tone === "B" ? "text-amber-700 bg-amber-500/10" : tone === "C" ? "text-slate-600 bg-slate-500/10" : "text-primary bg-primary/10";
  return <Card className={`rounded-2xl ${className}`}><CardContent className="p-4 md:p-5"><div className={`h-9 w-9 rounded-xl grid place-items-center ${toneClass}`}><Icon className="h-4 w-4" /></div><div className="text-xs text-muted-foreground font-semibold mt-3">{title}</div><div className="text-xl md:text-2xl font-black mt-0.5 truncate">{value}</div></CardContent></Card>;
}
function AbcBadge({ value }: { value: "A" | "B" | "C" }) {
  const cls = value === "A" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : value === "B" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge variant="outline" className={`${cls} font-black px-3`}>{value}</Badge>;
}
