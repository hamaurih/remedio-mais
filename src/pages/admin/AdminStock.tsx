import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, Plus } from "lucide-react";

const TYPES = ["entrada", "saida", "ajuste", "reserva", "cancelamento"] as const;
const TYPE_LABEL: Record<string, string> = {
  entrada: "Entrada", saida: "Saída", ajuste: "Ajuste", reserva: "Reserva", cancelamento: "Cancelamento",
};
const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  entrada: "default", saida: "destructive", ajuste: "secondary", reserva: "outline", cancelamento: "outline",
};

const MAPPING_LABEL: Record<string, string> = {
  mapped: "Trier", orphan: "Órfão", needs_review: "Revisar", unknown: "—",
};
const MAPPING_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  mapped: "default", orphan: "destructive", needs_review: "outline", unknown: "secondary",
};

export default function AdminStock() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [mappingFilter, setMappingFilter] = useState<string>("mapped");
  const [openNew, setOpenNew] = useState(false);

  const { data: health } = useQuery({
    queryKey: ["products_health_summary"],
    queryFn: async () => (await (supabase as any).from("products_health_summary").select("*").maybeSingle()).data,
  });

  const { data: products } = useQuery({
    queryKey: ["admin_stock_products", mappingFilter],
    queryFn: async () => {
      let qy: any = (supabase as any)
        .from("products")
        .select("id, name, sku, barcode, stock, minimum_stock, trier_stock_quantity, mapping_status, needs_review, price, ecommerce_price, price_origin, stock_origin, active")
        .order("name")
        .limit(500);
      if (mappingFilter !== "all") qy = qy.eq("mapping_status", mappingFilter);
      return (await qy).data || [];
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["stock_movements", typeFilter],
    queryFn: async () => {
      let qy = supabase
        .from("stock_movements")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (typeFilter !== "all") qy = qy.eq("type", typeFilter as any);
      return (await qy).data || [];
    },
  });

  const filteredProducts = useMemo(() => {
    const t = q.toLowerCase().trim();
    const list = (products || []) as any[];
    if (!t) return list.slice(0, 50);
    return list.filter((p: any) =>
      [p.name, p.sku, p.barcode].some((v) => (v || "").toLowerCase().includes(t)),
    ).slice(0, 50);
  }, [products, q]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Estoque</h1>
        <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-2" />Novo movimento</Button>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card title="Vendáveis (ativo + estoque + preço)" value={health?.vendaveis ?? "—"} />
        <Card title="Mapeados ao Trier" value={health?.mapeados ?? "—"} />
        <Card title="Órfãos (desativados)" value={health?.orfaos ?? "—"} warn />
        <Card title="Ativos sem estoque" value={health?.ativos_sem_estoque ?? "—"} warn />
      </div>

      <div className="bg-card border rounded-xl shadow-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold">Produtos</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtro:</span>
            <Select value={mappingFilter} onValueChange={setMappingFilter}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mapped">Mapeados Trier</SelectItem>
                <SelectItem value="needs_review">Precisa revisão</SelectItem>
                <SelectItem value="orphan">Órfãos</SelectItem>
                <SelectItem value="unknown">Sem classificação</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Input placeholder="Buscar por nome, SKU ou código de barras..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-2">Produto</th>
                <th className="p-2">SKU / Barcode</th>
                <th className="p-2">Mapeamento</th>
                <th className="p-2">Preço (fonte)</th>
                <th className="p-2">Estoque site</th>
                <th className="p-2">Estoque Trier</th>
                <th className="p-2">Mín.</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p: any) => {
                const low = (p.stock ?? 0) <= (p.minimum_stock ?? 0);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      {p.name}
                      {!p.active && <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>}
                    </td>
                    <td className="p-2 text-xs font-mono text-muted-foreground">
                      {p.sku || "—"}<br/>{p.barcode || ""}
                    </td>
                    <td className="p-2">
                      <Badge variant={MAPPING_VARIANT[p.mapping_status] || "secondary"}>
                        {MAPPING_LABEL[p.mapping_status] || p.mapping_status}
                      </Badge>
                    </td>
                    <td className="p-2 text-xs">
                      {p.price != null ? `R$ ${Number(p.price).toFixed(2)}` : "—"}
                      <div className="text-muted-foreground">{p.price_origin}</div>
                    </td>
                    <td className={`p-2 ${low ? "text-primary font-semibold" : ""}`}>
                      {low && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                      {p.stock ?? 0}
                    </td>
                    <td className="p-2 text-muted-foreground">{p.trier_stock_quantity ?? "—"}</td>
                    <td className="p-2 text-xs">{p.minimum_stock ?? 0}</td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum produto.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-bold">Movimentações recentes</div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-2">Data</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Produto</th>
                <th className="p-2">Qtd</th>
                <th className="p-2">Motivo</th>
                <th className="p-2">Origem</th>
              </tr>
            </thead>
            <tbody>
              {movements?.map((m: any) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2 text-xs">{new Date(m.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-2"><Badge variant={TYPE_VARIANT[m.type]}>{TYPE_LABEL[m.type] || m.type}</Badge></td>
                  <td className="p-2">{m.products?.name || "—"}</td>
                  <td className="p-2 font-semibold">{m.quantity}</td>
                  <td className="p-2 text-xs">{m.reason || "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{m.source || "manual"}</td>
                </tr>
              ))}
              {(!movements || movements.length === 0) && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma movimentação registrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewMovementDialog
        open={openNew}
        onOpenChange={setOpenNew}
        products={(products || []) as any[]}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["stock_movements"] });
          qc.invalidateQueries({ queryKey: ["admin_stock_products"] });
          qc.invalidateQueries({ queryKey: ["products_health_summary"] });
        }}
      />
    </div>
  );
}

