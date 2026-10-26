import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ErpMetricCard, ErpPage, ErpPageHeader, ErpPanel, ErpPanelHeader } from "@/components/admin/ErpPageShell";
import { AlertTriangle, Boxes, CalendarClock, ClipboardCheck, PackageX, ShieldCheck } from "lucide-react";

type ControlPayload = {
  store: { id: string; name: string };
  summary: {
    lot_count: number;
    expired_lots: number;
    expiring_30: number;
    expiring_60: number;
    expiring_90: number;
    without_expiry: number;
    loss_30d: number;
    open_counts: number;
  };
  lots: any[];
  recent_losses: any[];
  counts: any[];
};

const expiryLabel: Record<string, string> = {
  vencido: "Vencido",
  vence_30: "Até 30 dias",
  vence_60: "31–60 dias",
  vence_90: "61–90 dias",
  sem_validade: "Sem validade",
  ok: "OK",
};

const reasonLabel: Record<string, string> = {
  expiry: "Vencimento",
  damage: "Avaria",
  breakage: "Quebra",
  theft: "Furto",
  quality: "Qualidade",
  other: "Outro",
};

const brl = (value: unknown) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminInventoryControl() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("lots");
  const [expiryFilter, setExpiryFilter] = useState("attention");
  const [search, setSearch] = useState("");
  const [lossOpen, setLossOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [countId, setCountId] = useState<string | null>(null);

  const { data, isFetching, refetch } = useQuery<ControlPayload>({
    queryKey: ["admin_inventory_control"],
    queryFn: async () => {
      const { data: result, error } = await (supabase as any).rpc("admin_inventory_control", { _limit: 2000 });
      if (error) throw error;
      return result as ControlPayload;
    },
    staleTime: 30_000,
  });

  const { data: balances = [] } = useQuery({
    queryKey: ["inventory_control_balances", data?.store?.id],
    enabled: !!data?.store?.id,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("inventory_balances")
        .select("product_id,on_hand,reserved,available,products(id,name,barcode,sku,laboratory)")
        .eq("store_id", data!.store.id)
        .gt("on_hand", 0)
        .order("on_hand", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return rows || [];
    },
  });

  const filteredLots = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.lots || []).filter((lot) => {
      if (expiryFilter === "attention" && !["vencido", "vence_30", "vence_60", "vence_90", "sem_validade"].includes(lot.expiry_status)) return false;
      if (expiryFilter !== "all" && expiryFilter !== "attention" && lot.expiry_status !== expiryFilter) return false;
      if (!term) return true;
      return [lot.product_name, lot.barcode, lot.sku, lot.laboratory, lot.batch_number]
        .some((v) => String(v || "").toLowerCase().includes(term));
    });
  }, [data?.lots, expiryFilter, search]);

  const currentCount = (data?.counts || []).find((c) => c.status === "counting") || null;

  const refresh = async () => {
    await Promise.all([
      refetch(),
      qc.invalidateQueries({ queryKey: ["inventory_control_balances"] }),
      qc.invalidateQueries({ queryKey: ["admin_inventory_management"] }),
    ]);
  };

  return (
    <ErpPage className="[&_table]:min-w-[900px]">
      <ErpPageHeader
        title="Lotes, Validade, Perdas e Inventário"
        description="Controle farmacêutico do estoque interno: FEFO, vencimentos, perdas auditáveis e inventário físico sem alterar o Trier."
        eyebrow="Estoque"
        icon={Boxes}
        actions={
          <>
            <Button variant="outline" onClick={() => setLossOpen(true)}><PackageX className="mr-2 h-4 w-4" />Registrar perda</Button>
            <Button onClick={() => currentCount ? setCountId(currentCount.id) : setCountOpen(true)}>
              <ClipboardCheck className="mr-2 h-4 w-4" />{currentCount ? "Continuar inventário" : "Novo inventário"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <ErpMetricCard label="Lotes com saldo" value={data?.summary?.lot_count ?? "—"} icon={Boxes} />
        <ErpMetricCard label="Vencidos" value={data?.summary?.expired_lots ?? "—"} icon={AlertTriangle} tone={(data?.summary?.expired_lots ?? 0) > 0 ? "danger" : "default"} />
        <ErpMetricCard label="Vence ≤30d" value={data?.summary?.expiring_30 ?? "—"} icon={CalendarClock} tone={(data?.summary?.expiring_30 ?? 0) > 0 ? "warning" : "default"} />
        <ErpMetricCard label="Vence 31–60d" value={data?.summary?.expiring_60 ?? "—"} icon={CalendarClock} />
        <ErpMetricCard label="Vence 61–90d" value={data?.summary?.expiring_90 ?? "—"} icon={CalendarClock} />
        <ErpMetricCard label="Sem validade" value={data?.summary?.without_expiry ?? "—"} icon={AlertTriangle} tone={(data?.summary?.without_expiry ?? 0) > 0 ? "warning" : "default"} />
        <ErpMetricCard label="Perdas 30d" value={brl(data?.summary?.loss_30d)} icon={PackageX} />
        <ErpMetricCard label="Inventários abertos" value={data?.summary?.open_counts ?? "—"} icon={ClipboardCheck} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="lots">Lotes e validade</TabsTrigger>
          <TabsTrigger value="losses">Perdas</TabsTrigger>
          <TabsTrigger value="counts">Inventários</TabsTrigger>
        </TabsList>

        <TabsContent value="lots">
          <ErpPanel>
            <ErpPanelHeader
              title="FEFO e risco de validade"
              description="Ordenado pela validade mais próxima. Priorize a saída do lote que vence primeiro."
              actions={
                <Select value={expiryFilter} onValueChange={setExpiryFilter}>
                  <SelectTrigger className="h-8 w-[190px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attention">Precisa de atenção</SelectItem>
                    <SelectItem value="vencido">Vencidos</SelectItem>
                    <SelectItem value="vence_30">Até 30 dias</SelectItem>
                    <SelectItem value="vence_60">31–60 dias</SelectItem>
                    <SelectItem value="vence_90">61–90 dias</SelectItem>
                    <SelectItem value="sem_validade">Sem validade</SelectItem>
                    <SelectItem value="ok">OK</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
            <div className="border-b p-4">
              <Input placeholder="Buscar produto, EAN, SKU, laboratório ou lote..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1150px]">
                <thead className="bg-secondary/70 text-left">
                  <tr>
                    <th className="p-3">Prioridade</th><th className="p-3">Produto</th><th className="p-3">Lote</th>
                    <th className="p-3">Validade</th><th className="p-3 text-right">Dias</th><th className="p-3 text-right">Saldo lote</th>
                    <th className="p-3 text-right">Custo</th><th className="p-3">Rastreabilidade</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.map((lot) => (
                    <tr key={lot.lot_id} className="border-t hover:bg-muted/20">
                      <td className="p-3">
                        <Badge variant={lot.expiry_status === "vencido" ? "destructive" : ["vence_30", "sem_validade"].includes(lot.expiry_status) ? "secondary" : "outline"}>
                          {expiryLabel[lot.expiry_status] || lot.expiry_status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold">{lot.product_name}</div>
                        <div className="text-[11px] text-muted-foreground">{lot.barcode || lot.sku || "—"}{lot.laboratory ? ` · ${lot.laboratory}` : ""}</div>
                      </td>
                      <td className="p-3 font-mono text-xs">{lot.batch_number}</td>
                      <td className="p-3">{lot.expiry_date ? new Date(lot.expiry_date + "T12:00:00").toLocaleDateString("pt-BR") : "Não informada"}</td>
                      <td className="p-3 text-right">{lot.days_to_expiry ?? "—"}</td>
                      <td className="p-3 text-right font-bold">{Number(lot.quantity || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                      <td className="p-3 text-right">{lot.unit_cost == null ? "—" : brl(lot.unit_cost)}</td>
                      <td className="p-3">
                        {lot.controlled || lot.requires_prescription
                          ? <Badge variant={lot.expiry_date ? "outline" : "destructive"}>{lot.expiry_date ? "Lote rastreado" : "Revisar"}</Badge>
                          : <Badge variant="outline">Normal</Badge>}
                      </td>
                    </tr>
                  ))}
                  {!filteredLots.length && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Nenhum lote com os filtros atuais.</td></tr>}
                </tbody>
              </table>
            </div>
          </ErpPanel>
        </TabsContent>

        <TabsContent value="losses">
          <ErpPanel>
            <ErpPanelHeader
              title="Histórico de perdas"
              description="Toda perda gera baixa no razão interno com motivo, usuário, produto e lote quando informado."
              actions={<Button size="sm" onClick={() => setLossOpen(true)}><PackageX className="mr-2 h-4 w-4" />Nova perda</Button>}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="bg-secondary/70 text-left">
                  <tr><th className="p-3">Data</th><th className="p-3">Produto</th><th className="p-3">Lote</th><th className="p-3">Motivo</th><th className="p-3 text-right">Qtd.</th><th className="p-3 text-right">Valor</th><th className="p-3">Observação</th></tr>
                </thead>
                <tbody>
                  {(data?.recent_losses || []).map((loss) => (
                    <tr key={loss.id} className="border-t">
                      <td className="p-3 text-xs">{new Date(loss.created_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3 font-semibold">{loss.product_name}</td>
                      <td className="p-3 font-mono text-xs">{loss.batch_number || "Sem lote"}</td>
                      <td className="p-3"><Badge variant={loss.reason_type === "expiry" ? "destructive" : "outline"}>{reasonLabel[loss.reason_type] || loss.reason_type}</Badge></td>
                      <td className="p-3 text-right">{Number(loss.quantity || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                      <td className="p-3 text-right">{brl(loss.total_value)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{loss.reason || "—"}</td>
                    </tr>
                  ))}
                  {!(data?.recent_losses || []).length && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">Nenhuma perda registrada.</td></tr>}
                </tbody>
              </table>
            </div>
          </ErpPanel>
        </TabsContent>

        <TabsContent value="counts">
          <ErpPanel>
            <ErpPanelHeader
              title="Inventário físico"
              description="Compare o saldo interno esperado com a contagem real e aplique apenas a diferença, mantendo trilha de auditoria."
              actions={<Button size="sm" onClick={() => currentCount ? setCountId(currentCount.id) : setCountOpen(true)}><ClipboardCheck className="mr-2 h-4 w-4" />{currentCount ? "Continuar contagem" : "Iniciar inventário"}</Button>}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-secondary/70 text-left">
                  <tr><th className="p-3">Número</th><th className="p-3">Modo</th><th className="p-3">Status</th><th className="p-3 text-right">Itens</th><th className="p-3 text-right">Divergentes</th><th className="p-3 text-right">Variação</th><th className="p-3">Data</th><th className="p-3">Ação</th></tr>
                </thead>
                <tbody>
                  {(data?.counts || []).map((count) => (
                    <tr key={count.id} className="border-t">
                      <td className="p-3 font-bold">#{count.count_number}</td>
                      <td className="p-3">{count.mode === "lots" ? "Por lote" : "Por produto"}</td>
                      <td className="p-3"><Badge variant={count.status === "counting" ? "secondary" : "outline"}>{count.status === "counting" ? "Em contagem" : count.status === "finalized" ? "Finalizado" : "Cancelado"}</Badge></td>
                      <td className="p-3 text-right">{count.item_count}</td>
                      <td className="p-3 text-right">{count.variance_items}</td>
                      <td className="p-3 text-right">{Number(count.variance_units || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                      <td className="p-3 text-xs">{new Date(count.created_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3">{count.status === "counting" && <Button size="sm" variant="outline" onClick={() => setCountId(count.id)}>Abrir</Button>}</td>
                    </tr>
                  ))}
                  {!(data?.counts || []).length && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Nenhum inventário registrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </ErpPanel>
        </TabsContent>
      </Tabs>

      <div className="rounded-2xl border bg-card p-4 text-xs text-muted-foreground shadow-sm">
        <div className="mb-1 flex items-center gap-2 font-bold text-foreground"><ShieldCheck className="h-4 w-4" />Separação do Trier preservada</div>
        Perdas, inventários e lotes atuam somente no estoque interno do ERP. Esta tela não escreve em integrações, preços ou saldos do Trier.
      </div>

      <LossDialog open={lossOpen} onOpenChange={setLossOpen} lots={data?.lots || []} balances={balances as any[]} onSaved={refresh} />
      <StartCountDialog open={countOpen} onOpenChange={setCountOpen} onStarted={(id) => { setCountOpen(false); setCountId(id); void refresh(); }} />
      <CountDialog countId={countId} onOpenChange={(open) => !open && setCountId(null)} onFinalized={refresh} />
    </ErpPage>
  );
}

function LossDialog({ open, onOpenChange, lots, balances, onSaved }: any) {
  const [target, setTarget] = useState("");
  const [reasonType, setReasonType] = useState("expiry");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => {
    const lotOptions = lots.map((lot: any) => ({
      key: `lot:${lot.lot_id}`,
      productId: lot.product_id,
      lotId: lot.lot_id,
      label: `${lot.product_name} · lote ${lot.batch_number} · saldo ${Number(lot.quantity).toLocaleString("pt-BR")}`,
    }));
    const lotProductIds = new Set(lots.map((lot: any) => lot.product_id));
    const productOptions = balances
      .filter((b: any) => !lotProductIds.has(b.product_id))
      .map((b: any) => ({
        key: `product:${b.product_id}`,
        productId: b.product_id,
        lotId: null,
        label: `${b.products?.name || b.product_id} · sem lote · saldo ${Number(b.on_hand || 0).toLocaleString("pt-BR")}`,
      }));
    return [...lotOptions, ...productOptions];
  }, [lots, balances]);

  const selected = options.find((o: any) => o.key === target);

  const submit = async () => {
    const qty = Number(quantity);
    if (!selected || !Number.isFinite(qty) || qty <= 0) return toast.error("Selecione o produto/lote e informe a quantidade.");
    setSaving(true);
    const { error } = await (supabase as any).rpc("record_inventory_loss", {
      _product_id: selected.productId,
      _lot_id: selected.lotId,
      _quantity: qty,
      _reason_type: reasonType,
      _reason: reason || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perda registrada e baixada do estoque interno.");
    onOpenChange(false);
    setTarget(""); setQuantity(""); setReason("");
    await onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Registrar perda de estoque</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Produto / lote</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Selecione...</option>
              {options.map((o: any) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Motivo</Label>
              <Select value={reasonType} onValueChange={setReasonType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(reasonLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantidade</Label><Input type="number" min={0.001} step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          </div>
          <div><Label>Observação</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explique a ocorrência, quando necessário." /></div>
          {selected?.lotId && <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">A baixa será vinculada ao lote selecionado e registrada no razão interno.</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving ? "Registrando..." : "Registrar perda"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartCountDialog({ open, onOpenChange, onStarted }: any) {
  const [mode, setMode] = useState("products");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("start_inventory_count", { _mode: mode, _notes: notes || null });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Inventário #${data?.count_number} iniciado com ${data?.items || 0} item(ns).`);
    onStarted(data?.count_id);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo inventário físico</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Modo de contagem</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="products">Por produto — saldo total</SelectItem>
                <SelectItem value="lots">Por lote — rastreabilidade/validade</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Observação</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Ao finalizar, o ERP aplicará apenas a diferença entre o saldo esperado e a contagem física. Nenhum saldo do Trier será alterado.</div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving ? "Criando..." : "Iniciar contagem"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountDialog({ countId, onOpenChange, onFinalized }: any) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const { data: count } = useQuery({
    queryKey: ["inventory_count", countId],
    enabled: !!countId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("inventory_counts").select("*").eq("id", countId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], refetch } = useQuery({
    queryKey: ["inventory_count_items", countId],
    enabled: !!countId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("inventory_count_items")
        .select("*, products(name,barcode,sku,laboratory), inventory_lots(batch_number,expiry_date)")
        .eq("count_id", countId)
        .order("created_at")
        .limit(3000);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item: any) =>
      [item.products?.name, item.products?.barcode, item.products?.sku, item.products?.laboratory, item.inventory_lots?.batch_number]
        .some((v) => String(v || "").toLowerCase().includes(term)),
    );
  }, [items, search]);

  const updateCount = async (item: any, value: string) => {
    const qty = value === "" ? null : Number(value);
    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) return;
    setSaving(item.id);
    const { error } = await (supabase as any)
      .from("inventory_count_items")
      .update({ counted_qty: qty })
      .eq("id", item.id);
    setSaving(null);
    if (error) toast.error(error.message);
    else {
      await refetch();
      qc.invalidateQueries({ queryKey: ["inventory_count"] });
    }
  };

  const finalize = async () => {
    const missing = items.filter((item: any) => item.counted_qty == null).length;
    if (missing) return toast.error(`Ainda existem ${missing} item(ns) sem contagem.`);
    if (!window.confirm("Finalizar o inventário e aplicar as diferenças ao estoque interno?")) return;
    setFinalizing(true);
    const { data, error } = await (supabase as any).rpc("finalize_inventory_count", { _count_id: countId });
    setFinalizing(false);
    if (error) return toast.error(error.message);
    toast.success(`Inventário finalizado: ${data?.variance_items || 0} item(ns) com diferença.`);
    onOpenChange(false);
    await onFinalized();
  };

  return (
    <Dialog open={!!countId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Inventário físico {count?.count_number ? `#${count.count_number}` : ""}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Buscar produto, EAN, SKU, laboratório ou lote..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="bg-secondary/70 text-left">
                <tr><th className="p-3">Produto</th><th className="p-3">Lote</th><th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Contado</th><th className="p-3 text-right">Diferença</th><th className="p-3">Situação</th></tr>
              </thead>
              <tbody>
                {filtered.map((item: any) => {
                  const variance = item.counted_qty == null ? null : Number(item.counted_qty) - Number(item.expected_qty || 0);
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="p-3"><div className="font-semibold">{item.products?.name || item.product_id}</div><div className="text-[11px] text-muted-foreground">{item.products?.barcode || item.products?.sku || "—"}</div></td>
                      <td className="p-3 font-mono text-xs">{item.inventory_lots?.batch_number || "Saldo geral"}</td>
                      <td className="p-3 text-right">{Number(item.expected_qty || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                      <td className="p-3"><Input className="ml-auto w-28 text-right" type="number" min={0} step="0.001" disabled={saving === item.id || count?.status !== "counting"} defaultValue={item.counted_qty ?? ""} onBlur={(e) => void updateCount(item, e.target.value)} /></td>
                      <td className={`p-3 text-right font-bold ${variance && Math.abs(variance) > 0.0001 ? "text-amber-700" : ""}`}>{variance == null ? "—" : variance.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                      <td className="p-3">{variance == null ? <Badge variant="outline">Pendente</Badge> : Math.abs(variance) > 0.0001 ? <Badge variant="secondary">Divergente</Badge> : <Badge variant="outline">OK</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>{count?.status === "counting" && <Button onClick={finalize} disabled={finalizing}>{finalizing ? "Finalizando..." : "Finalizar inventário"}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
