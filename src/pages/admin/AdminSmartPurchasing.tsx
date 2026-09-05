import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Download, PackageOpen, RefreshCw, Search, ShoppingCart, Truck } from "lucide-react";

type Priority = "ruptura" | "critico" | "estoque_baixo" | "repor" | "ok";

type Recommendation = {
  product_id: string;
  product_name: string;
  trier_product_id?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category_name?: string | null;
  laboratory?: string | null;
  requires_prescription?: boolean;
  controlled?: boolean;
  available_stock: number;
  on_hand_stock: number;
  reserved_stock: number;
  minimum_stock: number;
  units_30d: number;
  units_90d: number;
  avg_daily_units: number;
  coverage_days?: number | null;
  last_sale_at?: string | null;
  priority: Priority;
  suggested_qty: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  last_cost?: number | null;
  estimated_line_cost?: number | null;
};

type Payload = {
  store: { id: string; name: string };
  parameters: { target_days: number; critical_days: number };
  freshness: { rotation_synced_at?: string | null; latest_sale_at?: string | null };
  summary: {
    rupture_count: number;
    critical_count: number;
    low_stock_count: number;
    replenishment_count: number;
    suggested_units: number;
    estimated_cost: number;
    costed_items: number;
    supplier_linked_items: number;
  };
  rows: Recommendation[];
};

const PRIORITY_LABEL: Record<Priority, string> = {
  ruptura: "Ruptura",
  critico: "Crítico",
  estoque_baixo: "Estoque baixo",
  repor: "Repor",
  ok: "OK",
};

const PRIORITY_VARIANT: Record<Priority, "default" | "secondary" | "destructive" | "outline"> = {
  ruptura: "destructive",
  critico: "destructive",
  estoque_baixo: "outline",
  repor: "secondary",
  ok: "default",
};

function num(value: unknown) {
  return Number(value || 0);
}

