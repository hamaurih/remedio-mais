import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Download, FileCheck2, PackageOpen, RefreshCw, Search, ShoppingCart, Truck } from "lucide-react";
import { ErpPage, ErpPageHeader } from "@/components/admin/ErpPageShell";
import {
  INVENTORY_STATUS_LABEL,
  type InventoryManagementPayload,
  type InventoryManagementRow,
  type InventoryStatus,
} from "@/lib/inventoryPolicy";

const STATUS_VARIANT: Record<InventoryStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ruptura: "destructive",
  critico: "destructive",
  repor: "secondary",
  excesso: "outline",
  sem_giro: "outline",
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
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function AdminSmartPurchasing() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("comprar");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [creatingDrafts, setCreatingDrafts] = useState(false);

  const { data, isFetching, error, refetch } = useQuery<InventoryManagementPayload>({
    queryKey: ["admin_inventory_management", 90],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: result, error: rpcError } = await (supabase as any).rpc("admin_inventory_management", {
        _abc_days: 90,
        _limit: 1000,
      });
      if (rpcError) throw rpcError;
      return result as InventoryManagementPayload;
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.rows || []).filter((row) => {
      if (statusFilter === "comprar" && num(row.suggested_qty) <= 0) return false;
      if (statusFilter !== "all" && statusFilter !== "comprar" && row.status !== statusFilter) return false;
      if (!term) return true;
      return [
        row.product_name,
        row.trier_product_id,
        row.sku,
        row.barcode,
        row.category_name,
        row.laboratory,
        row.supplier_name,
        row.abc_class,
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [data?.rows, search, statusFilter]);

  const selectableRows = rows.filter((row) => num(row.suggested_qty) > 0 && !!row.supplier_id);
  const selectedRows = (data?.rows || []).filter((row) => selected[row.product_id]);
  const selectedCost = selectedRows.reduce((sum, row) => {
    const qty = quantities[row.product_id] ?? num(row.suggested_qty);
    const unitCost = row.last_cost == null ? 0 : num(row.last_cost);
    return sum + qty * unitCost;
  }, 0);

  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!isAdmin) return <Navigate to="/admin" replace />;

  const toggleRow = (row: InventoryManagementRow, checked: boolean) => {
    setSelected((current) => ({ ...current, [row.product_id]: checked }));
    if (checked) {
      setQuantities((current) => ({
        ...current,
        [row.product_id]: current[row.product_id] ?? Math.max(1, num(row.suggested_qty)),
      }));
    }
  };

  const toggleAllVisible = (checked: boolean) => {
    const nextSelected = { ...selected };
    const nextQuantities = { ...quantities };
    for (const row of selectableRows) {
      nextSelected[row.product_id] = checked;
      if (checked) nextQuantities[row.product_id] = nextQuantities[row.product_id] ?? Math.max(1, num(row.suggested_qty));
    }
    setSelected(nextSelected);
    setQuantities(nextQuantities);
  };

  const createDraftOrders = async () => {
    if (!selectedRows.length) {
      toast.error("Selecione pelo menos um item com fornecedor vinculado.");
      return;
    }

    const items = selectedRows.map((row) => ({
      product_id: row.product_id,
      supplier_id: row.supplier_id,
      quantity: quantities[row.product_id] ?? num(row.suggested_qty),
    }));

    if (items.some((item) => !item.supplier_id || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      toast.error("Revise fornecedor e quantidade dos itens selecionados.");
      return;
    }

    setCreatingDrafts(true);
    const { data: result, error: rpcError } = await (supabase as any).rpc("create_smart_purchase_drafts", {
      _items: items,
    });
    setCreatingDrafts(false);

    if (rpcError) {
      toast.error(rpcError.message);
      return;
    }

    const count = Number(result?.order_count || 0);
    toast.success(`${count} pedido(s) de compra criado(s) em rascunho para aprovação.`);
    setSelected({});
    setQuantities({});
    await refetch();
    navigate("/admin/compras-operacionais");
  };

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Não há itens para exportar com os filtros atuais.");
      return;
    }

    const header = [
      "Situação", "ABC", "Produto", "Código Trier", "Estoque disponível", "Giro/dia", "Cobertura dias",
      "Lead time", "Fonte lead time", "Ponto reposição", "Estoque alvo", "Comprar", "Fornecedor", "Custo estimado",
    ];
    const lines = rows.map((row) => [
      INVENTORY_STATUS_LABEL[row.status], row.abc_class, row.product_name, row.trier_product_id || "",
      row.available_stock, row.avg_daily_units, row.coverage_days ?? "", row.lead_time_days,
      row.lead_time_source === "supplier" ? "Fornecedor" : "Estimado", row.reorder_point, row.target_stock,
      row.suggested_qty, row.supplier_name || "", row.estimated_line_cost ?? "",
    ].map(csvCell).join(";"));

    const blob = new Blob(["\ufeff", header.map(csvCell).join(";"), "\n", lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reposicao-inteligente-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;
  const hasCosts = num(summary?.estimated_cost) > 0;
  const allVisibleSelected = selectableRows.length > 0 && selectableRows.every((row) => selected[row.product_id]);

  return (
    <ErpPage>
      <ErpPageHeader
        title="Compra inteligente"
        description="Reposição calculada por giro Trier, Curva ABC, cobertura, reservas, lead time e estoque de segurança. A seleção gera apenas pedidos em rascunho, sujeitos à aprovação humana."
        eyebrow="Compras e suprimentos"
        icon={ShoppingCart}
        actions={
          <>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4 mr-2" /> Exportar lista</Button>
            <Button onClick={createDraftOrders} disabled={!selectedRows.length || creatingDrafts}>
              <FileCheck2 className="h-4 w-4 mr-2" /> {creatingDrafts ? "Gerando..." : `Gerar pedido (${selectedRows.length})`}
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Não foi possível calcular a reposição: {(error as any)?.message || "erro desconhecido"}.
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Metric title="Rupturas" value={summary?.rupture_count ?? "—"} icon={AlertTriangle} danger />
        <Metric title="Críticos" value={summary?.critical_count ?? "—"} icon={PackageOpen} danger />
        <Metric title="Itens para repor" value={summary?.replenishment_count ?? "—"} icon={Boxes} />
        <Metric title="Unidades sugeridas" value={summary?.suggested_units ?? "—"} icon={ShoppingCart} />
        <Metric title="Custo estimado" value={hasCosts ? brl(summary?.estimated_cost) : "Sem custos cadastrados"} icon={Truck} small={!hasCosts} />
      </div>

      {selectedRows.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-bold">{selectedRows.length} item(ns) selecionado(s)</div>
            <div className="text-xs text-muted-foreground">
              Serão agrupados automaticamente por fornecedor. Valor estimado: {brl(selectedCost)}.
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Nenhum pedido é aprovado ou enviado automaticamente.
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="font-bold text-sm">Política automática por Curva ABC</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(["A", "B", "C"] as const).map((abc) => {
            const policy = data?.parameters?.class_policy?.[abc];
            return (
              <div key={abc} className="rounded-xl border bg-muted/20 p-3 text-sm">
                <div className="font-black">Classe {abc}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Segurança {policy?.safety_days ?? "—"} dias · cobertura adicional {policy?.coverage_days ?? "—"} dias
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          O lead time real do fornecedor é usado quando cadastrado. Sem fornecedor, o motor usa {data?.parameters?.default_lead_time_days ?? 3} dias como estimativa. Para gerar um pedido, o produto precisa ter fornecedor ativo vinculado.
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto, código Trier, EAN, laboratório, fornecedor ou classe ABC" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="comprar">Precisa comprar</SelectItem>
            <SelectItem value="ruptura">Ruptura</SelectItem>
            <SelectItem value="critico">Crítico</SelectItem>
            <SelectItem value="repor">Repor</SelectItem>
            <SelectItem value="excesso">Excesso</SelectItem>
            <SelectItem value="sem_giro">Sem giro</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1360px]">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-3 w-10">
                  <input
                    aria-label="Selecionar todos os itens visíveis com fornecedor"
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAllVisible(e.target.checked)}
                  />
                </th>
                <th className="p-3">Situação</th>
                <th className="p-3 text-center">ABC</th>
                <th className="p-3">Produto</th>
                <th className="p-3 text-right">Disponível</th>
                <th className="p-3 text-right">Giro/dia</th>
                <th className="p-3 text-right">Cobertura</th>
                <th className="p-3 text-right">Lead time</th>
                <th className="p-3 text-right">Ponto / Alvo</th>
                <th className="p-3 text-right">Comprar</th>
                <th className="p-3">Fornecedor</th>
                <th className="p-3 text-right">Custo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: InventoryManagementRow) => {
                const canOrder = num(row.suggested_qty) > 0 && !!row.supplier_id;
                const isSelected = !!selected[row.product_id];
                return (
                  <tr key={row.product_id} className="border-t align-top hover:bg-muted/20">
                    <td className="p-3">
                      <input
                        aria-label={`Selecionar ${row.product_name}`}
                        type="checkbox"
                        disabled={!canOrder}
                        checked={isSelected}
                        onChange={(e) => toggleRow(row, e.target.checked)}
                      />
                    </td>
                    <td className="p-3"><Badge variant={STATUS_VARIANT[row.status]}>{INVENTORY_STATUS_LABEL[row.status]}</Badge></td>
                    <td className="p-3 text-center"><Badge variant="outline" className="font-black">{row.abc_class}</Badge></td>
                    <td className="p-3 max-w-[360px]">
                      <div className="font-semibold">{row.product_name}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">Cód. Trier: {row.trier_product_id || "—"}{row.laboratory ? ` · ${row.laboratory}` : ""}</div>
                    </td>
                    <td className="p-3 text-right font-bold">{num(row.available_stock).toLocaleString("pt-BR")}</td>
                    <td className="p-3 text-right">{num(row.avg_daily_units).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                    <td className="p-3 text-right">{row.coverage_days == null ? "—" : `${num(row.coverage_days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`}</td>
                    <td className="p-3 text-right">
                      <div>{row.lead_time_days} d</div>
                      <div className="text-[10px] text-muted-foreground">{row.lead_time_source === "supplier" ? "fornecedor" : "estimado"}</div>
                    </td>
                    <td className="p-3 text-right">{num(row.reorder_point).toLocaleString("pt-BR")} / {num(row.target_stock).toLocaleString("pt-BR")}</td>
                    <td className="p-3 text-right">
                      {isSelected ? (
                        <Input
                          aria-label={`Quantidade para ${row.product_name}`}
                          className="ml-auto h-8 w-24 text-right font-bold"
                          type="number"
                          min={1}
                          step={1}
                          value={quantities[row.product_id] ?? Math.max(1, num(row.suggested_qty))}
                          onChange={(e) => setQuantities((current) => ({ ...current, [row.product_id]: Number(e.target.value) }))}
                        />
                      ) : (
                        <span className="text-lg font-extrabold text-primary">{num(row.suggested_qty).toLocaleString("pt-BR")}</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.supplier_name || <span className="text-xs text-amber-700">Vincule um fornecedor antes de comprar</span>}
                    </td>
                    <td className="p-3 text-right">{row.estimated_line_cost == null ? "—" : brl(row.estimated_line_cost)}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={12} className="p-10 text-center text-muted-foreground">Nenhum item encontrado com os filtros atuais.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="font-bold text-foreground mb-1">Qualidade do giro</div>
          Giro Trier atualizado em {dt(data?.freshness?.rotation_synced_at)}. Venda mais recente considerada: {dt(data?.freshness?.latest_sale_at)}.
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="font-bold text-foreground mb-1">Fornecedores e lead time</div>
          {num(summary?.supplier_linked_items)} item(ns) têm fornecedor vinculado e {num(summary?.lead_time_configured_items)} usam prazo real. Os demais usam o lead time padrão até o cadastro ser concluído.
        </div>
      </div>
    </ErpPage>
  );
}

function Metric({ title, value, icon: Icon, danger, small }: { title: string; value: any; icon: any; danger?: boolean; small?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{title}</span><Icon className="h-4 w-4" /></div>
      <div className={`mt-2 font-extrabold ${small ? "text-sm" : "text-2xl"} ${danger && Number(value || 0) > 0 ? "text-red-700" : ""}`}>{value}</div>
    </div>
  );
}
