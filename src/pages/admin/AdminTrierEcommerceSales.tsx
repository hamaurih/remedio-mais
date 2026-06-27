import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Send, RefreshCw, Search, FlaskConical } from "lucide-react";


type Order = {
  id: string;
  customer_name: string;
  total: number;
  created_at: string;
  paid_at: string | null;
  payment_method: string | null;
  payment_status: string;
  order_status: string;
  sales_channel: string;
  trier_sent: boolean;
  trier_sent_at: string | null;
  trier_order_id: string | null;
  trier_status: string | null;
  trier_attempts: number;
  trier_last_error: string | null;
};

type Log = {
  id: string;
  order_id: string | null;
  action: string;
  endpoint: string | null;
  http_status: number | null;
  status: string | null;
  error_message: string | null;
  request_payload_masked: any;
  response_payload_masked: any;
  created_at: string;
};

const PRESETS: { id: "pix_native" | "site_pix_card" | "site_debit_card" | "site_credit_card"; label: string }[] = [
  { id: "pix_native", label: "Pix nativo" },
  { id: "site_pix_card", label: "Pix site via cartão" },
  { id: "site_debit_card", label: "Cartão débito site" },
  { id: "site_credit_card", label: "Cartão crédito site" },
];

const getNumeroAutorizacaoType = (result?: PresetResult) => {
  if (!result) return "—";
  if (result.numero_autorizacao_type) return result.numero_autorizacao_type;
  const pixValue = result.request_masked?.pagamentoMultiplo?.pix?.numeroAutorizacao;
  const cardValue = result.request_masked?.pagamentoMultiplo?.cartao?.[0]?.numeroAutorizacao;
  const value = pixValue ?? cardValue;
  return value === undefined ? "—" : typeof value;
};

type PresetResult = {
  preset: string;
  ok: boolean;
  http_status?: number;
  error?: string | null;
  response?: any;
  request_masked?: any;
  numero_autorizacao_type?: string;
  url?: string;
  method?: string;
  base_mode?: string;
  timestamp?: string;
};

type ConnTest = {
  ok: boolean;
  reachable?: boolean;
  url?: string;
  base_mode?: string;
  http_status?: number;
  error?: string | null;
  response?: any;
  elapsed_ms?: number;
  timestamp?: string;
};


