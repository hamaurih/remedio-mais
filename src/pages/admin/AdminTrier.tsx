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

const TABS = ["overview", "config", "products", "stock", "prices", "mapping", "divergences", "orders", "status", "seguranca", "diagnostico", "logs"] as const;
type Tab = typeof TABS[number];

const SUB_ROUTE_TO_TAB: Record<string, Tab> = {
  products: "products", stock: "stock", prices: "prices", orders: "orders", logs: "logs", diagnostico: "diagnostico", seguranca: "seguranca", divergences: "divergences",
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
  { trier: "quantidadeEstoque", site: "stock + stock_quantity + trier_stock_quantity", note: "fonte oficial do estoque do site" },
  { trier: "quantidadeEstoqueEcommerce", site: "ecommerce_stock_quantity", note: "apenas informativo" },
  { trier: "ativo", site: "trier_active", note: "ativo do site é calculado: trier_active && stock_quantity>0 && !manual_disabled" },
  { trier: "integracaoEcommerce", site: "ecommerce_enabled" },
  { trier: "percentualDesconto", site: "trier_discount_percentage", note: "técnico — não grava em discount_percentage" },
  { trier: "percentualDescontoMax", site: "trier_max_discount_percentage", note: "técnico" },
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

const GATEWAY_BASE_URL = "https://api-sgf-gateway.triersistemas.com.br/sgfpod1";

function normalizeBaseUrl(baseUrl: string) {
  let base = (baseUrl || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\r?\n|\r/g, "")
    .replace(/\/+$/, "")
    .replace(/\/rest\/.*$/i, "");
  if (!base) return GATEWAY_BASE_URL;
  base = base.replace(/^http:\/\//i, "https://");
  return base.replace(/\/api-sgf(\/.*)?$/i, "/sgfpod1").replace(/\/+$/, "");
}

function buildTrierUrl(baseUrl: string, endpoint: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}

function buildTestProductsPath(branch: string, ecomFilter: string) {
  const params = new URLSearchParams();
  if (branch) params.set("codFilial", String(branch));
  params.set("primeiroRegistro", "0");
  params.set("quantidadeRegistros", "150");
  params.set("ativo", "true");
  params.set("integracaoEcommerce", ecomFilter || "");
  params.set("processaCustoMedio", "false");
  return `/rest/integracao/produto/obter-todos-v1?${params.toString()}`;
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
    queryFn: async () => (await supabase.from("trier_settings").select("*").eq("id", 1).single()).data,
  });
  const [form, setForm] = useState<any>({});
  const [tokenInput, setTokenInput] = useState("");
  useEffect(() => {
    if (settings) {
      setForm({
        ...settings,
        environment: settings.environment || "gateway",
        base_url: settings.base_url || GATEWAY_BASE_URL,
        branch_code: settings.branch_code || "1",
        page_size: settings.page_size || 150,
        ecommerce_filter: (settings as any).ecommerce_filter ?? "",
        sync_mode: (settings as any).sync_mode || "safe_operational",
        auto_sync_paused: !!(settings as any).auto_sync_paused,
        stock_source: (settings as any).stock_source || "loja",
      });
    }
  }, [settings]);

  const saveSettings = async () => {
    const payload: any = {
      ...form,
      base_url: normalizeBaseUrl(form.base_url || ""),
      branch_code: form.branch_code || "1",
      page_size: Number(form.page_size) || 150,
      ecommerce_filter: form.ecommerce_filter ?? "",
    };
    // Token is managed exclusively via the TRIER_API_TOKEN backend secret; never store it in DB.
    delete payload.bearer_token;
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
  const [mappingPage, setMappingPage] = useState(0);
  const [mappingPageSize, setMappingPageSize] = useState(100);
  const { data: mappingsResp } = useQuery({
    queryKey: ["trier_mappings", mappingPage, mappingPageSize],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("trier", {
        body: { action: "list-mappings", limit: mappingPageSize, offset: mappingPage * mappingPageSize },
      });
      if (error) throw error;
      return data as { ok: boolean; items: any[]; total: number };
    },
  });
  const mappings = mappingsResp?.items || [];
  const mappingsTotal = mappingsResp?.total ?? 0;
  const { data: dbStats } = useQuery({
    queryKey: ["trier_db_stats"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("trier", { body: { action: "db-stats" } });
      return data as { cadastrados: number; ativos: number; inativos: number; vinculados_trier: number; com_estoque: number; sem_estoque: number };
    },
    refetchInterval: 30000,
  });
  const lastDiagnoseTotal = (logs || []).find((l: any) => l.type === "diagnose_total");
  const { data: orders } = useQuery({
    queryKey: ["trier_orders"],
    queryFn: async () => (await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100)).data || [],
  });

  const [logDetail, setLogDetail] = useState<any>(null);
  const [diagnose, setDiagnose] = useState<any>(null);
  const runDiagnose = async () => {
    setBusy("diagnose-products-page");
    setDiagnose(null);
    try {
      const { data, error } = await supabase.functions.invoke("trier", { body: { action: "diagnose-products-page" } });
      if (error) throw error;
      setDiagnose(data);
      if (data?.ok) toast.success(data.message || "Diagnóstico concluído");
      else toast.error(data?.message || "Falha no diagnóstico");
      qc.invalidateQueries({ queryKey: ["trier_logs"] });
      qc.invalidateQueries({ queryKey: ["trier_mappings"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

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
          <Badge variant="outline">{(settings as any)?.environment === "producao" ? "PRODUÇÃO" : (settings as any)?.environment === "homologacao" ? "Homologação" : "Gateway"}</Badge>
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
          <TabsTrigger value="divergences">Divergências EAN</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="status">Status Pedidos</TabsTrigger>
          <TabsTrigger value="seguranca">Segurança</TabsTrigger>
          <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* ---------- VISÃO GERAL ---------- */}
        <TabsContent value="overview" className="pt-4 space-y-4">
          <div className="bg-card border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold">Indicadores do banco</h2>
              <span className="text-xs text-muted-foreground">Métrica principal: <b>produtos cadastrados</b></span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-center">
              <StatusPill label="Cadastrados" value={dbStats?.cadastrados ?? "—"} tone="info" />
              <StatusPill label="Com cód. Trier" value={dbStats?.vinculados_trier ?? "—"} tone="default" />
              <StatusPill label="Ativos" value={dbStats?.ativos ?? "—"} tone="success" />
              <StatusPill label="Inativos" value={dbStats?.inativos ?? "—"} tone="warn" />
              <StatusPill label="Com estoque" value={dbStats?.com_estoque ?? "—"} tone="success" />
              <StatusPill label="Sem estoque" value={dbStats?.sem_estoque ?? "—"} tone="warn" />
            </div>
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-2">
            <h2 className="font-bold">Diagnóstico Trier (universo da API)</h2>
            <p className="text-xs text-muted-foreground">Roda a paginação completa SEM gravar nada, só contando. Mostra quantos produtos a Trier realmente retorna em todos os filtros (ativo=true, ativo=false). Pode levar minutos — acompanhe nos logs.</p>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => call("diagnose-total", {}, "Diagnóstico iniciado")} disabled={busy !== null} variant="default">
                <Eye className="h-4 w-4 mr-2" />Diagnosticar total de produtos Trier
              </Button>
            </div>
            {lastDiagnoseTotal && (
              <div className="text-xs space-y-1 mt-2 border-t pt-2">
                <div className="text-muted-foreground">Último diagnóstico: {new Date(lastDiagnoseTotal.created_at).toLocaleString("pt-BR")}</div>
                <div className="font-medium">{lastDiagnoseTotal.message}</div>
                {(lastDiagnoseTotal.details as any)?.stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    {Object.entries((lastDiagnoseTotal.details as any).stats).map(([k, v]: any) => (
                      <div key={k} className="bg-muted rounded p-2"><div className="text-muted-foreground">{k}</div><div className="font-bold">{String(v)}</div></div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <Card title="Conexão" value={settings?.last_connection_status === "ok" ? "OK" : (settings?.last_connection_status === "error" ? "Erro" : "—")} sub={settings?.last_connection_test_at ? new Date(settings.last_connection_test_at).toLocaleString("pt-BR") : "Nunca testado"} />
            <Card title="Pedidos pendentes" value={String(orders?.filter((o: any) => !o.trier_sent && o.payment_status === "approved").length ?? 0)} sub="Pagos e ainda não enviados à Trier" />
            <Card title="Último sync produtos" value={settings?.last_sync_products_at ? new Date(settings.last_sync_products_at).toLocaleString("pt-BR") : "—"} />
            <Card title="Último sync estoque" value={settings?.last_sync_stock_at ? new Date(settings.last_sync_stock_at).toLocaleString("pt-BR") : "—"} />
            <Card title="Último sync preços" value={settings?.last_sync_prices_at ? new Date(settings.last_sync_prices_at).toLocaleString("pt-BR") : "—"} />
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Button onClick={runConnectionTest} disabled={busy !== null}><Plug className="h-4 w-4 mr-2" />Testar conexão</Button>
            <Button onClick={() => call("sync-all", { trigger: "manual" }, "Sincronização completa")} disabled={busy !== null} variant="secondary"><RefreshCw className={`h-4 w-4 mr-2 ${busy === "sync-all" ? "animate-spin" : ""}`} />Sincronizar tudo</Button>
            <Button onClick={() => call("retry-pending-orders", { limit: 10 }, "Reenvio de pedidos pendentes")} disabled={busy !== null} variant="outline">Reenviar pedidos pendentes</Button>
          </div>

        </TabsContent>

        {/* ---------- CONFIGURAÇÃO ---------- */}
        <TabsContent value="config" className="pt-4 space-y-4">
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <h2 className="font-bold">Conexão</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ambiente</Label>
                <Select value={form.environment || "gateway"} onValueChange={(v) => setForm({
                  ...form, environment: v,
                  base_url: v === "gateway" ? GATEWAY_BASE_URL : form.base_url,
                })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gateway">Gateway Trier</SelectItem>
                    <SelectItem value="homologacao">Homologação (legado)</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Base URL</Label><Input value={form.base_url || ""} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder={GATEWAY_BASE_URL} /></div>
              <div className="space-y-1 md:col-span-2">
                <Label>Bearer Token</Label>
                <Input value="••• gerenciado por secret TRIER_API_TOKEN •••" disabled readOnly />
                <p className="text-xs text-muted-foreground">O token Trier é armazenado apenas como secret no backend (TRIER_API_TOKEN). Para alterá-lo, atualize o secret nas configurações do projeto.</p>
              </div>
              <div className="space-y-1"><Label>Código da filial (codFilial)</Label><Input value={form.branch_code || ""} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} placeholder="1" /></div>
              <div className="space-y-1"><Label>Tamanho da página</Label><Input type="number" value={form.page_size || 150} onChange={(e) => setForm({ ...form, page_size: Number(e.target.value) })} /></div>
              <div className="space-y-1">
                <Label>Integração Ecommerce (parâmetro)</Label>
                <Select value={form.ecommerce_filter ?? ""} onValueChange={(v) => setForm({ ...form, ecommerce_filter: v === "__empty__" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">vazio (recomendado)</SelectItem>
                    <SelectItem value="true">true</SelectItem>
                    <SelectItem value="false">false</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Processa Custo Médio</Label><Input value="false" disabled /></div>
            </div>
            <p className="text-xs text-muted-foreground border-t pt-2">⚠️ Padrão: Gateway Trier em HTTPS. Use Produção apenas se configurado IP/DDNS local.</p>
          </div>

          {/* ---------- FONTE DE ESTOQUE DO SITE ---------- */}
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold">Fonte de estoque do site</h2>
              <Badge variant="secondary">Padrão: estoque real da loja</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Define qual campo da Trier o site usa como <b>estoque vendável</b>. A farmácia não trabalha com estoque
              separado para e-commerce, então o padrão recomendado é <b>quantidadeEstoque</b> (estoque real da loja).
              O campo <code>quantidadeEstoqueEcommerce</code> continua sendo salvo, mas apenas como informação auxiliar.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fonte de estoque</Label>
                <Select
                  value={form.stock_source || "loja"}
                  onValueChange={(v) => setForm({ ...form, stock_source: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loja">Estoque real da loja: quantidadeEstoque (recomendado)</SelectItem>
                    <SelectItem value="ecommerce">Estoque e-commerce: quantidadeEstoqueEcommerce</SelectItem>
                    <SelectItem value="auto">Automático: e-commerce se existir, senão loja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 self-end">
                <div>• Produto fica visível no site se: <b>ativo na Trier</b> + <b>estoque &gt; 0</b> + não estiver desativado manualmente.</div>
                <div>• Produto sem estoque fica cadastrado, porém oculto do site. Imagem, descrição, categorias, campanhas e SEO são preservados.</div>
              </div>
            </div>
            <DiagStockSourcePanel call={call} busy={busy} stockSource={form.stock_source || "loja"} />
          </div>



          <div className="bg-card border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold">Modo de sincronização (proteção de campos manuais)</h2>
              {settings?.auto_sync_paused
                ? <Badge variant="destructive">Automática PAUSADA</Badge>
                : <Badge variant="secondary">Automática ATIVA</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              A Trier alimenta <b>preço, estoque, código de barras e dados técnicos</b>. O admin do site controla <b>imagem, descrição, categoria comercial, prateleiras, SEO, destaque e ativo manual</b>.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Modo padrão</Label>
                <Select
                  value={form.sync_mode || "safe_operational"}
                  onValueChange={(v) => setForm({ ...form, sync_mode: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="existing_stock_only">Proteger existentes: só atualiza estoque · cria novos completos (recomendado)</SelectItem>
                    <SelectItem value="safe_operational">Segura: estoque + preço + cód. barras</SelectItem>
                    <SelectItem value="stock_only">Apenas estoque</SelectItem>
                    <SelectItem value="price_only">Apenas preços</SelectItem>
                    <SelectItem value="barcode_only">Apenas códigos de barras</SelectItem>
                    <SelectItem value="create_only">Apenas criar novos produtos</SelectItem>
                    <SelectItem value="catalog_protected">Catálogo completo (protege campos manuais)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <Button
                  variant={settings?.auto_sync_paused ? "default" : "destructive"}
                  onClick={() => call("toggle-auto-sync", { paused: !settings?.auto_sync_paused }, settings?.auto_sync_paused ? "Sincronização retomada" : "Sincronização pausada")}
                  disabled={busy !== null}
                >
                  {settings?.auto_sync_paused ? "Retomar sincronização automática" : "Pausar sincronização automática"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => call("mark-stalled-jobs", { minutes: 20 }, "Jobs travados marcados")}
                  disabled={busy !== null}
                >
                  Marcar jobs travados como falhos
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground border-t pt-2">
              Campos sempre protegidos: <code>image_url, gallery_images, slug, seo_*, shelves, featured, tags, product_badge</code>.
              Flags por produto: <code>manual_override, manual_image, manual_description, manual_category, manual_active, manual_barcode, manual_name, manual_seo, manual_shelves</code>.
            </div>
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-2">
            <h2 className="font-bold">Flags de sincronização</h2>
            <p className="text-xs text-muted-foreground">O parâmetro <code>integracaoEcommerce</code> é configurado acima (vazio / true / false).</p>
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
              const base = normalizeBaseUrl(form.base_url || "");
              const endpoint = buildTestProductsPath(form.branch_code || "1", form.ecommerce_filter ?? "");
              const tokenMasked = tokenInput ? maskToken(tokenInput) : "";
              return (
                <div className="space-y-1 text-xs font-mono break-all">
                  <div><span className="text-muted-foreground">ambiente:</span> {form.environment || "gateway"}</div>
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
                <div><span className="text-muted-foreground">Ambiente:</span> {lastTestResult.environment || "—"}</div>
                <div><span className="text-muted-foreground">Base URL usada:</span> {lastTestResult.baseUrl || "—"}</div>
                <div><span className="text-muted-foreground">Endpoint usado:</span> {lastTestResult.endpoint || "—"}</div>
                <div><span className="text-muted-foreground">URL final montada:</span> {lastTestResult.finalUrl || "—"}</div>
                {lastTestResult.queryParams && (
                  <div><span className="text-muted-foreground">Query params:</span> {Object.entries(lastTestResult.queryParams).map(([k, v]) => `${k}=${v}`).join("&")}</div>
                )}
                <div><span className="text-muted-foreground">Token mascarado:</span> {lastTestResult.tokenMasked || "—"}</div>
                <div><span className="text-muted-foreground">Header mascarado:</span> {lastTestResult.authorizationHeaderMasked || "—"}</div>
                <div><span className="text-muted-foreground">Status HTTP:</span> {lastTestResult.status ?? "—"}</div>
                <div><span className="text-muted-foreground">Tempo de resposta:</span> {lastTestResult.responseTimeMs != null ? `${lastTestResult.responseTimeMs} ms` : "—"}</div>
                {lastTestResult.count != null && <div><span className="text-muted-foreground">Registros retornados:</span> {lastTestResult.count}</div>}
                {lastTestResult.error && <div className="text-destructive">Erro técnico: {lastTestResult.error}</div>}
                {lastTestResult.firstItemJson && (
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Primeiro produto retornado (≤1000 chars):</div>
                    <pre className="bg-muted p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap">{lastTestResult.firstItemJson}</pre>
                  </div>
                )}
                {lastTestResult.body && (
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Corpo bruto (≤1200 chars):</div>
                    <pre className="bg-muted p-2 rounded max-h-48 overflow-auto whitespace-pre-wrap">{lastTestResult.body}</pre>
                  </div>
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
            <Button variant="default" onClick={runDiagnose} disabled={busy !== null}>
              <Eye className={`h-4 w-4 mr-2 ${busy === "diagnose-products-page" ? "animate-spin" : ""}`} />
              Sincronizar 1 página e diagnosticar
            </Button>
          </div>

          {diagnose && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold">Diagnóstico da página</h3>
                <Badge variant={diagnose.ok ? "secondary" : "destructive"}>HTTP {diagnose.status ?? "—"}</Badge>
                <Badge variant="outline">{diagnose.stage}</Badge>
              </div>
              <p className="text-sm">{diagnose.message}</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
                <StatusPill label="Retornados" value={diagnose.count ?? 0} tone="default" />
                <StatusPill label="Criados" value={diagnose.created ?? 0} tone="success" />
                <StatusPill label="Atualizados" value={diagnose.updated ?? 0} tone="info" />
                <StatusPill label="Ignorados" value={diagnose.ignored ?? 0} tone="warn" />
                <StatusPill label="Com erro" value={diagnose.failed ?? 0} tone="error" />
              </div>
              <div className="text-xs font-mono break-all space-y-1">
                <div><span className="text-muted-foreground">URL:</span> {diagnose.finalUrl}</div>
                <div><span className="text-muted-foreground">Tempo:</span> {diagnose.responseTimeMs} ms</div>
              </div>
              {diagnose.ignored_reasons && Object.keys(diagnose.ignored_reasons).length > 0 && (
                <div className="text-xs">
                  <div className="text-muted-foreground mb-1">Motivos de ignorados:</div>
                  <ul className="ml-4">{Object.entries(diagnose.ignored_reasons).map(([k, v]: any) => <li key={k}>{k}: <b>{v}</b></li>)}</ul>
                </div>
              )}
              {Array.isArray(diagnose.errors) && diagnose.errors.length > 0 && (
                <div className="text-xs">
                  <div className="text-destructive mb-1">Erros do banco (até 20):</div>
                  <ul className="ml-4 space-y-1">{diagnose.errors.map((e: any, i: number) => <li key={i}><b>{e.trier_id}</b> {e.name} — {e.error}</li>)}</ul>
                </div>
              )}
              {diagnose.firstItemKeys && (
                <div className="text-xs">
                  <div className="text-muted-foreground mb-1">Chaves do 1º produto retornado:</div>
                  <div className="font-mono bg-muted p-2 rounded break-all">{(diagnose.firstItemKeys as string[]).join(", ")}</div>
                </div>
              )}
              {diagnose.firstItemJson && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Primeiro produto retornado (JSON)</summary>
                  <pre className="bg-muted p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap font-mono mt-1">{diagnose.firstItemJson}</pre>
                </details>
              )}
            </div>
          )}
          <JobsTable
            jobs={(jobs || []).filter((j: any) => j.sync_type.startsWith("products") || j.sync_type === "categories")}
            onCancel={async (id: string) => { await call("cancel-job", { job_id: id }, "Job cancelado"); }}
          />
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="p-3 border-b font-bold flex items-center justify-between flex-wrap gap-2">
              <div>
                <div>Produtos vinculados à Trier: <span className="text-primary">{mappingsTotal}</span></div>
                <div className="text-xs text-muted-foreground font-normal">Exibindo {mappings.length} por página · página {mappingPage + 1} de {Math.max(1, Math.ceil(mappingsTotal / mappingPageSize))}</div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={String(mappingPageSize)} onValueChange={(v) => { setMappingPageSize(Number(v)); setMappingPage(0); }}>
                  <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[50, 100, 200, 500].map((n) => <SelectItem key={n} value={String(n)}>{n}/pág</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={mappingPage === 0} onClick={() => setMappingPage((p) => Math.max(0, p - 1))}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={(mappingPage + 1) * mappingPageSize >= mappingsTotal} onClick={() => setMappingPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr><th className="p-2">Código Trier</th><th className="p-2">Nome</th><th className="p-2">Preço</th><th className="p-2">Estoque</th><th className="p-2">Ativo</th><th className="p-2">Último sync</th></tr>
              </thead>
              <tbody>
                {mappings.map((m: any) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{m.trier_product_id}</td>
                    <td className="p-2">{m.products?.name || m.trier_name}</td>
                    <td className="p-2">{m.products?.price ? formatBRL(m.products.price) : "—"}</td>
                    <td className="p-2">{m.products?.stock ?? "—"}</td>
                    <td className="p-2">{m.products?.active ? "Sim" : "Não"}</td>
                    <td className="p-2 text-xs">{m.last_synced_at ? new Date(m.last_synced_at).toLocaleString("pt-BR") : "—"}</td>
                  </tr>
                ))}
                {mappings.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum produto vinculado ainda. Clique em "Sincronizar produtos".</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ---------- ESTOQUE ---------- */}
        <TabsContent value="stock" className="pt-4 space-y-3">
          <div className="rounded-lg border bg-primary/5 p-3 text-xs">
            <div className="font-semibold text-sm mb-1">Refresh contínuo automático (ativos)</div>
            A cada execução do cron (a cada 15 min), o sistema já atualiza o estoque dos produtos <b>ativos</b> com EAN, priorizando os mais desatualizados. Não é preciso apertar nada — o catálogo visível fica sempre em dia. A varredura completa (abaixo) continua rodando para pegar novidades.
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => call("sync-stock-active", { trigger: "manual", batchSize: 500, concurrency: 6 }, "Refresh de ativos disparado")} disabled={busy !== null}>
              <Boxes className="h-4 w-4 mr-2" />Atualizar estoque dos ativos agora
            </Button>
            <Button variant="outline" onClick={() => call("sync-stock", { trigger: "manual" }, "Varredura completa iniciada")} disabled={busy !== null}>
              <Boxes className="h-4 w-4 mr-2" />Varredura completa (todos)
            </Button>
          </div>
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

        {/* ---------- DIVERGÊNCIAS EAN ---------- */}
        <TabsContent value="divergences" className="pt-4 space-y-3">
          <BarcodeDivergencesPanel />
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

        {/* ---------- SEGURANÇA / SIMULAÇÃO ---------- */}
        <TabsContent value="seguranca" className="pt-4">
          <SafeSyncPanel call={call} busy={busy} settings={settings} />
        </TabsContent>

        {/* ---------- DIAGNÓSTICO ---------- */}
        <TabsContent value="diagnostico" className="pt-4">
          <DiagnosticoPanel call={call} busy={busy} />
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhe do log</DialogTitle></DialogHeader>
          {logDetail && (() => {
            const d = logDetail.details || {};
            const isApi = logDetail.type === "api_call";
            return (
              <div className="space-y-3 text-sm">
                <div className="flex gap-2 flex-wrap text-xs">
                  <Badge variant="outline">{logDetail.type}</Badge>
                  <Badge variant={logDetail.status === "error" ? "destructive" : "secondary"}>{logDetail.status}</Badge>
                  <span className="text-muted-foreground">{new Date(logDetail.created_at).toLocaleString("pt-BR")}</span>
                </div>
                <div><b>Mensagem:</b> {logDetail.message}</div>
                {isApi && (
                  <div className="space-y-1 text-xs font-mono break-all bg-muted/40 p-3 rounded">
                    {d.method && <div><span className="text-muted-foreground">Método:</span> {d.method}</div>}
                    {d.finalUrl && <div><span className="text-muted-foreground">URL chamada:</span> {d.finalUrl}</div>}
                    {d.queryParams && Object.keys(d.queryParams).length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Query params:</span>
                        <ul className="ml-4">
                          {Object.entries(d.queryParams).map(([k, v]: any) => <li key={k}>{k} = {String(v) || <i className="text-muted-foreground">(vazio)</i>}</li>)}
                        </ul>
                      </div>
                    )}
                    {d.authorizationHeaderMasked && <div><span className="text-muted-foreground">Header:</span> {d.authorizationHeaderMasked}</div>}
                    <div><span className="text-muted-foreground">Status HTTP:</span> {d.status ?? "—"}</div>
                    <div><span className="text-muted-foreground">Tempo:</span> {d.responseTimeMs != null ? `${d.responseTimeMs} ms` : "—"}</div>
                    <div><span className="text-muted-foreground">Registros:</span> {d.count ?? "—"}</div>
                    {d.error && <div className="text-destructive"><span className="text-muted-foreground">Erro:</span> {d.error}</div>}
                  </div>
                )}
                {d.firstItemKeys && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Chaves do primeiro produto:</div>
                    <div className="font-mono bg-muted p-2 rounded break-all">{(d.firstItemKeys as string[]).join(", ")}</div>
                  </div>
                )}
                {d.firstItemJson && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Primeiro produto (≤2000 chars):</div>
                    <pre className="bg-muted p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap font-mono">{d.firstItemJson}</pre>
                  </div>
                )}
                {d.ignored_reasons && Object.keys(d.ignored_reasons).length > 0 && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Motivos de produtos ignorados:</div>
                    <ul className="ml-4">
                      {Object.entries(d.ignored_reasons).map(([k, v]: any) => <li key={k}>{k}: <b>{v}</b></li>)}
                    </ul>
                  </div>
                )}
                {Array.isArray(d.errors) && d.errors.length > 0 && (
                  <div className="text-xs">
                    <div className="text-destructive mb-1">Erros no banco (primeiros {d.errors.length}):</div>
                    <ul className="ml-4 space-y-1">
                      {d.errors.map((e: any, i: number) => <li key={i}><b>{e.trier_id}</b> {e.name} — {e.error}</li>)}
                    </ul>
                  </div>
                )}
                {d.body && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Corpo bruto da resposta</summary>
                    <pre className="bg-muted p-2 rounded max-h-48 overflow-auto whitespace-pre-wrap mt-1">{d.body}</pre>
                  </details>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">JSON completo do log</summary>
                  <pre className="bg-secondary p-3 rounded overflow-x-auto max-h-80 mt-1">{JSON.stringify(d, null, 2)}</pre>
                </details>
              </div>
            );
          })()}
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

function JobsTable({ jobs, onCancel }: { jobs: any[]; onCancel?: (id: string) => void | Promise<void> }) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="p-3 border-b font-bold text-sm">Últimas execuções</div>
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left">
          <tr>
            <th className="p-2">Tipo</th><th className="p-2">Status</th><th className="p-2">Início</th>
            <th className="p-2">Checados</th><th className="p-2">Criados</th><th className="p-2">Atualizados</th>
            <th className="p-2">Ignorados</th><th className="p-2">Falhos</th>
            <th className="p-2">Páginas</th><th className="p-2">Último offset</th>
            <th className="p-2">Motivo de parada / Erro</th><th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j: any) => {
            const d = (j.details || {}) as any;
            const stop = d.stop_reasons ? Object.entries(d.stop_reasons).map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
            const isRunning = j.status === "running";
            const startedMs = j.started_at ? Date.now() - new Date(j.started_at).getTime() : 0;
            const looksStuck = isRunning && startedMs > 10 * 60 * 1000;
            return (
              <tr key={j.id} className="border-t">
                <td className="p-2 text-xs">{SYNC_TYPES[j.sync_type] || j.sync_type}</td>
                <td className="p-2">
                  {j.status === "success" && <CheckCircle2 className="h-4 w-4 text-whatsapp inline" />}
                  {j.status === "partial" && <CheckCircle2 className="h-4 w-4 text-yellow-600 inline" />}
                  {j.status === "error" && <XCircle className="h-4 w-4 text-primary inline" />}
                  {j.status === "cancelled" && <XCircle className="h-4 w-4 text-muted-foreground inline" />}
                  {isRunning && <Clock className={`h-4 w-4 inline ${looksStuck ? "text-yellow-600" : "animate-pulse"}`} />}
                  <span className="ml-1 text-xs">{j.status}{looksStuck ? " (travado?)" : ""}</span>
                </td>
                <td className="p-2 text-xs">{new Date(j.started_at).toLocaleString("pt-BR")}</td>
                <td className="p-2">{j.records_checked ?? 0}</td>
                <td className="p-2 text-whatsapp">{j.records_created ?? 0}</td>
                <td className="p-2">{j.records_updated ?? 0}</td>
                <td className="p-2">{j.records_ignored ?? 0}</td>
                <td className="p-2 text-primary">{j.records_failed ?? 0}</td>
                <td className="p-2 text-xs">{d.pages_consulted ?? "—"}</td>
                <td className="p-2 text-xs">{d.last_offset ?? "—"}</td>
                <td className="p-2 text-xs max-w-[260px] truncate" title={j.error_message || stop}>{j.error_message || stop || "—"}</td>
                <td className="p-2 text-right">
                  {isRunning && onCancel && (
                    <Button size="sm" variant="outline" onClick={() => onCancel(j.id)}>Cancelar</Button>
                  )}
                </td>
              </tr>
            );
          })}
          {jobs.length === 0 && <tr><td colSpan={12} className="p-4 text-center text-muted-foreground">Sem execuções.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: number | string; tone: "default" | "success" | "info" | "warn" | "error" }) {
  const toneCls = {
    default: "bg-muted text-foreground",
    success: "bg-whatsapp/10 text-whatsapp",
    info: "bg-primary/10 text-primary",
    warn: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    error: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <div className={`rounded-lg p-2 ${toneCls}`}>
      <div className="text-lg font-extrabold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

// =========================================================
//  PAINEL DE DIAGNÓSTICO TÉCNICO
// =========================================================
function DiagnosticoPanel({ call, busy }: { call: (a: string, b?: any, l?: string) => Promise<any>; busy: string | null }) {
  const [dbFull, setDbFull] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any[] | null>(null);
  const [apiTotal, setApiTotal] = useState<any>(null);
  const [compareOffset, setCompareOffset] = useState(0);
  const [comparePageSize, setComparePageSize] = useState(150);
  const [compare, setCompare] = useState<any>(null);
  const [upsertResult, setUpsertResult] = useState<any>(null);
  const [writeTest, setWriteTest] = useState<any>(null);
  const [stockTest, setStockTest] = useState<any>(null);
  const [lastJob, setLastJob] = useState<any>(null);

  const refreshDb = async () => {
    const r = await call("diag-db-full", {}, "Indicadores do banco");
    if (r) setDbFull(r);
  };
  const refreshLastJob = async () => {
    const r = await call("diag-last-products-job", {}, "Último job de produtos");
    if (r) setLastJob(r.job);
  };
  useEffect(() => { refreshDb(); refreshLastJob(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="space-y-6">
      <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-xl p-3 text-xs">
        <b>Métrica principal: produtos cadastrados no banco.</b><br />
        Produto ativo = vendável/visível. Produto sem estoque pode estar cadastrado mas <code>active=false</code> e não aparece no site público.
        Produto só é ignorado se faltar <b>código</b> ou <b>nome</b>. Estoque 0, preço 0, sem imagem/categoria/lab/desconto <b>não</b> são motivo de ignorar.
      </div>

      {/* 1. API TRIER */}
      <section className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">1. Diagnóstico da API Trier</h2>
          <div className="flex gap-2">
            <Button size="sm" onClick={async () => { setApiTotal(null); const r = await call("diag-api-total", {}, "Diagnóstico iniciado em background"); if (r) setApiTotal(r); }} disabled={!!busy}>
              Diagnosticar total da API Trier
            </Button>
            <Button size="sm" variant="secondary" onClick={async () => { setScenarios(null); const r = await call("diag-api-scenarios", {}, "Cenários iniciados em background"); if (r?.scenarios) setScenarios(r.scenarios); }} disabled={!!busy}>
              Rodar cenários A–E
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Pagina a API sem gravar nada. Resultado fica no log <code>diag_api_total</code> / <code>diag_api_scenarios</code> (background — atualize a aba Logs em alguns minutos).</p>
        {apiTotal && (
          <div className="text-xs grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            <Stat label="Total retornado" value={apiTotal.total} />
            <Stat label="Páginas" value={apiTotal.pages} />
            <Stat label="Último offset" value={apiTotal.last_offset} />
            <Stat label="Última página" value={apiTotal.last_page_count} />
            <Stat label="Tempo (ms)" value={apiTotal.duration_ms} />
            <Stat label="Motivo de parada" value={apiTotal.stop_reason} />
          </div>
        )}
        {scenarios && (
          <div className="overflow-auto text-xs">
            <table className="w-full">
              <thead className="bg-secondary"><tr><th className="p-2 text-left">Cenário</th><th className="p-2">Total</th><th className="p-2">Páginas</th><th className="p-2">Último offset</th><th className="p-2">Parada</th></tr></thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2"><b>{s.id}</b> {s.label}</td>
                    <td className="p-2 text-center font-bold">{s.total}</td>
                    <td className="p-2 text-center">{s.pages}</td>
                    <td className="p-2 text-center">{s.last_offset}</td>
                    <td className="p-2">{s.stop_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. BANCO */}
      <section className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">2. Diagnóstico do banco</h2>
          <Button size="sm" variant="outline" onClick={refreshDb} disabled={!!busy}><RefreshCw className="h-3 w-3 mr-1" />Atualizar contadores</Button>
        </div>
        {dbFull && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <Stat label="Total cadastrados" value={dbFull.total} />
            <Stat label="Com trier_product_id" value={dbFull.comTrier} />
            <Stat label="Sem trier_product_id" value={dbFull.semTrier} />
            <Stat label="Ativos" value={dbFull.ativos} />
            <Stat label="Inativos" value={dbFull.inativos} />
            <Stat label="Estoque > 0" value={dbFull.comEstoque} />
            <Stat label="Estoque ≤ 0" value={dbFull.semEstoque} />
            <Stat label="Preço > 0" value={dbFull.comPreco} />
            <Stat label="Preço 0/nulo" value={dbFull.semPreco} />
            <Stat label="Criados hoje" value={dbFull.criadosHoje} />
            <Stat label="Atualizados hoje" value={dbFull.atualizadosHoje} />
            <Stat label="Sem nome" value={dbFull.semNome} />
            <Stat label="Duplicados (cód. Trier)" value={dbFull.duplicados_codigo_trier} />
            <Stat label="Chave de upsert" value={dbFull.upsert_key} />
          </div>
        )}
        {dbFull?.last_created && (
          <div className="text-xs text-muted-foreground">Último criado: <b>{dbFull.last_created.name}</b> · cód. {dbFull.last_created.trier_product_id} · {new Date(dbFull.last_created.created_at).toLocaleString("pt-BR")}</div>
        )}
        {dbFull?.last_updated && (
          <div className="text-xs text-muted-foreground">Último atualizado: <b>{dbFull.last_updated.name}</b> · cód. {dbFull.last_updated.trier_product_id} · {new Date(dbFull.last_updated.updated_at).toLocaleString("pt-BR")}</div>
        )}
        {dbFull?.duplicados_codigo_trier > 0 && (
          <div className="text-xs text-destructive">⚠ Existem produtos sobrescritos por chave incorreta. Considere usar <code>codFilial + codigo</code>.</div>
        )}
      </section>

      {/* 3. COMPARAÇÃO */}
      <section className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-bold">3. Comparar página da API com banco</h2>
        <div className="flex gap-2 items-end flex-wrap">
          <div><Label className="text-xs">primeiroRegistro</Label><Input className="w-32" type="number" value={compareOffset} onChange={(e) => setCompareOffset(Number(e.target.value) || 0)} /></div>
          <div><Label className="text-xs">quantidadeRegistros</Label><Input className="w-28" type="number" value={comparePageSize} onChange={(e) => setComparePageSize(Number(e.target.value) || 150)} /></div>
          <Button size="sm" onClick={async () => { setCompare(null); const r = await call("diag-compare-page", { offset: compareOffset, pageSize: comparePageSize }, "Comparação concluída"); if (r) setCompare(r); }} disabled={!!busy}>Comparar</Button>
          <Button size="sm" variant="secondary" onClick={async () => { setUpsertResult(null); const r = await call("diag-upsert-page", { offset: compareOffset, pageSize: comparePageSize, limit: 5 }, "Upsert de 5 testado"); if (r) setUpsertResult(r); }} disabled={!!busy}>Testar upsert (5)</Button>
        </div>
        {compare && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {Object.entries(compare.sum).map(([k, v]: any) => <Stat key={k} label={k} value={v} />)}
            </div>
            <div className="overflow-auto text-xs max-h-96 mt-2 border rounded">
              <table className="w-full">
                <thead className="bg-secondary sticky top-0"><tr><th className="p-1 text-left">Código</th><th className="p-1 text-left">Nome</th><th className="p-1">Estoque</th><th className="p-1">Preço</th><th className="p-1">No banco</th><th className="p-1">Ação</th><th className="p-1">Motivo</th></tr></thead>
                <tbody>
                  {compare.items.map((it: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-1 font-mono">{it.code || <i className="text-destructive">—</i>}</td>
                      <td className="p-1 max-w-[260px] truncate">{it.name || <i className="text-destructive">—</i>}</td>
                      <td className="p-1 text-center">{it.stock ?? "—"}</td>
                      <td className="p-1 text-center">{it.price ?? "—"}</td>
                      <td className="p-1 text-center">{it.existe ? "sim" : "não"}</td>
                      <td className="p-1 text-center"><Badge variant={it.acao === "ignorar" ? "destructive" : it.acao === "criar" ? "default" : "secondary"}>{it.acao}</Badge></td>
                      <td className="p-1">{it.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {upsertResult && (
          <div className="text-xs space-y-1 border rounded p-2 bg-muted/30">
            <div className="font-bold">Resultado real de upsert (até 5):</div>
            {upsertResult.results.map((r: any, i: number) => (
              <div key={i} className="border-t pt-1">
                <div><b>{r.code}</b> {r.name} — {r.created ? "✅ criado" : r.updated ? "🔄 atualizado" : r.skipped ? `⏭ ignorado (${r.reason})` : r.failed ? "❌ erro" : "?"}</div>
                {r.error && <div className="text-destructive">erro: {r.error}</div>}
                <details><summary className="cursor-pointer text-muted-foreground">payload</summary><pre className="bg-muted p-1 rounded mt-1">{JSON.stringify(r.payload, null, 2)}</pre></details>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. WRITE TEST */}
      <section className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">4. Teste de gravação no banco</h2>
          <Button size="sm" onClick={async () => { setWriteTest(null); const r = await call("diag-db-write", {}, "Teste de gravação executado"); if (r) setWriteTest(r); }} disabled={!!busy}>Testar gravação</Button>
        </div>
        {writeTest && (
          <div className="text-xs space-y-1">
            <div>trier_product_id de teste: <code>{writeTest.trier_id}</code></div>
            {(["insert", "update", "delete"] as const).map((k) => (
              <div key={k}>
                <b>{k}:</b> {writeTest[k]?.ok ? "✅ ok" : <span className="text-destructive">❌ {writeTest[k]?.error} {writeTest[k]?.code ? `(code ${writeTest[k].code})` : ""}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. ESTOQUE ENDPOINT */}
      <section className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">5. Diagnóstico do endpoint de estoque</h2>
          <Button size="sm" onClick={async () => { setStockTest(null); const r = await call("diag-stock-endpoint", {}, "Endpoint de estoque testado"); if (r) setStockTest(r); }} disabled={!!busy}>Testar /estoque/obter-todos-v1</Button>
        </div>
        {stockTest && (
          <div className="text-xs space-y-2">
            <div className="font-medium">{stockTest.recomendacao}</div>
            <table className="w-full">
              <thead className="bg-secondary"><tr><th className="p-1 text-left">Variação</th><th className="p-1">HTTP</th><th className="p-1">Registros</th></tr></thead>
              <tbody>
                {stockTest.variants.map((v: any) => (
                  <tr key={v.id} className="border-t"><td className="p-1">{v.label}</td><td className="p-1 text-center">{v.status}</td><td className="p-1 text-center font-bold">{v.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. ÚLTIMO JOB */}
      <section className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">6. Última sincronização completa</h2>
          <Button size="sm" variant="outline" onClick={refreshLastJob} disabled={!!busy}><RefreshCw className="h-3 w-3 mr-1" />Atualizar</Button>
        </div>
        {lastJob ? (
          <div className="text-xs grid grid-cols-2 md:grid-cols-3 gap-2">
            <Stat label="Status" value={lastJob.status} />
            <Stat label="Início" value={lastJob.started_at ? new Date(lastJob.started_at).toLocaleString("pt-BR") : "—"} />
            <Stat label="Fim" value={lastJob.finished_at ? new Date(lastJob.finished_at).toLocaleString("pt-BR") : "—"} />
            <Stat label="Recebidos da API" value={(lastJob.details as any)?.total_returned_api ?? lastJob.records_checked ?? "—"} />
            <Stat label="Únicos processados" value={(lastJob.details as any)?.unique_processed ?? "—"} />
            <Stat label="Páginas" value={(lastJob.details as any)?.pages_consulted ?? "—"} />
            <Stat label="Último offset" value={(lastJob.details as any)?.last_offset ?? "—"} />
            <Stat label="Criados" value={lastJob.records_created ?? 0} />
            <Stat label="Atualizados" value={lastJob.records_updated ?? 0} />
            <Stat label="Ignorados" value={lastJob.records_ignored ?? 0} />
            <Stat label="Com erro" value={lastJob.records_failed ?? 0} />
            <Stat label="Erro" value={lastJob.error_message || "—"} />
            <div className="col-span-full">
              <details><summary className="cursor-pointer text-muted-foreground">Detalhes completos (per_filter, stop_reasons, ignored_reasons)</summary><pre className="bg-muted p-2 rounded mt-1 max-h-64 overflow-auto">{JSON.stringify(lastJob.details, null, 2)}</pre></details>
            </div>
          </div>
        ) : <div className="text-xs text-muted-foreground">Nenhum job de produtos ainda.</div>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-muted/50 rounded p-2">
      <div className="text-muted-foreground text-[10px] uppercase">{label}</div>
      <div className="font-bold text-sm break-all">{String(value ?? "—")}</div>
    </div>
  );
}

function SafeSyncPanel({ call, busy, settings }: { call: (a: string, b?: any, l?: string) => Promise<any>; busy: string | null; settings: any }) {
  const [sim, setSim] = useState<any>(null);
  const [mode, setMode] = useState<string>(settings?.sync_mode || "safe_operational");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [divs, setDivs] = useState<any[]>([]);
  const [logsList, setLogsList] = useState<any[]>([]);

  const runSimulate = async () => {
    const r = await call("simulate-sync-page", { offset, pageSize, mode }, "Simulação concluída");
    if (r) setSim(r);
  };
  const loadDivs = async () => {
    const r = await call("list-barcode-divergences", { limit: 100 }, "Divergências carregadas");
    if (r?.items) setDivs(r.items);
  };
  const resolveDiv = async (id: string, action: "keep_current" | "use_trier" | "ignore") => {
    await call("resolve-barcode-divergence", { id, action }, "Divergência resolvida");
    loadDivs();
  };
  const loadLogs = async () => {
    const r = await call("list-product-sync-logs", { limit: 100 }, "Logs por produto");
    if (r?.items) setLogsList(r.items);
  };

  return (
    <div className="space-y-4">
      <section className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">Status atual</h2>
          <div className="flex gap-2 flex-wrap items-center text-xs">
            <Badge variant="outline">Modo: {settings?.sync_mode || "safe_operational"}</Badge>
            {settings?.auto_sync_paused
              ? <Badge variant="destructive">Cron PAUSADO</Badge>
              : <Badge variant="secondary">Cron ATIVO</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={settings?.auto_sync_paused ? "default" : "destructive"}
            onClick={() => call("toggle-auto-sync", { paused: !settings?.auto_sync_paused }, settings?.auto_sync_paused ? "Retomado" : "Pausado")}
            disabled={busy !== null}
          >{settings?.auto_sync_paused ? "Retomar sincronização automática" : "Pausar sincronização automática"}</Button>
          <Button variant="secondary" onClick={() => call("mark-stalled-jobs", { minutes: 20 }, "Jobs travados marcados")} disabled={busy !== null}>
            Marcar jobs travados (&gt;20min)
          </Button>
          <Button variant="secondary" onClick={() => call("sync-barcodes", { trigger: "manual" }, "Sincronização de códigos iniciada")} disabled={busy !== null}>
            Sincronizar somente códigos de barras
          </Button>
        </div>
      </section>

      <section className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-bold">Simular sincronização (não grava nada)</h2>
        <div className="grid md:grid-cols-4 gap-2 items-end">
          <div className="space-y-1">
            <Label>Modo</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="existing_stock_only">Proteger existentes (só estoque) · cria novos completos</SelectItem>
                <SelectItem value="safe_operational">Segura (recomendada)</SelectItem>
                <SelectItem value="stock_only">Apenas estoque</SelectItem>
                <SelectItem value="price_only">Apenas preços</SelectItem>
                <SelectItem value="barcode_only">Apenas cód. barras</SelectItem>
                <SelectItem value="create_only">Apenas criar novos</SelectItem>
                <SelectItem value="catalog_protected">Catálogo (protegido)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Offset</Label>
            <Input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>Tamanho da página</Label>
            <Input type="number" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 50)} />
          </div>
          <Button onClick={runSimulate} disabled={busy !== null}>Simular página</Button>
        </div>
        {sim && (
          <div className="text-xs space-y-2 border-t pt-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Stat label="Modo" value={sim.mode} />
              <Stat label="Recebidos" value={sim.total} />
              <Stat label="Seriam criados" value={sim.created} />
              <Stat label="Seriam atualizados" value={sim.updated} />
              <Stat label="Seriam ignorados" value={sim.skipped} />
              <Stat label="Divergências cód." value={sim.divergences} />
            </div>
            <div className="overflow-auto max-h-96 border rounded">
              <table className="w-full text-xs">
                <thead className="bg-secondary text-left">
                  <tr>
                    <th className="p-2">Trier ID</th><th className="p-2">Nome</th><th className="p-2">Ação</th>
                    <th className="p-2">Campos a alterar</th><th className="p-2">Campos protegidos</th>
                  </tr>
                </thead>
                <tbody>
                  {(sim.items || []).map((it: any, i: number) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-2">{it.trier_id}</td>
                      <td className="p-2 max-w-[260px] truncate" title={it.name}>{it.name}</td>
                      <td className="p-2">
                        <Badge variant={it.action === "criar" ? "default" : it.action === "atualizar" ? "secondary" : "outline"}>{it.action}</Badge>
                        {it.barcode_divergence && <Badge variant="destructive" className="ml-1">divergência cód.</Badge>}
                      </td>
                      <td className="p-2 text-[11px]">{(it.fields_updated || []).join(", ") || "—"}</td>
                      <td className="p-2 text-[11px] text-muted-foreground">{(it.fields_protected || []).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Divergências de código de barras</h2>
          <Button size="sm" variant="secondary" onClick={loadDivs} disabled={busy !== null}>Recarregar</Button>
        </div>
        <div className="overflow-auto border rounded">
          <table className="w-full text-xs">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-2">Produto</th><th className="p-2">Trier ID</th>
                <th className="p-2">Atual</th><th className="p-2">Trier</th><th className="p-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {divs.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="p-2">{d.products?.name || "—"}</td>
                  <td className="p-2">{d.trier_product_id}</td>
                  <td className="p-2 font-mono">{d.current_barcode}</td>
                  <td className="p-2 font-mono">{d.trier_barcode}</td>
                  <td className="p-2 flex gap-1 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => resolveDiv(d.id, "keep_current")}>Manter</Button>
                    <Button size="sm" variant="default" onClick={() => resolveDiv(d.id, "use_trier")}>Usar Trier</Button>
                    <Button size="sm" variant="ghost" onClick={() => resolveDiv(d.id, "ignore")}>Ignorar</Button>
                  </td>
                </tr>
              ))}
              {divs.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nenhuma divergência pendente.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Histórico de sincronização por produto</h2>
          <Button size="sm" variant="secondary" onClick={loadLogs} disabled={busy !== null}>Carregar últimos 100</Button>
        </div>
        <div className="overflow-auto border rounded max-h-96">
          <table className="w-full text-xs">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-2">Data</th><th className="p-2">Trier ID</th><th className="p-2">Tipo</th>
                <th className="p-2">Status</th><th className="p-2">Atualizados</th><th className="p-2">Protegidos</th>
              </tr>
            </thead>
            <tbody>
              {logsList.map((l) => (
                <tr key={l.id} className="border-t align-top">
                  <td className="p-2">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-2">{l.trier_product_id}</td>
                  <td className="p-2">{l.sync_type}</td>
                  <td className="p-2">
                    <Badge variant={l.status === "ok" ? "secondary" : l.status === "error" ? "destructive" : "outline"}>{l.status}</Badge>
                  </td>
                  <td className="p-2 text-[11px]">{(l.fields_updated || []).join(", ") || "—"}</td>
                  <td className="p-2 text-[11px] text-muted-foreground">{(l.fields_protected || []).join(", ") || "—"}</td>
                </tr>
              ))}
              {logsList.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhum log carregado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// =====================================================================
// Diagnóstico visual: fonte de estoque do site
// Mostra para cada produto da Trier a quantidadeEstoque e
// quantidadeEstoqueEcommerce, qual valor seria usado no site e por quê.
// =====================================================================
function DiagStockSourcePanel({ call, busy, stockSource }: { call: any; busy: string | null; stockSource: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const r = await call("diag-stock-source", { limit: 10 }, "Diagnóstico de estoque executado");
      if (r) setData(r);
    } finally { setLoading(false); }
  };
  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-sm">Diagnóstico visual — estoque por produto</h3>
        <Button size="sm" variant="secondary" onClick={run} disabled={loading || busy !== null}>
          {loading ? "Consultando Trier..." : "Testar 10 produtos da Trier"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Fonte aplicada agora: <b>{stockSource === "ecommerce" ? "quantidadeEstoqueEcommerce" : stockSource === "auto" ? "Automático (ecom → loja)" : "quantidadeEstoque (estoque real da loja)"}</b>
      </p>
      {data?.items?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border rounded">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-left">Cód. Trier</th>
                <th className="p-2 text-left">Produto</th>
                <th className="p-2 text-right">quantidadeEstoque</th>
                <th className="p-2 text-right">quantidadeEstoqueEcommerce</th>
                <th className="p-2 text-right">Estoque usado no site</th>
                <th className="p-2 text-left">Fonte aplicada</th>
                <th className="p-2 text-center">Ativo no site?</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it: any) => (
                <tr key={it.trier_product_id} className="border-t align-top">
                  <td className="p-2 font-mono">{it.trier_product_id}</td>
                  <td className="p-2">{it.name}</td>
                  <td className="p-2 text-right">{it.quantidadeEstoque ?? "—"}</td>
                  <td className="p-2 text-right">{it.quantidadeEstoqueEcommerce ?? "—"}</td>
                  <td className="p-2 text-right font-semibold">{it.estoque_usado_site}</td>
                  <td className="p-2 text-[11px] text-muted-foreground">{it.fonte_aplicada}</td>
                  <td className="p-2 text-center">
                    <Badge variant={it.ficaria_ativo ? "secondary" : "outline"}>{it.ficaria_ativo ? "Sim" : "Não"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.items?.length === 0 && (
        <p className="text-xs text-muted-foreground">A Trier não retornou produtos para esta amostra.</p>
      )}
    </div>
  );
}

// ============================================================
// Painel: Divergências de código de barras (EAN)
// Consome as actions list-barcode-divergences / resolve-barcode-divergence
// que já existem na edge function `trier`.
// ============================================================
function BarcodeDivergencesPanel() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("trier", {
        body: { action: "list-barcode-divergences", limit: 200, offset: 0 },
      });
      if (error) throw error;
      setItems(data?.items || data?.divergences || data || []);
    } catch (e: any) {
      toast.error("Erro ao listar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function resolve(id: string, resolution: "use_trier" | "keep_current" | "ignore") {
    if (!confirm(resolution === "use_trier"
      ? "Aceitar o código de barras da Trier (substitui o atual)?"
      : resolution === "keep_current"
      ? "Manter o código atual (descarta o da Trier)?"
      : "Ignorar esta divergência?")) return;
    setResolving(id);
    try {
      const { error } = await (supabase as any).functions.invoke("trier", {
        body: { action: "resolve-barcode-divergence", id, resolution },
      });
      if (error) throw error;
      toast.success("Divergência atualizada");
      load();
    } catch (e: any) {
      toast.error("Falha: " + (e?.message || e));
    } finally {
      setResolving(null);
    }
  }

  const pending = items.filter((x) => x.status === "pending");

  return (
    <div className="bg-card border rounded-xl">
      <div className="p-3 border-b flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-bold">Divergências de código de barras</div>
          <div className="text-xs text-muted-foreground">
            {pending.length} pendentes · {items.length} no total. Mostra quando a Trier traz um EAN diferente do já cadastrado — nada é sobrescrito automaticamente.
          </div>
        </div>
        <button
          className="text-sm border rounded-md px-3 py-1.5 hover:bg-accent"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="text-left p-2">Cód. Trier</th>
              <th className="text-left p-2">EAN atual</th>
              <th className="text-left p-2">EAN Trier</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Quando</th>
              <th className="text-right p-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhuma divergência registrada.</td></tr>
            )}
            {items.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-2 font-mono text-xs">{d.trier_product_id}</td>
                <td className="p-2 font-mono text-xs">{d.current_barcode || "—"}</td>
                <td className="p-2 font-mono text-xs">{d.trier_barcode || "—"}</td>
                <td className="p-2 text-xs">
                  <Badge variant={d.status === "pending" ? "outline" : "secondary"}>{d.status}</Badge>
                </td>
                <td className="p-2 text-xs">{d.created_at ? new Date(d.created_at).toLocaleString("pt-BR") : "—"}</td>
                <td className="p-2 text-right">
                  {d.status === "pending" ? (
                    <div className="inline-flex gap-1">
                      <button
                        className="text-xs border rounded px-2 py-1 hover:bg-primary hover:text-primary-foreground"
                        disabled={resolving === d.id}
                        onClick={() => resolve(d.id, "use_trier")}
                      >
                        Aceitar Trier
                      </button>
                      <button
                        className="text-xs border rounded px-2 py-1 hover:bg-accent"
                        disabled={resolving === d.id}
                        onClick={() => resolve(d.id, "keep_current")}
                      >
                        Manter atual
                      </button>
                      <button
                        className="text-xs border rounded px-2 py-1 hover:bg-accent"
                        disabled={resolving === d.id}
                        onClick={() => resolve(d.id, "ignore")}
                      >
                        Ignorar
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">resolvido</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
