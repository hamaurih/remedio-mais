import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, RefreshCw, Plug, Package, Boxes, Tag, ShoppingCart, FileText, ListChecks, Send, Eye } from "lucide-react";
import { formatBRL } from "@/lib/store";

const TABS = ["overview", "config", "products", "stock", "prices", "mapping", "orders", "status", "logs"] as const;
type Tab = typeof TABS[number];

const SUB_ROUTE_TO_TAB: Record<string, Tab> = {
  products: "products", stock: "stock", prices: "prices", orders: "orders", logs: "logs",
};

const FIELD_MAP: { trier: string; site: string; note?: string }[] = [
  { trier: "codigo", site: "trier_product_id" },
  { trier: "nome", site: "name" },
  { trier: "nomeEcommerce", site: "ecommerce_name", note: "se vazio, usa 'nome'" },
  { trier: "descricaoEcommerce", site: "description" },
  { trier: "codigoBarras", site: "barcode / trier_barcode" },
  { trier: "nomeLaboratorio", site: "laboratory / manufacturer" },
  { trier: "nomeGrupo", site: "group_name" },
  { trier: "nomeCategoria", site: "category_name" },
  { trier: "nomeDepartamento", site: "department_name" },
  { trier: "nomePrincipioAtivo", site: "active_ingredient" },
  { trier: "valorVenda", site: "price (se não houver valorVendaEcommerce)" },
  { trier: "valorVendaEcommerce", site: "price + ecommerce_price" },
  { trier: "quantidadeEstoque", site: "stock_quantity" },
  { trier: "quantidadeEstoqueEcommerce", site: "stock + ecommerce_stock_quantity" },
  { trier: "ativo", site: "is_active" },
  { trier: "integracaoEcommerce", site: "ecommerce_enabled" },
  { trier: "percentualDesconto", site: "discount_percentage" },
  { trier: "percentualDescontoMax", site: "max_discount_percentage" },
  { trier: "observacaoVenda", site: "sale_observation" },
  { trier: "tipoLista", site: "medicine_list_type → tarja + requires_prescription" },
  { trier: "qtdLimiteCarrinhoEcommerce", site: "cart_quantity_limit" },
  { trier: "tags", site: "tags" },
];

const SYNC_TYPES: Record<string, string> = {
  products: "Produtos (completo)", products_changed: "Produtos (alterados)",
  categories: "Categorias", stock: "Estoque", prices: "Preços", discounts: "Descontos",
};