export default function AdminTrierEcommerceSales() {
  const [settings, setSettings] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [filter, setFilter] = useState<"not_sent" | "sent" | "error" | "all">("not_sent");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testOrderId, setTestOrderId] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, PresetResult>>({});


  const loadAll = async () => {
    setLoading(true);
    const [s, o, l] = await Promise.all([
      supabase.from("trier_settings").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("orders")
        .select("id,customer_name,total,created_at,paid_at,payment_method,payment_status,order_status,sales_channel,trier_sent,trier_sent_at,trier_order_id,trier_status,trier_attempts,trier_last_error")
        .eq("sales_channel", "site")
        .eq("payment_status", "approved")
        .order("paid_at", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from("trier_order_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setSettings(s.data || {});
    setOrders((o.data as any) || []);
    setLogs((l.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const saveSettings = async () => {
    const payload = {
      id: 1,
      auto_send_orders_enabled: false,
      pix_payment_code: settings.pix_payment_code ? Number(settings.pix_payment_code) : null,
      card_payment_code: settings.card_payment_code ? Number(settings.card_payment_code) : null,
      seller_code: settings.seller_code ? Number(settings.seller_code) : null,
      seller_name: settings.seller_name || null,
      delivery_fee_product_code: settings.delivery_fee_product_code || null,
      delivery_fee_product_name: settings.delivery_fee_product_name || null,
      trier_payment_mode: settings.trier_payment_mode || "pix_native",
      trier_pix_native_code: settings.trier_pix_native_code ? Number(settings.trier_pix_native_code) : null,
      trier_site_pix_card_code: settings.trier_site_pix_card_code ? Number(settings.trier_site_pix_card_code) : null,
      trier_site_debit_card_code: settings.trier_site_debit_card_code ? Number(settings.trier_site_debit_card_code) : null,
      trier_site_credit_card_code: settings.trier_site_credit_card_code ? Number(settings.trier_site_credit_card_code) : null,
    };
    const { error } = await supabase.from("trier_settings").update(payload).eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success("Configuração salva");
  };


  const sendOrder = async (orderId: string, force = false) => {
    setBusyId(orderId);
    const { data, error } = await supabase.functions.invoke("send-order-to-trier", {
      body: { order_id: orderId, force },
    });
    setBusyId(null);
    if (error) toast.error(error.message || "Erro ao enviar");
    else if ((data as any)?.ok) toast.success("Pedido enviado ao Trier");
    else if ((data as any)?.skipped) toast.info(`Ignorado: ${(data as any).reason}`);
    else toast.error((data as any)?.error || "Falha no envio");
    await loadAll();
  };

  const consultOrder = async (orderId: string) => {
    setBusyId(orderId);
    const { data, error } = await supabase.functions.invoke("consult-trier-ecommerce-sale", {
      body: { order_id: orderId },
    });
    setBusyId(null);
    if (error) toast.error(error.message || "Erro ao consultar");
    else toast.success(`Consulta concluída: HTTP ${(data as any)?.http_status}`);
    await loadAll();
  };

  const runPreset = async (orderId: string, preset: string) => {
    setTestBusy(preset);
    const { data, error } = await supabase.functions.invoke("send-order-to-trier", {
      body: { order_id: orderId, action: "test_payment_preset", preset },
    });
    setTestBusy(null);
    const result: PresetResult = error
      ? { preset, ok: false, error: error.message }
      : { preset, ...(data as any) };
    setTestResults((prev) => ({ ...prev, [preset]: result }));
    if (result.ok) toast.success(`${preset}: HTTP ${result.http_status} OK`);
    else toast.error(`${preset}: ${result.error || "falhou"}`);
  };

  const runAllPresets = async (orderId: string) => {
    setTestOrderId(orderId);
    setTestResults({});
    for (const p of PRESETS) {
      await runPreset(orderId, p.id);
    }
  };


  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "not_sent") return orders.filter((o) => !o.trier_sent && o.trier_status !== "error");
    if (filter === "sent") return orders.filter((o) => o.trier_sent);
    return orders.filter((o) => o.trier_status === "error" || o.trier_last_error);
  }, [orders, filter]);

  if (loading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const cfgMissing: string[] = [];
  if (!settings?.seller_code) cfgMissing.push("seller_code");
  if (!settings?.seller_name) cfgMissing.push("seller_name");
  if (!settings?.pix_payment_code) cfgMissing.push("pix_payment_code");
  if (!settings?.card_payment_code) cfgMissing.push("card_payment_code");
  if (!settings?.delivery_fee_product_code) cfgMissing.push("delivery_fee_product_code");

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Trier — Vendas E-commerce</h1>
        <Button variant="outline" size="sm" onClick={loadAll}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-semibold">Envio automático ao Trier</div>
            <div className="text-xs text-muted-foreground">
              Quando ligado, todo pedido do site com pagamento aprovado é enviado automaticamente.
              Mantenha desligado até homologar um pedido real.
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={false}
              disabled
              onChange={() => setSettings({ ...settings, auto_send_orders_enabled: false })}
              className="h-4 w-4"
            />
            <span className="text-sm">Desligado</span>
          </label>
        </div>

        {cfgMissing.length > 0 && (
          <div className="text-xs bg-destructive/10 text-destructive border border-destructive/30 rounded p-2 mb-3">
            Configuração incompleta: <strong>{cfgMissing.join(", ")}</strong>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Código vendedor padrão</Label>
            <Input type="number" value={settings?.seller_code ?? ""} onChange={(e) => setSettings({ ...settings, seller_code: e.target.value })} /></div>
          <div className="space-y-1"><Label>Nome vendedor padrão</Label>
            <Input value={settings?.seller_name ?? ""} onChange={(e) => setSettings({ ...settings, seller_name: e.target.value })} /></div>

          <div className="space-y-1 md:col-span-2">
            <Label>Modo de pagamento Trier (usado no envio real)</Label>
            <Select
              value={settings?.trier_payment_mode || "pix_native"}
              onValueChange={(v) => setSettings({ ...settings, trier_payment_mode: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              Define em qual objeto o código entra: <code>pagamentoMultiplo.pix</code> (Pix nativo) ou <code>pagamentoMultiplo.cartao[]</code> (demais).
            </div>
          </div>

          <div className="space-y-1"><Label>Código Pix nativo (Trier)</Label>
            <Input type="number" value={settings?.trier_pix_native_code ?? ""} onChange={(e) => setSettings({ ...settings, trier_pix_native_code: e.target.value })} /></div>
          <div className="space-y-1"><Label>Código Pix site via cartão</Label>
            <Input type="number" value={settings?.trier_site_pix_card_code ?? ""} onChange={(e) => setSettings({ ...settings, trier_site_pix_card_code: e.target.value })} /></div>
          <div className="space-y-1"><Label>Código cartão débito site</Label>
            <Input type="number" value={settings?.trier_site_debit_card_code ?? ""} onChange={(e) => setSettings({ ...settings, trier_site_debit_card_code: e.target.value })} /></div>
          <div className="space-y-1"><Label>Código cartão crédito site</Label>
            <Input type="number" value={settings?.trier_site_credit_card_code ?? ""} onChange={(e) => setSettings({ ...settings, trier_site_credit_card_code: e.target.value })} /></div>

          <div className="space-y-1"><Label>Código pagamento Pix (legado)</Label>
            <Input type="number" value={settings?.pix_payment_code ?? ""} onChange={(e) => setSettings({ ...settings, pix_payment_code: e.target.value })} /></div>
          <div className="space-y-1"><Label>Código pagamento Cartão (legado)</Label>
            <Input type="number" value={settings?.card_payment_code ?? ""} onChange={(e) => setSettings({ ...settings, card_payment_code: e.target.value })} /></div>
          <div className="space-y-1"><Label>Código produto Taxa de Entrega</Label>
            <Input value={settings?.delivery_fee_product_code ?? ""} onChange={(e) => setSettings({ ...settings, delivery_fee_product_code: e.target.value })} /></div>
          <div className="space-y-1"><Label>Nome produto Taxa de Entrega</Label>
            <Input value={settings?.delivery_fee_product_name ?? ""} onChange={(e) => setSettings({ ...settings, delivery_fee_product_name: e.target.value })} /></div>
        </div>
        <Button className="mt-3" onClick={saveSettings}>Salvar configuração</Button>
      </Card>


      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="not_sent">Não enviados ({orders.filter((o) => !o.trier_sent && o.trier_status !== "error").length})</TabsTrigger>
          <TabsTrigger value="sent">Enviados ({orders.filter((o) => o.trier_sent).length})</TabsTrigger>
          <TabsTrigger value="error">Com erro ({orders.filter((o) => o.trier_status === "error" || o.trier_last_error).length})</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
        <TabsContent value={filter}>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-3">Pedido</th>
                  <th className="text-left p-3">Cliente</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-left p-3">Pagamento</th>
                  <th className="text-left p-3">Trier</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sem pedidos.</td></tr>
                )}
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-3 font-mono text-xs">
                      #{o.id.slice(0, 6)}
                      <div className="text-muted-foreground">{new Date(o.paid_at || o.created_at).toLocaleString("pt-BR")}</div>
                    </td>
                    <td className="p-3">{o.customer_name}</td>
                    <td className="p-3 text-right">R$ {Number(o.total).toFixed(2)}</td>
                    <td className="p-3 text-xs">{o.payment_method || "—"}</td>
                    <td className="p-3 text-xs">
                      {o.trier_sent ? (
                        <Badge variant="default">enviado{o.trier_order_id ? ` · ${o.trier_order_id}` : ""}</Badge>
                      ) : o.trier_status === "error" || o.trier_last_error ? (
                        <div>
                          <Badge variant="destructive">erro</Badge>
                          {o.trier_last_error && <div className="text-destructive mt-1 max-w-xs truncate" title={o.trier_last_error}>{o.trier_last_error}</div>}
                        </div>
                      ) : (
                        <Badge variant="secondary">pendente</Badge>
                      )}
                      {o.trier_attempts > 0 && <div className="text-muted-foreground">tentativas: {o.trier_attempts}</div>}
                    </td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" variant="outline" disabled={busyId === o.id} onClick={() => sendOrder(o.id, o.trier_sent)}>
                        {busyId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                        {o.trier_sent ? "Reenviar" : "Enviar"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === o.id} onClick={() => consultOrder(o.id)}>
                        <Search className="h-3 w-3 mr-1" />Consultar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => runAllPresets(o.id)}>
                        <FlaskConical className="h-3 w-3 mr-1" />Testar pagamento
                      </Button>

                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      {testOrderId && (
        <Card className="p-4 border-primary/40">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Testar pagamento no Trier · pedido #{testOrderId.slice(0, 6)}
              </div>
              <div className="text-xs text-muted-foreground">
                Executa cada preset isoladamente. Não atualiza o pedido nem marca como enviado.
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => runAllPresets(testOrderId)}>
                Rodar todos
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setTestOrderId(null); setTestResults({}); }}>
                Fechar
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PRESETS.map((p) => {
              const r = testResults[p.id];
              return (
                <div key={p.id} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{p.label}</div>
                    <Button size="sm" variant="outline" disabled={testBusy === p.id}
                      onClick={() => runPreset(testOrderId, p.id)}>
                      {testBusy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Testar"}
                    </Button>
                  </div>
                  {r ? (
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant={r.ok ? "default" : "destructive"}>
                          {r.ok ? "OK" : "FALHOU"}
                        </Badge>
                        <span>HTTP {r.http_status ?? "—"}</span>
                        <span className="text-muted-foreground">numeroAutorizacao type = {getNumeroAutorizacaoType(r)}</span>
                        {r.timestamp && <span className="text-muted-foreground ml-auto">{new Date(r.timestamp).toLocaleTimeString("pt-BR")}</span>}
                      </div>
                      {r.error && <div className="text-destructive break-all">{r.error}</div>}
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">Payload enviado (mascarado)</summary>
                        <pre className="bg-muted p-2 rounded overflow-auto max-h-48 mt-1">{JSON.stringify(r.request_masked, null, 2)}</pre>
                      </details>
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">Resposta Trier</summary>
                        <pre className="bg-muted p-2 rounded overflow-auto max-h-48 mt-1">{JSON.stringify(r.response, null, 2)}</pre>
                      </details>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Aguardando teste.</div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="font-semibold mb-3">Últimas requisições ao Trier (mascaradas)</div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {logs.length === 0 && <div className="text-sm text-muted-foreground">Sem logs.</div>}
          {logs.map((l) => (
            <details key={l.id} className="border rounded p-2 text-xs">
              <summary className="cursor-pointer flex items-center gap-2">
                <Badge variant={l.status === "ok" ? "default" : "destructive"}>{l.status}</Badge>
                <span className="font-mono">{l.action}</span>
                <span className="text-muted-foreground">{l.endpoint}</span>
                <span className="ml-auto text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")} · HTTP {l.http_status ?? "—"}</span>
              </summary>
              {l.error_message && <div className="mt-2 text-destructive">{l.error_message}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                <div>
                  <div className="font-semibold mb-1">Request</div>
                  <pre className="bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(l.request_payload_masked, null, 2)}</pre>
                </div>
                <div>
                  <div className="font-semibold mb-1">Response</div>
                  <pre className="bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(l.response_payload_masked, null, 2)}</pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
