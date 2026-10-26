import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ErpMetricCard, ErpPage, ErpPageHeader } from "@/components/admin/ErpPageShell";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, PackageCheck, Plus, Truck } from "lucide-react";

const statusLabel: Record<string, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  approved: "Aprovado",
  sent: "Enviado",
  received: "Recebido",
  partially_received: "Parcial",
  cancelled: "Cancelado",
  checked: "Conferido",
  posted: "Lançado",
};

const money = (value: unknown) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminPurchaseOperations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openOrder, setOpenOrder] = useState(false);
  const [openReceipt, setOpenReceipt] = useState(false);
  const [conferenceReceiptId, setConferenceReceiptId] = useState<string | null>(null);
  const [startingReceipt, setStartingReceipt] = useState<string | null>(null);

  const { data: tenantId } = useQuery({
    queryKey: ["purchase-tenant", user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await (supabase as any).from("tenant_memberships").select("tenant_id").eq("user_id", user!.id).limit(1).maybeSingle()).data?.tenant_id,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["purchase-stores", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await (supabase as any).from("stores").select("id,name").eq("tenant_id", tenantId).eq("active", true).order("name")).data || [],
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["purchase-suppliers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await (supabase as any).from("suppliers").select("id,legal_name,trade_name").eq("tenant_id", tenantId).eq("active", true).order("legal_name")).data || [],
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["purchase-orders", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const r = await (supabase as any)
        .from("purchase_orders")
        .select("*, suppliers(legal_name,trade_name), stores(name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      return r.data || [];
    },
  });

  const { data: receipts = [] } = useQuery({
    queryKey: ["goods-receipts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const r = await (supabase as any)
        .from("goods_receipts")
        .select("*, suppliers(legal_name,trade_name), stores(name), purchase_orders(number)")
        .eq("tenant_id", tenantId)
        .order("received_at", { ascending: false });
      return r.data || [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["goods-receipts"] });
  };

  const approve = async (id: string) => {
    const { error } = await (supabase as any).rpc("approve_purchase_order", { _order_id: id });
    if (error) toast.error(error.message);
    else {
      toast.success("Pedido aprovado.");
      refresh();
    }
  };

  const startReceipt = async (orderId: string) => {
    setStartingReceipt(orderId);
    const { data, error } = await (supabase as any).rpc("start_goods_receipt_from_order", { _order_id: orderId });
    setStartingReceipt(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const receiptId = data?.receipt_id;
    if (!receiptId) {
      toast.error("O recebimento foi criado, mas o identificador não retornou.");
      return;
    }
    toast.success(data?.existing ? "Recebimento em aberto localizado." : "Recebimento iniciado a partir do pedido.");
    refresh();
    setConferenceReceiptId(receiptId);
  };

  const post = async (id: string) => {
    const { error } = await (supabase as any).rpc("post_goods_receipt", { _receipt_id: id });
    if (error) toast.error(error.message);
    else {
      toast.success("Entrada lançada no estoque.");
      refresh();
    }
  };

  const pendingOrders = orders.filter((o: any) => ["draft", "pending"].includes(o.status)).length;
  const approvedToReceive = orders.filter((o: any) => ["approved", "sent", "partially_received"].includes(o.status)).length;
  const openReceipts = receipts.filter((r: any) => ["draft", "checked"].includes(r.status)).length;
  const divergentReceipts = receipts.filter((r: any) => Number(r.discrepancy_count || 0) > 0 && r.status !== "posted").length;

  return (
    <ErpPage className="[&_table]:min-w-[920px]">
      <ErpPageHeader
        title="Compras e Recebimentos"
        description="Pedido aprovado, conferência item a item, divergências, lote, validade e lançamento seguro no estoque."
        eyebrow="Compras e suprimentos"
        icon={ClipboardList}
        actions={
          <>
            <Button variant="outline" onClick={() => setOpenReceipt(true)}>
              <PackageCheck className="h-4 w-4 mr-2" />Entrada avulsa
            </Button>
            <Button onClick={() => setOpenOrder(true)}>
              <Plus className="h-4 w-4 mr-2" />Novo pedido
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ErpMetricCard label="Aguardando aprovação" value={pendingOrders} icon={CheckCircle2} tone={pendingOrders > 0 ? "warning" : "default"} />
        <ErpMetricCard label="Prontos para receber" value={approvedToReceive} icon={Truck} tone={approvedToReceive > 0 ? "warning" : "default"} />
        <ErpMetricCard label="Recebimentos em aberto" value={openReceipts} icon={PackageCheck} tone={openReceipts > 0 ? "warning" : "default"} />
        <ErpMetricCard label="Com divergências" value={divergentReceipts} icon={AlertTriangle} tone={divergentReceipts > 0 ? "warning" : "default"} />
      </div>

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="orders"><ClipboardList className="h-4 w-4 mr-2" />Pedidos ({orders.length})</TabsTrigger>
          <TabsTrigger value="receipts"><ClipboardCheck className="h-4 w-4 mr-2" />Recebimentos ({receipts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Table>
            <thead className="bg-secondary/70 text-left">
              <tr><th>Pedido</th><th>Fornecedor</th><th>Loja</th><th>Total</th><th>Status</th><th>Ação</th></tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-t hover:bg-muted/20">
                  <td>#{o.number}</td>
                  <td>{o.suppliers?.trade_name || o.suppliers?.legal_name || "—"}</td>
                  <td>{o.stores?.name || "—"}</td>
                  <td>{money(o.total)}</td>
                  <td><Badge>{statusLabel[o.status] || o.status}</Badge></td>
                  <td className="space-x-2">
                    {["draft", "pending"].includes(o.status) && (
                      <Button size="sm" variant="outline" onClick={() => approve(o.id)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />Aprovar
                      </Button>
                    )}
                    {["approved", "sent", "partially_received"].includes(o.status) && (
                      <Button size="sm" onClick={() => startReceipt(o.id)} disabled={startingReceipt === o.id}>
                        <PackageCheck className="h-4 w-4 mr-1" />{startingReceipt === o.id ? "Abrindo..." : "Receber"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!orders.length && <Empty />}
            </tbody>
          </Table>
        </TabsContent>

        <TabsContent value="receipts">
          <Table>
            <thead className="bg-secondary/70 text-left">
              <tr><th>Recebimento</th><th>Pedido</th><th>Fornecedor</th><th>Nota fiscal</th><th>Total</th><th>Divergências</th><th>Status</th><th>Ação</th></tr>
            </thead>
            <tbody>
              {receipts.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td>{new Date(r.received_at).toLocaleDateString("pt-BR")}</td>
                  <td>{r.purchase_orders?.number ? `#${r.purchase_orders.number}` : "Avulso"}</td>
                  <td>{r.suppliers?.trade_name || r.suppliers?.legal_name || "—"}</td>
                  <td>{r.supplier_invoice_number || "—"}</td>
                  <td>{money(r.total_cost)}</td>
                  <td>
                    {Number(r.discrepancy_count || 0) > 0
                      ? <Badge variant="destructive">{r.discrepancy_count}</Badge>
                      : <Badge variant="outline">0</Badge>}
                  </td>
                  <td><Badge>{statusLabel[r.status] || r.status}</Badge></td>
                  <td className="space-x-2">
                    {r.status === "draft" && <Button size="sm" variant="outline" onClick={() => setConferenceReceiptId(r.id)}>Conferir</Button>}
                    {r.status === "checked" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setConferenceReceiptId(r.id)}>Revisar</Button>
                        <Button size="sm" onClick={() => post(r.id)}>Lançar no estoque</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!receipts.length && <Empty colSpan={8} />}
            </tbody>
          </Table>
        </TabsContent>
      </Tabs>

      <OrderDialog open={openOrder} onOpenChange={setOpenOrder} tenantId={tenantId} stores={stores} suppliers={suppliers} onSaved={refresh} />
      <ReceiptDialog open={openReceipt} onOpenChange={setOpenReceipt} tenantId={tenantId} stores={stores} suppliers={suppliers} orders={orders} onSaved={refresh} onConference={setConferenceReceiptId} />
      <ConferenceDialog receiptId={conferenceReceiptId} onOpenChange={(open: boolean) => !open && setConferenceReceiptId(null)} onSaved={refresh} />
    </ErpPage>
  );
}

function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm"><table className="w-full text-sm">{children}</table></div>;
}

function Empty({ colSpan = 6 }: { colSpan?: number }) {
  return <tr><td colSpan={colSpan} className="p-10 text-center text-muted-foreground">Nenhum registro cadastrado.</td></tr>;
}

function Field({ label, value, onChange, type = "text", placeholder }: any) {
  return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}

function SelectField({ label, value, onChange, options }: any) {
  return <div className="space-y-1"><Label>{label}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Selecione...</option>{options.map((o: any) => <option key={o.id} value={o.id}>{o.name || o.trade_name || o.legal_name}</option>)}</select></div>;
}

function OrderDialog({ open, onOpenChange, tenantId, stores, suppliers, onSaved }: any) {
  const [store, setStore] = useState("");
  const [supplier, setSupplier] = useState("");
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!tenantId || !store || !supplier || !product || Number(qty) <= 0) return toast.error("Preencha loja, fornecedor, produto e quantidade.");
    setSaving(true);
    const { data: order, error } = await (supabase as any)
      .from("purchase_orders")
      .insert({
        tenant_id: tenantId,
        store_id: store,
        supplier_id: supplier,
        status: "draft",
        subtotal: Number(qty) * Number(cost || 0),
        total: Number(qty) * Number(cost || 0),
      })
      .select()
      .single();

    if (!error) {
      const r = await (supabase as any).from("purchase_order_items").insert({
        purchase_order_id: order.id,
        product_id: product,
        quantity_ordered: Number(qty),
        unit_cost: Number(cost || 0),
        line_total: Number(qty) * Number(cost || 0),
      });
      if (r.error) toast.error(r.error.message);
      else {
        toast.success("Pedido criado.");
        onOpenChange(false);
        onSaved();
      }
    } else toast.error(error.message);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo pedido de compra</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <SelectField label="Fornecedor" value={supplier} onChange={setSupplier} options={suppliers} />
          <SelectField label="Loja de destino" value={store} onChange={setStore} options={stores} />
          <Field label="ID do produto" value={product} onChange={setProduct} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade" type="number" value={qty} onChange={setQty} />
            <Field label="Custo unitário" type="number" value={cost} onChange={setCost} />
          </div>
        </div>
        <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Criar pedido"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({ open, onOpenChange, tenantId, stores, suppliers, orders, onSaved, onConference }: any) {
  const [store, setStore] = useState("");
  const [supplier, setSupplier] = useState("");
  const [order, setOrder] = useState("");
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!tenantId || !store || !supplier || !product || Number(qty) <= 0) return toast.error("Preencha loja, fornecedor, produto e quantidade.");
    setSaving(true);
    const { data: receipt, error } = await (supabase as any)
      .from("goods_receipts")
      .insert({
        tenant_id: tenantId,
        store_id: store,
        supplier_id: supplier,
        purchase_order_id: order || null,
        status: "draft",
        total_cost: Number(qty) * Number(cost || 0),
      })
      .select()
      .single();

    if (!error) {
      const r = await (supabase as any).from("goods_receipt_items").insert({
        goods_receipt_id: receipt.id,
        product_id: product,
        quantity: Number(qty),
        unit_cost: Number(cost || 0),
        batch_number: batch || null,
        expiry_date: expiry || null,
      });
      if (r.error) toast.error(r.error.message);
      else {
        toast.success("Recebimento criado. Faça a conferência antes de lançar.");
        onOpenChange(false);
        onSaved();
        onConference(receipt.id);
      }
    } else toast.error(error.message);
    setSaving(false);
  };

  const eligibleOrders = orders.filter((o: any) => ["approved", "sent", "partially_received"].includes(o.status));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Entrada avulsa de mercadorias</DialogTitle></DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Prefira iniciar o recebimento pelo botão <b>Receber</b> de um pedido aprovado. A entrada avulsa permanece disponível para exceções operacionais.
        </div>
        <div className="grid gap-3">
          <SelectField label="Fornecedor" value={supplier} onChange={setSupplier} options={suppliers} />
          <SelectField label="Loja de destino" value={store} onChange={setStore} options={stores} />
          <SelectField label="Pedido relacionado (opcional)" value={order} onChange={setOrder} options={eligibleOrders.map((o: any) => ({ id: o.id, name: `#${o.number}` }))} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID do produto" value={product} onChange={setProduct} />
            <Field label="Quantidade" type="number" value={qty} onChange={setQty} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Custo unitário" type="number" value={cost} onChange={setCost} />
            <Field label="Lote" value={batch} onChange={setBatch} />
          </div>
          <Field label="Validade" type="date" value={expiry} onChange={setExpiry} />
        </div>
        <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Criar para conferência"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConferenceDialog({ receiptId, onOpenChange, onSaved }: { receiptId: string | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceSeries, setInvoiceSeries] = useState("");
  const [invoiceKey, setInvoiceKey] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["goods-receipt-conference", receiptId],
    enabled: !!receiptId,
    queryFn: async () => {
      const receiptRes = await (supabase as any)
        .from("goods_receipts")
        .select("*, suppliers(legal_name,trade_name), purchase_orders(number)")
        .eq("id", receiptId)
        .single();
      if (receiptRes.error) throw receiptRes.error;

      const itemRes = await (supabase as any)
        .from("goods_receipt_items")
        .select("*, products(id,name,barcode,laboratory,requires_prescription,controlled), purchase_order_items(quantity_ordered,quantity_received,unit_cost)")
        .eq("goods_receipt_id", receiptId)
        .order("created_at");
      if (itemRes.error) throw itemRes.error;

      return { receipt: receiptRes.data, items: itemRes.data || [] };
    },
  });

  useEffect(() => {
    if (!data) return;
    setInvoiceNumber(data.receipt.supplier_invoice_number || "");
    setInvoiceSeries(data.receipt.supplier_invoice_series || "");
    setInvoiceKey(data.receipt.supplier_invoice_access_key || "");
    setItems((data.items || []).map((item: any) => ({
      ...item,
      quantity: Number(item.quantity || 0),
      unit_cost: Number(item.unit_cost || 0),
      batch_number: item.batch_number || "",
      expiry_date: item.expiry_date || "",
    })));
  }, [data]);

  const divergencePreview = useMemo(() => items.map((item: any) => {
    const po = item.purchase_order_items;
    if (!po) return { id: item.id, quantity: false, cost: false };
    const expectedQty = Number(po.quantity_ordered || 0) - Number(po.quantity_received || 0);
    return {
      id: item.id,
      quantity: Math.abs(Number(item.quantity || 0) - expectedQty) > 0.001,
      cost: Math.abs(Number(item.unit_cost || 0) - Number(po.unit_cost || 0)) > 0.0001,
    };
  }), [items]);

  const updateItem = (id: string, patch: Record<string, unknown>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const saveDraft = async () => {
    if (!receiptId) return false;
    if (items.some((item) => Number(item.quantity) <= 0 || Number(item.unit_cost) < 0)) {
      toast.error("Quantidade deve ser maior que zero e custo não pode ser negativo.");
      return false;
    }

    setSaving(true);

    const receiptUpdate = await (supabase as any)
      .from("goods_receipts")
      .update({
        supplier_invoice_number: invoiceNumber.trim() || null,
        supplier_invoice_series: invoiceSeries.trim() || null,
        supplier_invoice_access_key: invoiceKey.trim() || null,
      })
      .eq("id", receiptId);

    if (receiptUpdate.error) {
      setSaving(false);
      toast.error(receiptUpdate.error.message);
      return false;
    }

    for (const item of items) {
      const { error } = await (supabase as any)
        .from("goods_receipt_items")
        .update({
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          batch_number: item.batch_number?.trim() || null,
          expiry_date: item.expiry_date || null,
        })
        .eq("id", item.id);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return false;
      }
    }

    setSaving(false);
    await refetch();
    onSaved();
    return true;
  };

  const checkReceipt = async () => {
    if (!receiptId) return;
    const saved = await saveDraft();
    if (!saved) return;

    const first = await (supabase as any).rpc("check_goods_receipt", {
      _receipt_id: receiptId,
      _accept_divergences: false,
    });

    if (first.error) {
      toast.error(first.error.message);
      return;
    }

    if (first.data?.blocking) {
      toast.error("Existem bloqueios na conferência, como item com validade vencida. Corrija antes de continuar.");
      await refetch();
      return;
    }

    if (first.data?.requires_confirmation) {
      const count = Number(first.data?.warning_count || 0);
      const accepted = window.confirm(`Foram encontradas ${count} divergência(s)/alerta(s). Deseja registrar a conferência mesmo assim?`);
      if (!accepted) {
        toast.warning("Conferência mantida em rascunho para correção.");
        await refetch();
        return;
      }

      const second = await (supabase as any).rpc("check_goods_receipt", {
        _receipt_id: receiptId,
        _accept_divergences: true,
      });
      if (second.error) {
        toast.error(second.error.message);
        return;
      }
      toast.success("Recebimento conferido com divergências registradas.");
    } else {
      toast.success("Recebimento conferido sem divergências.");
    }

    await refetch();
    onSaved();
    onOpenChange(false);
  };

  const receipt = data?.receipt;
  const canEdit = receipt?.status !== "posted" && receipt?.status !== "cancelled";
  const discrepancyCount = Number(receipt?.discrepancy_count || 0);

  return (
    <Dialog open={!!receiptId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conferência de recebimento {receipt?.purchase_orders?.number ? `— Pedido #${receipt.purchase_orders.number}` : ""}</DialogTitle>
        </DialogHeader>

        {isFetching && <div className="p-6 text-center text-muted-foreground">Carregando recebimento...</div>}

        {data && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Número da nota fiscal" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="NF do fornecedor" />
              <Field label="Série" value={invoiceSeries} onChange={setInvoiceSeries} />
              <Field label="Chave de acesso" value={invoiceKey} onChange={setInvoiceKey} />
            </div>

            {discrepancyCount > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{discrepancyCount} divergência(s)/alerta(s) registrada(s)</div>
                <div className="mt-1 text-xs">Revise quantidade, custo, lote, validade e nota fiscal antes do lançamento.</div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-secondary/70 text-left">
                  <tr>
                    <th className="p-3">Produto</th>
                    <th className="p-3 text-right">Pedido</th>
                    <th className="p-3 text-right">Recebido</th>
                    <th className="p-3 text-right">Custo pedido</th>
                    <th className="p-3 text-right">Custo recebido</th>
                    <th className="p-3">Lote</th>
                    <th className="p-3">Validade</th>
                    <th className="p-3">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any) => {
                    const po = item.purchase_order_items;
                    const expectedQty = po ? Number(po.quantity_ordered || 0) - Number(po.quantity_received || 0) : null;
                    const preview = divergencePreview.find((d) => d.id === item.id);
                    const traceabilityRequired = !!item.products?.requires_prescription || !!item.products?.controlled;
                    const traceabilityMissing = traceabilityRequired && (!item.batch_number || !item.expiry_date);
                    const expired = !!item.expiry_date && new Date(item.expiry_date + "T12:00:00").getTime() <= Date.now();

                    return (
                      <tr key={item.id} className="border-t align-top">
                        <td className="p-3">
                          <div className="font-semibold">{item.products?.name || item.product_id}</div>
                          <div className="text-[11px] text-muted-foreground">{item.products?.barcode || "Sem EAN"}{item.products?.laboratory ? ` · ${item.products.laboratory}` : ""}</div>
                        </td>
                        <td className="p-3 text-right">{expectedQty == null ? "—" : expectedQty.toLocaleString("pt-BR")}</td>
                        <td className="p-3">
                          <Input disabled={!canEdit} className={`ml-auto w-28 text-right ${preview?.quantity ? "border-amber-500" : ""}`} type="number" min={0.001} step="0.001" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })} />
                        </td>
                        <td className="p-3 text-right">{po ? money(po.unit_cost) : "—"}</td>
                        <td className="p-3">
                          <Input disabled={!canEdit} className={`ml-auto w-32 text-right ${preview?.cost ? "border-amber-500" : ""}`} type="number" min={0} step="0.01" value={item.unit_cost} onChange={(e) => updateItem(item.id, { unit_cost: Number(e.target.value) })} />
                        </td>
                        <td className="p-3"><Input disabled={!canEdit} value={item.batch_number} onChange={(e) => updateItem(item.id, { batch_number: e.target.value })} placeholder="Lote" /></td>
                        <td className="p-3"><Input disabled={!canEdit} type="date" value={item.expiry_date} onChange={(e) => updateItem(item.id, { expiry_date: e.target.value })} /></td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {preview?.quantity && <Badge variant="destructive">Qtd.</Badge>}
                            {preview?.cost && <Badge variant="destructive">Custo</Badge>}
                            {traceabilityMissing && <Badge variant="outline">Lote/validade</Badge>}
                            {expired && <Badge variant="destructive">Vencido</Badge>}
                            {!preview?.quantity && !preview?.cost && !traceabilityMissing && !expired && <Badge variant="outline">OK</Badge>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              Divergência não altera o pedido silenciosamente: ela fica registrada na conferência. Item vencido bloqueia o processo. Medicamentos controlados ou com receita geram alerta quando lote/validade estão ausentes.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {canEdit && <Button variant="outline" onClick={saveDraft} disabled={saving}>{saving ? "Salvando..." : "Salvar rascunho"}</Button>}
          {canEdit && <Button onClick={checkReceipt} disabled={saving}><ClipboardCheck className="h-4 w-4 mr-2" />Conferir recebimento</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