function brl(value: unknown) {
  return num(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export default function AdminSmartPurchasing() {
  const { isAdmin, loading } = useAuth();
  const [targetDays, setTargetDays] = useState(14);
  const [criticalDays, setCriticalDays] = useState(7);
  const [priority, setPriority] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isFetching, error, refetch } = useQuery<Payload>({
    queryKey: ["smart-purchasing", targetDays, criticalDays],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: result, error: rpcError } = await (supabase as any).rpc("admin_replenishment_recommendations", {
        _target_days: targetDays,
        _critical_days: criticalDays,
        _limit: 500,
      });
      if (rpcError) throw rpcError;
      return result as Payload;
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.rows || []).filter((row) => {
      if (priority !== "all" && row.priority !== priority) return false;
      if (!term) return true;
      return [row.product_name, row.trier_product_id, row.sku, row.barcode, row.category_name, row.laboratory, row.supplier_name]
        .some((v) => String(v || "").toLowerCase().includes(term));
    });
  }, [data?.rows, priority, search]);

  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!isAdmin) return <Navigate to="/admin" replace />;

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Não há itens para exportar com os filtros atuais.");
      return;
    }
    const header = ["Prioridade", "Produto", "Código Trier", "Estoque disponível", "Vendas 30d", "Vendas 90d", "Cobertura dias", "Sugestão compra", "Fornecedor", "Último custo", "Custo estimado"];
    const lines = rows.map((r) => [
      PRIORITY_LABEL[r.priority], r.product_name, r.trier_product_id || "", r.available_stock, r.units_30d, r.units_90d,
      r.coverage_days ?? "", r.suggested_qty, r.supplier_name || "", r.last_cost ?? "", r.estimated_line_cost ?? "",
    ].map(csvCell).join(";"));
    const blob = new Blob(["\ufeff", header.map(csvCell).join(";"), "\n", lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reposicao-inteligente-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;
  const hasCosts = num(summary?.costed_items) > 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-extrabold">Compra inteligente</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Reposição calculada com giro real do Trier e estoque disponível da unidade. Nenhum pedido é enviado automaticamente: esta tela gera recomendação para conferência.
          </p>
          {data?.store?.name && <div className="text-xs font-semibold mt-2">Unidade: {data.store.name}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4 mr-2" /> Exportar lista</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Não foi possível calcular a reposição: {(error as any)?.message || "erro desconhecido"}.
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Metric title="Rupturas" value={summary?.rupture_count ?? "—"} icon={AlertTriangle} danger />
        <Metric title={`Críticos ≤ ${criticalDays} dias`} value={summary?.critical_count ?? "—"} icon={PackageOpen} danger />
        <Metric title="Itens para repor" value={summary?.replenishment_count ?? "—"} icon={Boxes} />
        <Metric title="Unidades sugeridas" value={summary?.suggested_units ?? "—"} icon={ShoppingCart} />
        <Metric title="Custo estimado" value={hasCosts ? brl(summary?.estimated_cost) : "Sem custos cadastrados"} icon={Truck} small={!hasCosts} />
      </div>

      <div className="bg-card border rounded-xl shadow-card p-4 grid gap-4 lg:grid-cols-[220px_220px_1fr]">
        <div>
          <label className="text-xs font-semibold">Cobertura alvo</label>
          <Select value={String(targetDays)} onValueChange={(v) => setTargetDays(Number(v))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7, 14, 21, 30].map((days) => <SelectItem key={days} value={String(days)}>{days} dias</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold">Faixa crítica</label>
          <Select value={String(criticalDays)} onValueChange={(v) => setCriticalDays(Number(v))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[3, 5, 7, 10].map((days) => <SelectItem key={days} value={String(days)}>{days} dias</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground flex items-end pb-2">
          A demanda diária usa as vendas dos últimos 30 dias; quando não há venda no período, usa a média de 90 dias. A sugestão cobre o horizonte escolhido e nunca fica abaixo do estoque mínimo.
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-card overflow-hidden">
        <div className="p-4 border-b grid gap-3 md:grid-cols-[1fr_190px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto, código Trier, EAN, laboratório ou fornecedor" />
          </div>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              <SelectItem value="ruptura">Ruptura</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
              <SelectItem value="estoque_baixo">Estoque baixo</SelectItem>
              <SelectItem value="repor">Repor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-3">Prioridade</th>
                <th className="p-3">Produto</th>
                <th className="p-3 text-right">Estoque</th>
                <th className="p-3 text-right">Vendas 30d</th>
                <th className="p-3 text-right">Cobertura</th>
                <th className="p-3 text-right">Comprar</th>
                <th className="p-3">Fornecedor</th>
                <th className="p-3 text-right">Custo estimado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.product_id} className="border-t align-top">
                  <td className="p-3"><Badge variant={PRIORITY_VARIANT[row.priority]}>{PRIORITY_LABEL[row.priority]}</Badge></td>
                  <td className="p-3 max-w-[360px]">
                    <div className="font-semibold">{row.product_name}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Cód. Trier: {row.trier_product_id || "—"}{row.laboratory ? ` · ${row.laboratory}` : ""}</div>
                    {(row.controlled || row.requires_prescription) && <div className="text-[11px] text-amber-700 font-semibold mt-1">Medicamento com controle de dispensação</div>}
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-bold">{num(row.available_stock).toLocaleString("pt-BR")}</div>
                    {num(row.reserved_stock) > 0 && <div className="text-[11px] text-muted-foreground">{num(row.reserved_stock)} reservado</div>}
                  </td>
                  <td className="p-3 text-right font-semibold">{num(row.units_30d).toLocaleString("pt-BR")}</td>
                  <td className="p-3 text-right">{row.coverage_days == null ? "—" : `${num(row.coverage_days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`}</td>
                  <td className="p-3 text-right text-lg font-extrabold text-primary">{num(row.suggested_qty).toLocaleString("pt-BR")}</td>
                  <td className="p-3">{row.supplier_name || <span className="text-xs text-muted-foreground">Não cadastrado</span>}</td>
                  <td className="p-3 text-right">{row.estimated_line_cost == null ? "—" : brl(row.estimated_line_cost)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Nenhum item encontrado com os filtros atuais.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div className="border rounded-xl p-4 bg-card">
          <div className="font-bold text-foreground mb-1">Qualidade dos dados</div>
          Giro Trier atualizado em {dt(data?.freshness?.rotation_synced_at)}. Venda mais recente considerada: {dt(data?.freshness?.latest_sale_at)}.
        </div>
        <div className="border rounded-xl p-4 bg-card">
          <div className="font-bold text-foreground mb-1">Fornecedores</div>
          {num(summary?.supplier_linked_items)} item(ns) da lista têm fornecedor vinculado e {num(summary?.costed_items)} têm custo de compra. O próximo bloco da Fase 2 conecta fornecedores, custo e geração de pedido de compra.
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, icon: Icon, danger, small }: { title: string; value: any; icon: any; danger?: boolean; small?: boolean }) {
  return (
    <div className="bg-card border rounded-xl p-4 shadow-card">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{title}</span><Icon className="h-4 w-4" /></div>
      <div className={`mt-2 font-extrabold ${small ? "text-sm" : "text-2xl"} ${danger && Number(value || 0) > 0 ? "text-red-700" : ""}`}>{value}</div>
    </div>
  );
}