function Card({ title, value, warn }: { title: string; value: any; warn?: boolean }) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-card">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`text-3xl font-extrabold mt-2 ${warn && (value ?? 0) > 0 ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function NewMovementDialog({
  open, onOpenChange, products, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: any[];
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<string>("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [applyToStock, setApplyToStock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const t = search.toLowerCase().trim();
    if (!t) return products.slice(0, 20);
    return products.filter((p) => (p.name || "").toLowerCase().includes(t) || (p.sku || "").toLowerCase().includes(t)).slice(0, 20);
  }, [search, products]);

  const submit = async () => {
    const qty = Number(quantity);
    if (!productId || !qty || qty <= 0) {
      toast.error("Selecione produto e informe quantidade > 0");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_movements").insert({
      product_id: productId,
      type: type as any,
      quantity: qty,
      reason: reason || null,
      source: "manual",
      created_by: auth.user?.id || null,
    });
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    if (applyToStock && (type === "entrada" || type === "saida" || type === "ajuste")) {
      const p = products.find((x) => x.id === productId);
      const current = Number(p?.stock || 0);
      let next = current;
      if (type === "entrada") next = current + qty;
      else if (type === "saida") next = Math.max(0, current - qty);
      else if (type === "ajuste") next = qty;
      await supabase.from("products").update({ stock: next, stock_origin: "manual" } as any).eq("id", productId);
    }
    setSaving(false);
    toast.success("Movimento registrado");
    onSaved();
    onOpenChange(false);
    setProductId(""); setQuantity(""); setReason(""); setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo movimento de estoque</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold">Produto</label>
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-40 overflow-auto border rounded mt-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`block w-full text-left px-2 py-1 text-sm hover:bg-accent ${productId === p.id ? "bg-accent" : ""}`}
                  onClick={() => setProductId(p.id)}
                >
                  {p.name} <span className="text-xs text-muted-foreground">({p.sku || "s/sku"} · estoque {p.stock ?? 0})</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold">Tipo</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold">Quantidade</label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold">Motivo (opcional)</label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={applyToStock} onChange={(e) => setApplyToStock(e.target.checked)} />
            Aplicar ao estoque do produto (entrada/saída/ajuste)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Registrar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