function cleanTrierToken(input: string) {
  return (input || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\r?\n|\r/g, "")
    .replace(/^(Bearer\s+)+/i, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeBaseUrl(baseUrl: string, environment: string) {
  let base = (baseUrl || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\r?\n|\r/g, "")
    .replace(/\/+$/, "")
    .replace(/\/rest\/.*$/i, "");

  if (environment === "homologacao" && /^http:\/\//i.test(base)) {
    base = `https://${base.slice(7)}`;
  }

  if (/^https?:\/\/homologacao\.triersistemas\.com\.br(\/.*)?$/i.test(base)) {
    return "https://homologacao.triersistemas.com.br/sgfpod1";
  }

  return base.replace(/\/api-sgf(\/.*)?$/i, "/sgfpod1").replace(/\/+$/, "");
}

function buildTrierUrl(baseUrl: string, endpoint: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}

function maskToken(t: string | null | undefined) {
  if (!t) return "";
  const token = cleanTrierToken(t);
  if (!token) return "";
  if (token.length <= 6) return `${token.slice(0, 1)}...${token.slice(-1)}`;
  return `${token.slice(0, 3)}...${token.slice(-3)}`;
}

export default function AdminTrier() {
  const qc = useQueryClient();
  const { sub } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: Tab = (SUB_ROUTE_TO_TAB[sub || ""] || (searchParams.get("tab") as Tab) || "overview");
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => { if (sub && SUB_ROUTE_TO_TAB[sub]) setTab(SUB_ROUTE_TO_TAB[sub]); }, [sub]);

  // ----- Settings -----
  const { data: settings } = useQuery({
    queryKey: ["trier_settings"],
    queryFn: async () => (await supabase.from("trier_settings").select("id, environment, base_url, branch_code, page_size, ecommerce_filter_enabled, sync_products_enabled, sync_categories_enabled, sync_stock_enabled, sync_prices_enabled, sync_discounts_enabled, send_orders_enabled, check_order_status_enabled, schedule_products_minutes, schedule_stock_minutes, schedule_prices_minutes, schedule_discounts_minutes, last_connection_test_at, last_connection_status, last_sync_products_at, last_sync_categories_at, last_sync_stock_at, last_sync_prices_at, last_sync_discounts_at").eq("id", 1).single()).data,
  });
  const [form, setForm] = useState<any>({});
  const [tokenInput, setTokenInput] = useState("");
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const saveSettings = async () => {
    const payload = {
      ...form,
      base_url: normalizeBaseUrl(form.base_url || "", form.environment || "homologacao"),
    };
    if (tokenInput) payload.bearer_token = cleanTrierToken(tokenInput);
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    const { error } = await supabase.from("trier_settings").update(payload).eq("id", 1);
    if (error) toast.error(error.message);
    else { toast.success("Configurações salvas"); setTokenInput(""); qc.invalidateQueries({ queryKey: ["trier_settings"] }); }
  };

  // ----- Calls helper -----
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTestResult, setLastTestResult] = useState<any>(null);
  const call = async (action: string, body: any = {}, label = action) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("trier", { body: { action, ...body } });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      toast.success(`${label} ✓`);
      qc.invalidateQueries({ queryKey: ["trier_jobs"] });
      qc.invalidateQueries({ queryKey: ["trier_logs"] });
      qc.invalidateQueries({ queryKey: ["trier_settings"] });
      qc.invalidateQueries({ queryKey: ["trier_mappings"] });
      qc.invalidateQueries({ queryKey: ["trier_orders"] });
      return data;
    } catch (e: any) { toast.error(e.message); return null; }
    finally { setBusy(null); }
  };

  const runConnectionTest = async () => {
    setBusy("test-connection");
    try {
      const { data, error } = await supabase.functions.invoke("trier", { body: { action: "test-connection" } });
      if (error) throw error;
      setLastTestResult(data);
      if (data?.ok) toast.success("Conexão Trier validada");
      else toast.error(data?.message || "Falha ao validar conexão Trier");
      qc.invalidateQueries({ queryKey: ["trier_logs"] });
      qc.invalidateQueries({ queryKey: ["trier_settings"] });
      return data;
    } catch (e: any) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runProductsTest = async () => {
    setBusy("test-products-endpoint");
    try {
      const { data, error } = await supabase.functions.invoke("trier", { body: { action: "test-products-endpoint" } });
      if (error) throw error;
      setLastTestResult(data);
      if (data?.ok) toast.success("Teste de produtos Trier concluído");
      else toast.error(data?.message || "Falha ao testar produtos Trier");
      qc.invalidateQueries({ queryKey: ["trier_logs"] });
      qc.invalidateQueries({ queryKey: ["trier_settings"] });
      return data;
    } catch (e: any) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  // ----- Data queries -----
  const { data: jobs } = useQuery({
    queryKey: ["trier_jobs"],
    queryFn: async () => (await supabase.from("trier_sync_jobs").select("*").order("started_at", { ascending: false }).limit(50)).data || [],
  });
  const { data: logs } = useQuery({
    queryKey: ["trier_logs"],
    queryFn: async () => (await supabase.from("trier_logs").select("*").order("created_at", { ascending: false }).limit(100)).data || [],
  });
  const { data: mappings } = useQuery({
    queryKey: ["trier_mappings"],
    queryFn: async () => (await supabase.from("trier_product_mappings").select("*, products(name, stock, price, active)").order("last_synced_at", { ascending: false }).limit(200)).data || [],
  });
  const { data: orders } = useQuery({
    queryKey: ["trier_orders"],
    queryFn: async () => (await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100)).data || [],
  });

  const [logDetail, setLogDetail] = useState<any>(null);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Plug className="h-6 w-6 text-primary" /> Trier Drogarias</h1>
          <p className="text-sm text-muted-foreground">Integração oficial com o Webservice Trier 1.5.23</p>
        </div>
        <div className="flex gap-2 text-xs">
          {settings?.last_connection_status === "ok" && <Badge variant="secondary" className="bg-whatsapp/10 text-whatsapp">Conectado</Badge>}
          {settings?.last_connection_status === "error" && <Badge variant="destructive">Falha</Badge>}
          {!settings?.last_connection_status && <Badge variant="outline">Nunca testado</Badge>}
          <Badge variant="outline">{settings?.environment === "producao" ? "PRODUÇÃO" : "Homologação"}</Badge>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setSearchParams({ tab: v }); }}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="stock">Estoque</TabsTrigger>
          <TabsTrigger value="prices">Preços e Descontos</TabsTrigger>
          <TabsTrigger value="mapping">Mapeamento</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="status">Status Pedidos</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* ---------- VISÃO GERAL ---------- */}
        <TabsContent value="overview" className="pt-4">
          <div className="grid md:grid-cols-3 gap-3">
            <Card title="Conexão" value={settings?.last_connection_status === "ok" ? "OK" : (settings?.last_connection_status === "error" ? "Erro" : "—")} sub={settings?.last_connection_test_at ? new Date(settings.last_connection_test_at).toLocaleString("pt-BR") : "Nunca testado"} />
            <Card title="Produtos vinculados" value={String(mappings?.length ?? 0)} sub="Com trier_product_id" />
            <Card title="Pedidos pendentes" value={String(orders?.filter((o: any) => !o.trier_sent).length ?? 0)} sub="Não enviados à Trier" />
            <Card title="Último sync produtos" value={settings?.last_sync_products_at ? new Date(settings.last_sync_products_at).toLocaleString("pt-BR") : "—"} />
            <Card title="Último sync estoque" value={settings?.last_sync_stock_at ? new Date(settings.last_sync_stock_at).toLocaleString("pt-BR") : "—"} />
            <Card title="Último sync preços" value={settings?.last_sync_prices_at ? new Date(settings.last_sync_prices_at).toLocaleString("pt-BR") : "—"} />
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Button onClick={runConnectionTest} disabled={busy !== null}><Plug className="h-4 w-4 mr-2" />Testar conexão</Button>
            <Button onClick={() => call("sync-all", { trigger: "manual" }, "Sincronização completa")} disabled={busy !== null} variant="secondary"><RefreshCw className={`h-4 w-4 mr-2 ${busy === "sync-all" ? "animate-spin" : ""}`} />Sincronizar tudo</Button>
          </div>
        </TabsContent>

        {/* ---------- CONFIGURAÇÃO ---------- */}
        <TabsContent value="config" className="pt-4 space-y-4">
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <h2 className="font-bold">Conexão</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ambiente</Label>
                <Select value={form.environment || "homologacao"} onValueChange={(v) => setForm({
                  ...form, environment: v,
                  base_url: v === "homologacao" ? "https://homologacao.triersistemas.com.br/sgfpod1" : form.base_url,
                })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacao">Homologação</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Base URL</Label><Input value={form.base_url || ""} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://..." /></div>
              <div className="space-y-1 md:col-span-2">
                <Label>Bearer Token</Label>
                <Input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder={tokenInput ? maskToken(tokenInput) : "Cole o token aqui (com ou sem Bearer)"} />
                <p className="text-xs text-muted-foreground">Token nunca é exibido após salvo. Mostrado apenas mascarado.</p>
              </div>
              <div className="space-y-1"><Label>Código da filial (opcional)</Label><Input value={form.branch_code || ""} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} /></div>
              <div className="space-y-1"><Label>Tamanho da página</Label><Input type="number" value={form.page_size || 100} onChange={(e) => setForm({ ...form, page_size: Number(e.target.value) })} /></div>
            </div>
            <p className="text-xs text-muted-foreground border-t pt-2">⚠️ A produção pode usar endereço local ou externo, dependendo de IP fixo, DDNS e NAT da porta 4647 da farmácia.</p>
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-2">
            <h2 className="font-bold">Filtros e flags de sincronização</h2>
            <FlagRow label="Aplicar filtro integracaoEcommerce=true" checked={!!form.ecommerce_filter_enabled} onChange={(v) => setForm({ ...form, ecommerce_filter_enabled: v })} />
            <FlagRow label="Sincronizar produtos" checked={!!form.sync_products_enabled} onChange={(v) => setForm({ ...form, sync_products_enabled: v })} />
            <FlagRow label="Sincronizar categorias" checked={!!form.sync_categories_enabled} onChange={(v) => setForm({ ...form, sync_categories_enabled: v })} />
            <FlagRow label="Sincronizar estoque" checked={!!form.sync_stock_enabled} onChange={(v) => setForm({ ...form, sync_stock_enabled: v })} />
            <FlagRow label="Sincronizar preços" checked={!!form.sync_prices_enabled} onChange={(v) => setForm({ ...form, sync_prices_enabled: v })} />
            <FlagRow label="Sincronizar descontos" checked={!!form.sync_discounts_enabled} onChange={(v) => setForm({ ...form, sync_discounts_enabled: v })} />
            <FlagRow label="Enviar pedidos para Trier" checked={!!form.send_orders_enabled} onChange={(v) => setForm({ ...form, send_orders_enabled: v })} />
            <FlagRow label="Consultar status de pedidos" checked={!!form.check_order_status_enabled} onChange={(v) => setForm({ ...form, check_order_status_enabled: v })} />
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-3">
            <h2 className="font-bold">Agendamento (minutos entre execuções)</h2>
            <div className="grid md:grid-cols-4 gap-3">
              <ScheduleField label="Produtos" value={form.schedule_products_minutes} onChange={(v) => setForm({ ...form, schedule_products_minutes: v })} />
              <ScheduleField label="Estoque" value={form.schedule_stock_minutes} onChange={(v) => setForm({ ...form, schedule_stock_minutes: v })} />
              <ScheduleField label="Preços" value={form.schedule_prices_minutes} onChange={(v) => setForm({ ...form, schedule_prices_minutes: v })} />
              <ScheduleField label="Descontos" value={form.schedule_discounts_minutes} onChange={(v) => setForm({ ...form, schedule_discounts_minutes: v })} />
            </div>
            <p className="text-xs text-muted-foreground">Cron roda a cada 15min e decide o que executar com base nesses intervalos. Tipos desativados acima são ignorados.</p>
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-2">
            <h2 className="font-bold">URL final montada</h2>
            <p className="text-xs text-muted-foreground">Token nunca é exibido. Esta é a URL exata que a edge function vai chamar.</p>
            {(() => {
              const base = normalizeBaseUrl(form.base_url || "", form.environment || "homologacao");
              const endpoint = "/rest/integracao/produto/obter-todos-v1?primeiroRegistro=0&quantidadeRegistros=50";
              const tokenMasked = tokenInput ? maskToken(tokenInput) : "";
              return (
                <div className="space-y-1 text-xs font-mono break-all">
                  <div><span className="text-muted-foreground">ambiente:</span> {form.environment === "producao" ? "Produção" : "Homologação"}</div>
                  <div><span className="text-muted-foreground">baseUrl:</span> {base || "—"}</div>
                  <div><span className="text-muted-foreground">endpoint:</span> {endpoint}</div>
                  <div><span className="text-muted-foreground">URL final:</span> <span className="text-primary">{base ? buildTrierUrl(base, endpoint) : "—"}</span></div>
                  <div><span className="text-muted-foreground">token mascarado:</span> {tokenMasked || "será mascarado após o teste"}</div>
                  <div><span className="text-muted-foreground">header mascarado:</span> {tokenMasked ? `Authorization: Bearer ${tokenMasked}` : "Authorization: Bearer ***"}</div>
                </div>
              );
            })()}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={saveSettings}>Salvar configurações</Button>
            <Button variant="outline" onClick={runConnectionTest} disabled={busy !== null}>
              <Plug className="h-4 w-4 mr-2" />Testar conexão
            </Button>
            <Button variant="outline" onClick={runProductsTest} disabled={busy !== null}>
              <Package className="h-4 w-4 mr-2" />Testar Produtos Trier
            </Button>
          </div>

          {lastTestResult && (
            <div className="bg-card border rounded-xl p-4 space-y-2">
              <h2 className="font-bold flex items-center gap-2">
                Resultado do último teste
                <Badge variant={lastTestResult.ok ? "default" : "destructive"}>HTTP {lastTestResult.status ?? "—"}</Badge>
              </h2>
              {lastTestResult.message && <p className="text-sm text-muted-foreground">{lastTestResult.message}</p>}
              <div className="text-xs font-mono break-all space-y-1">
                <div><span className="text-muted-foreground">Ambiente:</span> {lastTestResult.environment === "producao" ? "Produção" : "Homologação"}</div>
                <div><span className="text-muted-foreground">Base URL usada:</span> {lastTestResult.baseUrl || "—"}</div>
                <div><span className="text-muted-foreground">Endpoint usado:</span> {lastTestResult.endpoint || "—"}</div>
                <div><span className="text-muted-foreground">URL final montada:</span> {lastTestResult.finalUrl || "—"}</div>
                <div><span className="text-muted-foreground">Token mascarado:</span> {lastTestResult.tokenMasked || "—"}</div>
                <div><span className="text-muted-foreground">Header mascarado:</span> {lastTestResult.authorizationHeaderMasked || "—"}</div>
                <div><span className="text-muted-foreground">Status HTTP:</span> {lastTestResult.status ?? "—"}</div>
                <div><span className="text-muted-foreground">Tempo de resposta:</span> {lastTestResult.responseTimeMs != null ? `${lastTestResult.responseTimeMs} ms` : "—"}</div>
                {lastTestResult.count != null && <div><span className="text-muted-foreground">Itens retornados:</span> {lastTestResult.count}</div>}
                {lastTestResult.error && <div className="text-destructive">Erro técnico: {lastTestResult.error}</div>}
                {lastTestResult.body && (
                  <pre className="bg-muted p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap">{lastTestResult.body}</pre>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ---------- PRODUTOS ---------- */}
        <TabsContent value="products" className="pt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => call("sync-products", { trigger: "manual" }, "Produtos sincronizados")} disabled={busy !== null}>
              <Package className="h-4 w-4 mr-2" />Sincronizar produtos (completo)
            </Button>
            <Button variant="secondary" onClick={() => call("sync-products", { trigger: "manual", changed: true }, "Produtos alterados sincronizados")} disabled={busy !== null}>
              <RefreshCw className="h-4 w-4 mr-2" />Sincronizar alterados (desde último sync)
            </Button>
            <Button variant="outline" onClick={() => call("sync-categories", { trigger: "manual" }, "Categorias sincronizadas")} disabled={busy !== null}>
              <Tag className="h-4 w-4 mr-2" />Sincronizar categorias
            </Button>
          </div>
          <JobsTable jobs={(jobs || []).filter((j: any) => j.sync_type.startsWith("products") || j.sync_type === "categories")} />
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="p-3 border-b font-bold">Produtos vinculados à Trier ({mappings?.length || 0})</div>
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr><th className="p-2">Código Trier</th><th className="p-2">Nome</th><th className="p-2">Preço</th><th className="p-2">Estoque</th><th className="p-2">Ativo</th><th className="p-2">Último sync</th></tr>
              </thead>
              <tbody>
                {(mappings || []).slice(0, 100).map((m: any) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{m.trier_product_id}</td>
                    <td className="p-2">{m.products?.name || m.trier_name}</td>
                    <td className="p-2">{m.products?.price ? formatBRL(m.products.price) : "—"}</td>
                    <td className="p-2">{m.products?.stock ?? "—"}</td>
                    <td className="p-2">{m.products?.active ? "Sim" : "Não"}</td>
                    <td className="p-2 text-xs">{m.last_synced_at ? new Date(m.last_synced_at).toLocaleString("pt-BR") : "—"}</td>
                  </tr>
                ))}
                {(mappings || []).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum produto vinculado ainda. Clique em "Sincronizar produtos".</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ---------- ESTOQUE ---------- */}
        <TabsContent value="stock" className="pt-4 space-y-3">
          <Button onClick={() => call("sync-stock", { trigger: "manual" }, "Estoque sincronizado")} disabled={busy !== null}>
            <Boxes className="h-4 w-4 mr-2" />Sincronizar estoque agora
          </Button>
          <JobsTable jobs={(jobs || []).filter((j: any) => j.sync_type === "stock")} />
        </TabsContent>

        {/* ---------- PREÇOS / DESCONTOS ---------- */}
        <TabsContent value="prices" className="pt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => call("sync-prices", { trigger: "manual" }, "Preços sincronizados")} disabled={busy !== null}>
              <Tag className="h-4 w-4 mr-2" />Sincronizar preços
            </Button>
            <Button variant="secondary" onClick={() => call("sync-discounts", { trigger: "manual" }, "Descontos sincronizados")} disabled={busy !== null}>
              <Tag className="h-4 w-4 mr-2" />Sincronizar descontos
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Endpoints adicionais (vigência, progressivo, condição de pagamento, encartes) estão preparados na arquitetura e serão expostos quando habilitados.</p>
          <JobsTable jobs={(jobs || []).filter((j: any) => j.sync_type === "prices" || j.sync_type === "discounts")} />
        </TabsContent>

        {/* ---------- MAPEAMENTO ---------- */}
        <TabsContent value="mapping" className="pt-4">
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="p-3 border-b font-bold">Mapeamento de campos Trier → Site</div>
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr><th className="p-2">Campo Trier</th><th className="p-2">Campo do site</th><th className="p-2">Observação</th></tr>
              </thead>
              <tbody>
                {FIELD_MAP.map((m) => (
                  <tr key={m.trier} className="border-t">
                    <td className="p-2 font-mono text-xs">{m.trier}</td>
                    <td className="p-2 font-mono text-xs text-primary">{m.site}</td>
                    <td className="p-2 text-xs text-muted-foreground">{m.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ---------- PEDIDOS ---------- */}
        <TabsContent value="orders" className="pt-4 space-y-3">
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="p-3 border-b font-bold flex items-center justify-between">
              <span>Pedidos e-commerce ({orders?.length || 0})</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr><th className="p-2">Data</th><th className="p-2">Cliente</th><th className="p-2">Total</th><th className="p-2">Enviado?</th><th className="p-2">Status Trier</th><th className="p-2">Erro</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {(orders || []).map((o: any) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-2 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                    <td className="p-2">{o.customer_name}</td>
                    <td className="p-2">{formatBRL(o.total)}</td>
                    <td className="p-2">{o.trier_sent ? <CheckCircle2 className="h-4 w-4 text-whatsapp" /> : <Clock className="h-4 w-4 text-muted-foreground" />}</td>
                    <td className="p-2 text-xs">{o.trier_status || "—"}</td>
                    <td className="p-2 text-xs text-primary max-w-[200px] truncate" title={o.trier_error_message}>{o.trier_error_message || "—"}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => call("send-order", { order_id: o.id }, o.trier_sent ? "Reprocessado" : "Enviado")} disabled={busy !== null}>
                        <Send className="h-3 w-3 mr-1" />{o.trier_sent ? "Reprocessar" : "Enviar"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {(orders || []).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum pedido ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ---------- STATUS PEDIDOS ---------- */}
        <TabsContent value="status" className="pt-4 space-y-3">
          <Button onClick={() => call("check-order-status", {}, "Status consultado")} disabled={busy !== null}>
            <ListChecks className="h-4 w-4 mr-2" />Atualizar status dos pedidos pendentes (lote ≤50)
          </Button>
          <p className="text-xs text-muted-foreground">Códigos: 0 indefinido · 1 pendente · 2 disponível p/ retirada · 3 entregue · 4 cancelado · 5 em entrega.</p>
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr><th className="p-2">Pedido</th><th className="p-2">Cliente</th><th className="p-2">Status</th><th className="p-2">Código</th><th className="p-2">Última consulta</th></tr>
              </thead>
              <tbody>
                {(orders || []).filter((o: any) => o.trier_sent).map((o: any) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{o.id.slice(0, 8)}</td>
                    <td className="p-2">{o.customer_name}</td>
                    <td className="p-2">{o.trier_status || "—"}</td>
                    <td className="p-2">{o.trier_status_code ?? "—"}</td>
                    <td className="p-2 text-xs">{o.trier_last_status_check_at ? new Date(o.trier_last_status_check_at).toLocaleString("pt-BR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ---------- LOGS ---------- */}
        <TabsContent value="logs" className="pt-4">
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="p-3 border-b font-bold">Logs ({logs?.length || 0})</div>
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr><th className="p-2">Data</th><th className="p-2">Tipo</th><th className="p-2">Status</th><th className="p-2">Mensagem</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {(logs || []).map((l: any) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2 text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                    <td className="p-2"><Badge variant="outline">{l.type}</Badge></td>
                    <td className="p-2">
                      {l.status === "success" && <span className="text-whatsapp flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />ok</span>}
                      {l.status === "error" && <span className="text-primary flex items-center gap-1"><XCircle className="h-3 w-3" />erro</span>}
                      {l.status === "info" && <span className="text-muted-foreground">info</span>}
                    </td>
                    <td className="p-2 max-w-[400px] truncate" title={l.message}>{l.message}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setLogDetail(l)}><Eye className="h-3 w-3" /></Button>
                    </td>
                  </tr>
                ))}
                {(logs || []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum log ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!logDetail} onOpenChange={(o) => !o && setLogDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Detalhe do log</DialogTitle></DialogHeader>
          {logDetail && (
            <div className="space-y-2 text-sm">
              <div><b>Data:</b> {new Date(logDetail.created_at).toLocaleString("pt-BR")}</div>
              <div><b>Tipo:</b> {logDetail.type} · <b>Status:</b> {logDetail.status}</div>
              <div><b>Mensagem:</b> {logDetail.message}</div>
              <pre className="bg-secondary p-3 rounded text-xs overflow-x-auto max-h-80">{JSON.stringify(logDetail.details, null, 2)}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ title, value, sub }: any) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-xl font-extrabold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function FlagRow({ label, checked, onChange }: any) {
  return (
    <label className="flex items-center justify-between text-sm py-1 cursor-pointer">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function ScheduleField({ label, value, onChange }: any) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={String(value || 60)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="0">Manual (não automático)</SelectItem>
          <SelectItem value="15">A cada 15 min</SelectItem>
          <SelectItem value="30">A cada 30 min</SelectItem>
          <SelectItem value="60">A cada 1 hora</SelectItem>
          <SelectItem value="360">A cada 6 horas</SelectItem>
          <SelectItem value="1440">Diário</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function JobsTable({ jobs }: { jobs: any[] }) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="p-3 border-b font-bold text-sm">Últimas execuções</div>
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left">
          <tr><th className="p-2">Tipo</th><th className="p-2">Status</th><th className="p-2">Início</th><th className="p-2">Checados</th><th className="p-2">Criados</th><th className="p-2">Atualizados</th><th className="p-2">Falhos</th><th className="p-2">Erro</th></tr>
        </thead>
        <tbody>
          {jobs.map((j: any) => (
            <tr key={j.id} className="border-t">
              <td className="p-2 text-xs">{SYNC_TYPES[j.sync_type] || j.sync_type}</td>
              <td className="p-2">
                {j.status === "success" && <CheckCircle2 className="h-4 w-4 text-whatsapp inline" />}
                {j.status === "error" && <XCircle className="h-4 w-4 text-primary inline" />}
                {j.status === "running" && <Clock className="h-4 w-4 animate-pulse inline" />}
              </td>
              <td className="p-2 text-xs">{new Date(j.started_at).toLocaleString("pt-BR")}</td>
              <td className="p-2">{j.records_checked ?? 0}</td>
              <td className="p-2 text-whatsapp">{j.records_created ?? 0}</td>
              <td className="p-2">{j.records_updated ?? 0}</td>
              <td className="p-2 text-primary">{j.records_failed ?? 0}</td>
              <td className="p-2 text-xs text-primary max-w-[200px] truncate" title={j.error_message}>{j.error_message || ""}</td>
            </tr>
          ))}
          {jobs.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Sem execuções.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
