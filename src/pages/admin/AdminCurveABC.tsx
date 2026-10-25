import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/store";
import { BarChart3, Boxes, Package, RefreshCw, TrendingUp } from "lucide-react";
import type { AbcClass, InventoryManagementPayload, InventoryManagementRow } from "@/lib/inventoryPolicy";

type CurveRow = InventoryManagementRow & { share: number; cumulative: number };
const ranges = [30, 90, 180, 365];

export default function AdminCurveABC() {
  const [days, setDays] = useState(90);
  const [filter, setFilter] = useState<"ALL" | AbcClass>("ALL");

  const query = useQuery<InventoryManagementPayload>({
    queryKey: ["admin_inventory_management", "curve-abc", days],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_inventory_management", {
        _abc_days: days,
        _limit: 2000,
      });
      if (error) throw error;
      return data as InventoryManagementPayload;
    },
  });

  const classified = useMemo<CurveRow[]>(() => {
    const total = Number(query.data?.summary?.abc_total_value || 0);
    let running = 0;
    return [...(query.data?.rows || [])]
      .sort((a, b) => Number(b.abc_value || 0) - Number(a.abc_value || 0))
      .map((row) => {
        const share = total > 0 ? (Number(row.abc_value || 0) / total) * 100 : 0;
        running += share;
        return { ...row, share, cumulative: running };
      });
  }, [query.data]);

  const visible = useMemo(
    () => filter === "ALL" ? classified : classified.filter((row) => row.abc_class === filter),
    [classified, filter],
  );

  const summary = query.data?.summary;

  return <div className="p-4 md:p-6 lg:p-8 max-w-[1480px] mx-auto space-y-6">
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.16em]"><BarChart3 className="h-4 w-4" /> Inteligência de estoque</div>
        <h1 className="text-3xl font-black tracking-tight mt-1">Curva ABC</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Classificação omnicanal pelo valor de consumo: giro real do Trier no período × preço de referência. A mesma classe alimenta estoque, compra inteligente e alertas da Home.
        </p>
      </div>
      <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
        <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar
      </Button>
    </div>

    <div className="flex flex-wrap gap-2">
      {ranges.map((range) => <Button key={range} variant={days === range ? "default" : "outline"} size="sm" onClick={() => setDays(range)}>{range === 365 ? "12 meses" : `${range} dias`}</Button>)}
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Summary title="Valor de consumo analisado" value={formatBRL(Number(summary?.abc_total_value || 0))} icon={TrendingUp} className="col-span-2 lg:col-span-1" />
      <Summary title="Unidades no período" value={Number(summary?.abc_total_units || 0).toLocaleString("pt-BR")} icon={Boxes} />
      <Summary title="Classe A" value={String(summary?.abc_a_count || 0)} icon={Package} tone="A" />
      <Summary title="Classe B" value={String(summary?.abc_b_count || 0)} icon={Package} tone="B" />
      <Summary title="Classe C" value={String(summary?.abc_c_count || 0)} icon={Package} tone="C" />
    </div>

    <Card className="rounded-2xl overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Produtos classificados</CardTitle>
          <div className="flex gap-1">
            {(["ALL", "A", "B", "C"] as const).map((value) =>
              <Button key={value} size="sm" variant={filter === value ? "default" : "ghost"} onClick={() => setFilter(value)}>
                {value === "ALL" ? "Todos" : value}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {query.isLoading ? (
          <div className="p-10 text-center text-muted-foreground">Calculando Curva ABC...</div>
        ) : query.isError ? (
          <div className="p-10 text-center text-destructive">Não foi possível calcular a Curva ABC.</div>
        ) : !visible.length ? (
          <div className="p-10 text-center text-muted-foreground">Ainda não existem dados de giro suficientes neste período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1050px]">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">Produto</th>
                  <th className="text-right px-4 py-3">Qtd.</th>
                  <th className="text-right px-4 py-3">Valor consumo</th>
                  <th className="text-right px-4 py-3">Participação</th>
                  <th className="text-right px-4 py-3">Acumulado</th>
                  <th className="text-center px-4 py-3">Classe</th>
                  <th className="text-right px-4 py-3">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 300).map((row, index) => (
                  <tr key={row.product_id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold min-w-[280px]">
                      {row.product_name}
                      <div className="text-[11px] font-normal text-muted-foreground">{row.trier_product_id || row.barcode || row.sku || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{Number(row.abc_units || 0).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatBRL(Number(row.abc_value || 0))}</td>
                    <td className="px-4 py-3 text-right">{row.share.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right">{row.cumulative.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-center"><AbcBadge value={row.abc_class} /></td>
                    <td className="px-4 py-3 text-right">{row.coverage_days == null ? "—" : `${Number(row.coverage_days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  </div>;
}

function Summary({ title, value, icon: Icon, tone, className = "" }: { title: string; value: string; icon: any; tone?: AbcClass; className?: string }) {
  const toneClass = tone === "A" ? "text-emerald-700 bg-emerald-500/10" : tone === "B" ? "text-amber-700 bg-amber-500/10" : tone === "C" ? "text-slate-600 bg-slate-500/10" : "text-primary bg-primary/10";
  return <Card className={`rounded-2xl ${className}`}><CardContent className="p-4 md:p-5"><div className={`h-9 w-9 rounded-xl grid place-items-center ${toneClass}`}><Icon className="h-4 w-4" /></div><div className="text-xs text-muted-foreground font-semibold mt-3">{title}</div><div className="text-xl md:text-2xl font-black mt-0.5 truncate">{value}</div></CardContent></Card>;
}

function AbcBadge({ value }: { value: AbcClass }) {
  const cls = value === "A" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : value === "B" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge variant="outline" className={`${cls} font-black px-3`}>{value}</Badge>;
}
