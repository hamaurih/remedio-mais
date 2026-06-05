import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_TOKEN = Deno.env.get("TRIER_API_TOKEN");

const GATEWAY_BASE_URL = "https://api-sgf-gateway.triersistemas.com.br/sgfpod1";
const PAGE_SIZE = 150;
const RETRY_MAX = 6;
const RETRY_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_NETWORK_CODES = ["ECONNRESET", "ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"];
const PAUSE_BETWEEN_PAGES_MS = 400;

type SyncMode =
  | "create_only"
  | "stock_only"
  | "price_only"
  | "barcode_only"
  | "safe_operational"
  | "catalog_protected";

type Settings = {
  environment: string;
  base_url: string;
  bearer_token: string | null;
  branch_code: string | null;
  page_size: number;
  ecommerce_filter: string; // "", "true" or "false"
  ecommerce_filter_enabled: boolean;
  sync_products_enabled: boolean; sync_categories_enabled: boolean;
  sync_stock_enabled: boolean; sync_prices_enabled: boolean;
  sync_discounts_enabled: boolean;
  schedule_products_minutes: number; schedule_stock_minutes: number;
  schedule_prices_minutes: number; schedule_discounts_minutes: number;
  last_sync_products_at: string | null; last_sync_stock_at: string | null;
  last_sync_prices_at: string | null; last_sync_discounts_at: string | null;
  sync_mode: SyncMode;
  auto_sync_paused: boolean;
  stock_source: StockSource;
};

type StockSource = "loja" | "ecommerce" | "auto";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const slugify = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeAuthorization(input: string): string {
  const cleaned = (input || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\r?\n|\r/g, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.toLowerCase().startsWith("bearer ")) return cleaned;
  return `Bearer ${cleaned}`;
}

function maskToken(raw: string | null | undefined): string {
  const cleaned = (raw || "").replace(/^(Bearer\s+)+/i, "").trim();
  if (!cleaned) return "";
  if (cleaned.length <= 6) return `${cleaned.slice(0, 1)}...${cleaned.slice(-1)}`;
  return `${cleaned.slice(0, 4)}...${cleaned.slice(-4)}`;
}

function maskAuthorizationHeader(authHeader: string): string {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  return `Bearer ${maskToken(token)}`;
}

function normalizeBaseUrl(raw: string): string {
  let base = (raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\r?\n|\r/g, "")
    .replace(/\/+$/, "");
  if (!base) return GATEWAY_BASE_URL;
  // Strip any /rest/... suffix
  const restIdx = base.toLowerCase().indexOf("/rest/");
  if (restIdx > 0) base = base.slice(0, restIdx);
  // Force HTTPS
  base = base.replace(/^http:\/\//i, "https://");
  // /api-sgf is doc only; replace with /sgfpod1
  base = base.replace(/\/api-sgf(\/.*)?$/i, "/sgfpod1");
  return base.replace(/\/+$/, "");
}

function buildTrierUrl(baseUrl: string, endpoint: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}

function buildTrierHeaders(token: string): HeadersInit {
  return {
    Authorization: normalizeAuthorization(token),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function friendlyTrierMessage(status?: number, body?: string, fallback?: string): string {
  const b = (body || "").toLowerCase();
  if (status === 401) return "Erro 401: token não reconhecido pelo Gateway Trier. Verifique se o token é válido, sem aspas e sem espaços extras.";
  if (status === 500 && b.includes("endpoint não localizado")) return "Endpoint não localizado. Verifique Base URL e caminho /rest/integracao/...";
  if (status === 403) return "Erro 403: token sem permissão para este recurso.";
  if (status === 404) return "Erro 404: endpoint inexistente nesta Base URL.";
  return fallback || (status ? `Trier respondeu HTTP ${status}.` : "Falha ao conectar com a Trier.");
}

function sanitizeLogDetails(details: any): any {
  if (details == null) return details;
  if (Array.isArray(details)) return details.map(sanitizeLogDetails);
  if (typeof details === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(details)) {
      if (v == null) { out[k] = v; continue; }
      if (/authorization/i.test(k)) { out[k] = `Bearer ${maskToken(String(v))}` || "Bearer [masked]"; continue; }
      if (/(bearer_)?token/i.test(k)) { out[k] = maskToken(String(v)) || "[masked]"; continue; }
      out[k] = sanitizeLogDetails(v);
    }
    return out;
  }
  if (typeof details === "string") {
    return details.replace(/Bearer\s+([A-Za-z0-9._=-]+)/gi, (_m, t) => `Bearer ${maskToken(t) || "[masked]"}`);
  }
  return details;
}

async function getSettings(opts: { requireToken?: boolean } = {}): Promise<Settings> {
  const { data, error } = await supabase.from("trier_settings").select("*").eq("id", 1).single();
  if (error) throw new Error("Configurações Trier não encontradas: " + error.message);
  const baseUrl = normalizeBaseUrl(data.base_url);
  const token = (data.bearer_token || FALLBACK_TOKEN || "").trim();

  if (data.base_url !== baseUrl) {
    await supabase.from("trier_settings").update({ base_url: baseUrl }).eq("id", 1);
  }

  if (!token && opts.requireToken !== false) throw new Error("Token Trier não informado.");
  return {
    ...data,
    base_url: baseUrl,
    bearer_token: token,
    ecommerce_filter: data.ecommerce_filter ?? "",
    page_size: data.page_size || PAGE_SIZE,
    branch_code: data.branch_code || "1",
    sync_mode: (data.sync_mode as SyncMode) || "safe_operational",
    auto_sync_paused: !!data.auto_sync_paused,
    stock_source: ((data.stock_source as StockSource) || "loja"),
  };
}

async function log(type: string, status: string, message: string, details?: any) {
  await supabase.from("trier_logs").insert({ type, status, message, details: sanitizeLogDetails(details) });
}

function isRetryableNetwork(err: any): boolean {
  const msg = String(err?.message || err || "");
  return RETRY_NETWORK_CODES.some((c) => msg.includes(c));
}

async function fetchTrierWithRetry(url: string, token: string, init: RequestInit = {}, ctx: { page?: number } = {}): Promise<{ ok: boolean; status?: number; body: string; responseTimeMs: number; error?: string }> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < RETRY_MAX) {
    attempt++;
    const startedAt = Date.now();
    try {
      const res = await fetch(url, { ...init, headers: buildTrierHeaders(token) });
      const text = await res.text();
      const responseTimeMs = Date.now() - startedAt;
      if (!res.ok && RETRY_HTTP_STATUSES.has(res.status) && attempt < RETRY_MAX) {
        await log("api_retry", "info", `Retry attempt ${attempt} (HTTP ${res.status}) page=${ctx.page ?? "-"}`, { url, status: res.status, attempt });
        await sleep(400 * attempt * attempt); // progressive backoff
        continue;
      }
      return { ok: res.ok, status: res.status, body: text, responseTimeMs };
    } catch (e: any) {
      lastErr = e;
      const responseTimeMs = Date.now() - startedAt;
      if (isRetryableNetwork(e) && attempt < RETRY_MAX) {
        await log("api_retry", "info", `Retry attempt ${attempt} (network) page=${ctx.page ?? "-"}`, { url, error: String(e.message || e), attempt });
        await sleep(400 * attempt * attempt);
        continue;
      }
      return { ok: false, body: "", responseTimeMs, error: String(e?.message || e) };
    }
  }
  return { ok: false, body: "", responseTimeMs: 0, error: String(lastErr?.message || lastErr || "unknown") };
}

async function requestTrier(s: Settings, path: string, init: RequestInit = {}, ctx: { page?: number } = {}) {
  const url = buildTrierUrl(s.base_url, path);
  const method = init.method || "GET";
  const tokenMasked = maskToken(s.bearer_token);
  const authHeaderMasked = `Authorization: Bearer ${tokenMasked}`;
  const qs = path.includes("?") ? path.split("?")[1] : "";
  const queryParams: Record<string, string> = {};
  if (qs) new URLSearchParams(qs).forEach((v, k) => { queryParams[k] = v; });

  const r = await fetchTrierWithRetry(url, s.bearer_token || "", init, ctx);
  const bodyTruncated = r.body.slice(0, 2000);
  const message = r.ok ? "Conexão com a Trier realizada com sucesso." : (r.error ? `Falha de rede: ${r.error}` : friendlyTrierMessage(r.status, r.body));

  let json: any = null;
  try { json = JSON.parse(r.body); } catch { /* ignore */ }
  const list = json ? extractList(json) : [];
  const count = Array.isArray(list) ? list.length : null;
  const firstItem = count && count > 0 ? list[0] : null;
  const firstItemKeys = firstItem && typeof firstItem === "object" ? Object.keys(firstItem) : null;
  let firstItemJson: string | null = null;
  try { firstItemJson = firstItem ? JSON.stringify(firstItem, null, 2).slice(0, 2000) : null; } catch { /* ignore */ }

  await log("api_call", r.ok ? "success" : "error", `${method} ${path.split("?")[0]} → HTTP ${r.status ?? "ERR"} · ${count ?? "?"} registros`, {
    baseUrl: s.base_url, endpoint: path, finalUrl: url, method,
    queryParams,
    tokenMasked, authorizationHeaderMasked: authHeaderMasked,
    status: r.status, responseTimeMs: r.responseTimeMs,
    count, firstItemKeys, firstItemJson,
    body: bodyTruncated, page: ctx.page, message,
    error: r.error || null,
  });

  return {
    ok: r.ok, status: r.status, environment: s.environment,
    baseUrl: s.base_url, endpoint: path, finalUrl: url,
    queryParams, tokenMasked, authorizationHeaderMasked: authHeaderMasked,
    responseTimeMs: r.responseTimeMs, body: bodyTruncated, text: r.body,
    json, count, firstItemKeys, firstItemJson, message, error: r.error,
  };
}

async function trierGet(s: Settings, path: string, ctx: { page?: number } = {}): Promise<any> {
  const r = await requestTrier(s, path, { method: "GET" }, ctx);
  if (!r.ok) throw new Error(r.message);
  return r.json ?? r.text;
}

async function trierPost(s: Settings, path: string, body: any): Promise<any> {
  const r = await requestTrier(s, path, { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.message);
  return r.json ?? r.text;
}

function extractList(json: any): any[] {
  if (Array.isArray(json)) return json;
  return json?.content || json?.data || json?.items || json?.produtos || json?.list || [];
}

function ecommerceParam(s: Settings): string {
  const v = (s.ecommerce_filter ?? "").trim().toLowerCase();
  if (v === "true" || v === "false") return v;
  return ""; // empty = send no value
}

/**
 * Monta query string omitindo valores undefined/null/"".
 * Mantém false, true, 0, "false", "true".
 */
function buildQueryParams(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v === "") continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

/**
 * Devolve o valor a usar para integracaoEcommerce ou undefined caso o parâmetro
 * deva ser totalmente omitido da URL.
 */
function ecommerceParamOrOmit(s: Settings): "true" | "false" | undefined {
  const v = (s.ecommerce_filter ?? "").trim().toLowerCase();
  if (v === "true" || v === "false") return v;
  return undefined;
}

function buildProductsQuery(
  s: Settings,
  offset: number,
  pageSize: number,
  extras: Record<string, string> = {},
  opts: { ativo?: "true" | "false" | "" } = {},
): string {
  const params = new URLSearchParams();
  if (s.branch_code) params.set("codFilial", String(s.branch_code));
  params.set("primeiroRegistro", String(offset));
  params.set("quantidadeRegistros", String(pageSize));
  const ativo = opts.ativo === undefined ? "true" : opts.ativo;
  if (ativo !== "") params.set("ativo", ativo);
  // integracaoEcommerce: sempre enviar a chave, valor pode ser vazio
  params.set("integracaoEcommerce", ecommerceParam(s));
  params.set("processaCustoMedio", "false");
  for (const [k, v] of Object.entries(extras)) params.set(k, v);
  return params.toString();
}

type PageStat = { page: number; offset: number; returned: number; status?: number };
type PaginateMeta = { pages: number; last_offset: number; stop_reason: string; per_page: PageStat[]; total_returned: number };

async function paginateProducts(
  s: Settings,
  endpointPath: string,
  extras: Record<string, string> = {},
  opts: { ativo?: "true" | "false" | ""; onPage?: (items: any[], stat: PageStat) => Promise<void> | void } = {},
): Promise<{ items: any[]; meta: PaginateMeta }> {
  const all: any[] = [];
  const per_page: PageStat[] = [];
  let page = 0;
  let stop_reason = "concluido";
  let last_offset = 0;
  while (true) {
    const offset = page * PAGE_SIZE;
    last_offset = offset;
    const qs = buildProductsQuery(s, offset, PAGE_SIZE, extras, { ativo: opts.ativo });
    const path = `${endpointPath}?${qs}`;
    let list: any[] = [];
    try {
      const json = await trierGet(s, path, { page });
      list = extractList(json);
    } catch (e: any) {
      stop_reason = `erro_api_pagina_${page}: ${String(e?.message || e).slice(0, 200)}`;
      per_page.push({ page, offset, returned: 0 });
      break;
    }
    per_page.push({ page, offset, returned: list.length });
    if (opts.onPage) await opts.onPage(list, { page, offset, returned: list.length });
    else all.push(...list);
    if (list.length === 0) { stop_reason = "resposta_vazia"; break; }
    if (list.length < PAGE_SIZE) { stop_reason = "pagina_parcial"; break; }
    page++;
    if (page > 1000) { stop_reason = "limite_seguranca_1000_paginas"; break; }
    await sleep(PAUSE_BETWEEN_PAGES_MS);
  }
  const total_returned = per_page.reduce((a, p) => a + p.returned, 0);
  return { items: all, meta: { pages: per_page.length, last_offset, stop_reason, per_page, total_returned } };
}

async function paginateSimple(s: Settings, buildPath: (offset: number, pageSize: number) => string): Promise<any[]> {
  const pageSize = PAGE_SIZE;
  let offset = 0, page = 0;
  const all: any[] = [];
  while (true) {
    const json = await trierGet(s, buildPath(offset, pageSize), { page });
    const list = extractList(json);
    all.push(...list);
    if (list.length < pageSize) break;
    offset += pageSize; page++;
    if (offset > 75000) break;
    await sleep(PAUSE_BETWEEN_PAGES_MS);
  }
  return all;
}

// ---------- JOB HELPERS ----------
async function startJob(sync_type: string, trigger: string) {
  const { data } = await supabase.from("trier_sync_jobs")
    .insert({ sync_type, trigger, status: "running" }).select().single();
  return data!;
}
async function finishJob(id: string, patch: any) {
  await supabase.from("trier_sync_jobs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id);
}

// ---------- MAPPERS ----------
function firstNonEmpty(...values: any[]): any {
  for (const v of values) {
    if (v == null) continue;
    const s = typeof v === "string" ? v.trim() : v;
    if (s === "" || s === undefined || s === null) continue;
    return s;
  }
  return null;
}

function pickCode(t: any): string {
  const v = firstNonEmpty(t.codigo, t.id, t.codProduto, t.codigoProduto, t.codigo_produto, t.produtoId, t.idProduto);
  return v != null ? String(v) : "";
}
function pickName(t: any): string {
  const v = firstNonEmpty(t.nomeEcommerce, t.nome, t.nomeProduto, t.descricaoProduto, t.descricao, t.apresentacao, t.descricaoCompleta);
  return v != null ? String(v) : "";
}
function pickPriceNum(t: any): number | null {
  const v = firstNonEmpty(t.valorVendaEcommerce, t.valorVenda, t.precoVenda, t.preco, t.valor_venda, t.preco_venda, t.valor);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pickStockNum(t: any): number | null {
  const v = firstNonEmpty(t.quantidadeEstoqueEcommerce, t.quantidadeEstoque, t.estoque, t.saldoEstoque, t.quantidade_estoque, t.qtdEstoque, t.saldo);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pickBarcode(t: any): string | null {
  const v = firstNonEmpty(t.codigoBarras, t.ean, t.gtin, t.barcode, t.codigo_barras);
  return v != null ? String(v) : null;
}
function pickLaboratory(t: any): string | null {
  const v = firstNonEmpty(t.nomeLaboratorio, t.laboratorio, t.descricaoLaboratorio, t.laboratorioDescricao, t.fabricante, t.nomeFabricante, t.descricaoFabricante, t.marca, t.nomeMarca, t.fornecedor, t.nomeFornecedor);
  return v != null ? String(v) : null;
}
function pickCategoryName(t: any): string | null {
  const v = firstNonEmpty(t.nomeCategoria, t.categoria, t.descricaoCategoria);
  return v != null ? String(v) : null;
}
function pickGroupName(t: any): string | null {
  const v = firstNonEmpty(t.nomeGrupo, t.grupo, t.descricaoGrupo);
  return v != null ? String(v) : null;
}
function pickActive(t: any): boolean {
  if (t.ativo === false || t.ativo === "false" || t.ativo === 0) return false;
  return true;
}

function mapProduct(t: any, stockSource: StockSource = "loja") {
  const code = pickCode(t);
  const name = pickName(t);
  const ecomPriceRaw = t.valorVendaEcommerce;
  const ecomPrice = ecomPriceRaw != null && ecomPriceRaw !== "" && Number.isFinite(Number(ecomPriceRaw)) ? Number(ecomPriceRaw) : null;
  const basePrice = pickPriceNum(t);
  const finalPrice = ecomPrice ?? basePrice ?? 0;
  const promo = ecomPrice != null && basePrice != null && ecomPrice < basePrice ? ecomPrice : null;

  // ----- Estoque -----
  // Regra: a farmácia vende usando o estoque REAL da loja (quantidadeEstoque).
  // quantidadeEstoqueEcommerce fica salvo apenas como campo auxiliar/informativo.
  const rawStockReal = firstNonEmpty(t.quantidadeEstoque, t.estoque, t.saldoEstoque, t.quantidade_estoque, t.qtdEstoque, t.saldo);
  const stockReal = rawStockReal != null && rawStockReal !== "" && Number.isFinite(Number(rawStockReal)) ? Number(rawStockReal) : null;
  const rawStockEcom = t.quantidadeEstoqueEcommerce;
  const stockEcom = rawStockEcom != null && rawStockEcom !== "" && Number.isFinite(Number(rawStockEcom)) ? Number(rawStockEcom) : null;

  // Fonte de estoque do site (configurável; padrão = loja)
  let stockSite: number;
  let sourceApplied: string;
  if (stockSource === "ecommerce") {
    stockSite = stockEcom ?? 0;
    sourceApplied = "Estoque e-commerce: quantidadeEstoqueEcommerce";
  } else if (stockSource === "auto") {
    if (stockEcom != null) { stockSite = stockEcom; sourceApplied = "Automático → quantidadeEstoqueEcommerce"; }
    else { stockSite = stockReal ?? 0; sourceApplied = "Automático → quantidadeEstoque"; }
  } else {
    stockSite = stockReal ?? 0;
    sourceApplied = "Estoque real da loja: quantidadeEstoque";
  }

  const ecomEnabled = t.integracaoEcommerce ?? false;
  const isActive = pickActive(t);
  const tarja = t.tipoLista || null;
  const lab = pickLaboratory(t);
  const obs: string[] = [];
  if (basePrice == null && ecomPrice == null) obs.push("precisa revisar: sem preço na Trier");
  if (stockReal == null && stockEcom == null) obs.push("indisponível: sem estoque na Trier");

  // ---- shelves automáticas ----
  const catName = pickCategoryName(t) || "";
  const grpName = pickGroupName(t) || "";
  const depName = (t.nomeDepartamento || "") as string;
  const haystack = `${catName} ${grpName} ${depName} ${name}`.toUpperCase();
  const shelves = new Set<string>();
  if (promo != null) shelves.add("ofertas-da-semana");
  if (t.maisVendido === true || t.destaque === true) shelves.add("mais-vendidos");
  if (/GEN[EÉ]RICOS?|SIMILAR|MEDICAMENTO/.test(haystack)) shelves.add("medicamentos-populares");
  if (/HIGIENE|BELEZA|PERFUMARIA|DERMO|SHAMPOO|SAB[OÃ]/.test(haystack)) shelves.add("higiene-e-beleza");
  if (/BEB[EÊ]|INFANTIL|FRALDA|MAM[ÃA]E|MAMADEIRA/.test(haystack)) shelves.add("mamaes-e-bebes");
  if (/VITAMINA|SUPLEMENTO|NUTRI|MINERAL/.test(haystack)) shelves.add("vitaminas-e-suplementos");
  if (/CURATIVO|GAZE|ESPARADRAPO|ANTISS[ÉE]PTICO|PRIMEIROS SOCORROS|BAND-?AID/.test(haystack)) shelves.add("primeiros-socorros");
  if (shelves.size === 0) shelves.add("medicamentos-populares");

  return {
    _shelves: Array.from(shelves),
    _category_name_for_link: catName || grpName || depName || "Medicamentos",
    _stock_source_applied: sourceApplied,
    _stock_real: stockReal,
    _stock_ecom: stockEcom,
    trier_product_id: code,
    name: name || "Sem nome",
    ecommerce_name: t.nomeEcommerce ?? null,
    slug: slugify((name || "produto") + "-" + code),
    description: t.descricaoEcommerce ?? t.descricaoProduto ?? t.descricao ?? null,
    barcode: pickBarcode(t),
    trier_barcode: pickBarcode(t),
    laboratory: lab,
    laboratory_code: t.codigoLaboratorio ?? null,
    manufacturer: lab,
    group_code: t.codigoGrupo ?? null,
    group_name: pickGroupName(t),
    category_external_id: t.codigoCategoria ?? null,
    category_name: pickCategoryName(t),
    department_external_id: t.codigoDepartamento ?? null,
    department_name: t.nomeDepartamento ?? null,
    active_ingredient: t.nomePrincipioAtivo ?? null,
    active_ingredient_code: t.codigoPrincipioAtivo ?? null,
    price: finalPrice,
    ecommerce_price: ecomPrice,
    promo_price: promo,
    on_sale: promo != null,
    stock: stockSite,
    stock_quantity: stockSite,
    trier_stock_quantity: stockReal,
    ecommerce_stock_quantity: stockEcom,
    is_active: isActive,
    trier_active: isActive,
    ecommerce_enabled: ecomEnabled,
    // Regra: produto fica ativo no site apenas se ativo na Trier E tem estoque > 0.
    // (manual_disabled é aplicado no upsert, após ler o registro existente.)
    active: isActive && stockSite > 0,
    max_discount_percentage: t.percentualDescontoMax != null ? Number(t.percentualDescontoMax) : null,
    sale_observation: [t.observacaoVenda, ...obs].filter(Boolean).join(" · ") || null,
    medicine_list_type: tarja,
    tarja: ["VERMELHA", "vermelha"].includes(tarja) ? "vermelha" : (["PRETA", "preta"].includes(tarja) ? "preta" : null),
    requires_prescription: ["VERMELHA", "PRETA", "vermelha", "preta"].includes(tarja),
    tags: Array.isArray(t.tags) ? t.tags.join(",") : (t.tags ?? null),
    cart_quantity_limit: t.qtdLimiteCarrinhoEcommerce != null ? Number(t.qtdLimiteCarrinhoEcommerce) : null,
    source: "trier",
    last_trier_sync_at: new Date().toISOString(),
  };
}

type UpsertResult = {
  created?: boolean; updated?: boolean; skipped?: boolean; failed?: boolean;
  reason?: string; error?: string; trier_id?: string; name?: string;
  fields_updated?: string[]; fields_protected?: string[]; barcode_divergence?: boolean;
};

// Campos que a Trier NUNCA deve sobrescrever em produto já existente
// (campos comerciais/manuais — controlados pelo admin do site).
const PROTECTED_ALWAYS = new Set<string>([
  "image_url", "gallery_images",
  "slug",
  "seo_title", "seo_description", "seo_keywords",
  "product_badge", "custom_warning",
  "featured",
  "shelves",
  "tags",
]);

// Campos operacionais que a Trier pode atualizar.
const FIELDS_STOCK = ["stock", "stock_quantity", "trier_stock_quantity", "ecommerce_stock_quantity", "last_stock_sync_at", "trier_active"];
const FIELDS_PRICE = ["price", "ecommerce_price", "promo_price", "on_sale"];
const FIELDS_BARCODE = ["barcode", "trier_barcode"];
const FIELDS_TECHNICAL = [
  "laboratory", "manufacturer", "laboratory_code",
  "group_code", "group_name",
  "category_external_id", "category_name",
  "department_external_id", "department_name",
  "active_ingredient", "active_ingredient_code",
  "max_discount_percentage", "sale_observation",
  "medicine_list_type", "tarja", "requires_prescription",
  "ecommerce_enabled", "is_active",
  "cart_quantity_limit", "ecommerce_name",
];

function fieldsForMode(mode: SyncMode): Set<string> {
  const base = new Set<string>(["last_trier_sync_at", "source"]);
  switch (mode) {
    case "stock_only":
      FIELDS_STOCK.forEach((f) => base.add(f)); base.add("active"); break;
    case "price_only":
      FIELDS_PRICE.forEach((f) => base.add(f)); break;
    case "barcode_only":
      FIELDS_BARCODE.forEach((f) => base.add(f)); break;
    case "safe_operational":
      [...FIELDS_STOCK, ...FIELDS_PRICE, ...FIELDS_BARCODE, ...FIELDS_TECHNICAL].forEach((f) => base.add(f));
      base.add("active");
      break;
    case "catalog_protected":
      // tudo, exceto PROTECTED_ALWAYS e campos com flag manual
      [
        "name", "description", "short_description", "category_id",
        ...FIELDS_STOCK, ...FIELDS_PRICE, ...FIELDS_BARCODE, ...FIELDS_TECHNICAL, "active",
      ].forEach((f) => base.add(f));
      break;
    case "create_only":
      // sem updates em produtos existentes
      break;
  }
  return base;
}

function manualLocksOf(existing: any): Set<string> {
  const locked = new Set<string>();
  if (!existing) return locked;
  if (existing.lock_manual_price) FIELDS_PRICE.forEach((f) => locked.add(f));
  if (existing.lock_manual_stock) FIELDS_STOCK.forEach((f) => locked.add(f));
  if (existing.manual_image) { locked.add("image_url"); locked.add("gallery_images"); }
  if (existing.manual_description) { locked.add("description"); locked.add("short_description"); }
  if (existing.manual_category) { locked.add("category_id"); locked.add("category_name"); }
  if (existing.manual_active) { locked.add("active"); locked.add("is_active"); }
  if (existing.manual_barcode) FIELDS_BARCODE.forEach((f) => locked.add(f));
  if (existing.manual_name) locked.add("name");
  if (existing.manual_seo) { locked.add("seo_title"); locked.add("seo_description"); locked.add("seo_keywords"); locked.add("slug"); }
  if (existing.manual_shelves) locked.add("shelves");
  // manual_override = trava tudo, menos operacional
  if (existing.manual_override) {
    ["name", "description", "short_description", "image_url", "gallery_images",
     "slug", "seo_title", "seo_description", "seo_keywords",
     "category_id", "category_name", "shelves", "featured", "tags",
     "product_badge", "custom_warning", "active",
    ].forEach((f) => locked.add(f));
  }
  return locked;
}

function isEmptyValue(v: any): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

async function recordProductSyncLog(entry: {
  product_id?: string | null; trier_product_id: string; sync_type: string;
  fields_updated?: string[]; fields_protected?: string[];
  old_values?: any; new_values?: any;
  status?: string; error_message?: string;
}) {
  try {
    await supabase.from("product_sync_logs").insert({
      product_id: entry.product_id ?? null,
      trier_product_id: entry.trier_product_id,
      sync_type: entry.sync_type,
      fields_updated: entry.fields_updated ?? [],
      fields_protected: entry.fields_protected ?? [],
      old_values: entry.old_values ?? null,
      new_values: entry.new_values ?? null,
      status: entry.status ?? "ok",
      error_message: entry.error_message ?? null,
    });
  } catch (_) { /* nunca derruba a sync por causa de log */ }
}

async function upsertProductFromTrier(
  t: any,
  opts: { onlyStock?: boolean; onlyPrice?: boolean; mode?: SyncMode; syncType?: string; simulate?: boolean; stockSource?: StockSource } = {},
): Promise<UpsertResult> {
  const trierId = pickCode(t);
  const name = pickName(t);
  if (!trierId) return { skipped: true, reason: "sem_codigo" };
  if (!name) return { skipped: true, reason: "sem_nome", trier_id: trierId };

  const { data: existing, error: selErr } = await supabase.from("products")
    .select("id, name, barcode, image_url, gallery_images, description, short_description, category_id, shelves, featured, slug, seo_title, seo_description, seo_keywords, product_badge, active, lock_manual_price, lock_manual_stock, sync_with_trier, manual_override, manual_image, manual_description, manual_category, manual_active, manual_barcode, manual_name, manual_seo, manual_shelves, manual_disabled, stock_quantity, trier_stock_quantity, ecommerce_stock_quantity, trier_active")
    .eq("trier_product_id", trierId).maybeSingle();
  if (selErr) return { failed: true, error: `select: ${selErr.message}`, trier_id: trierId, name };

  const mapped: any = mapProduct(t, opts.stockSource || "loja");
  const autoShelves: string[] = mapped._shelves || [];
  const catNameForLink: string = mapped._category_name_for_link || "Medicamentos";
  delete mapped._shelves;
  delete mapped._category_name_for_link;
  delete mapped._stock_source_applied;
  delete mapped._stock_real;
  delete mapped._stock_ecom;
  delete mapped.discount_percentage;

  // Aplica manual_disabled: nunca exibe no site se o admin desativou manualmente.
  if (existing?.manual_disabled === true) {
    mapped.active = false;
  }

  // Em sincronização de estoque, sempre marcar last_stock_sync_at
  if (opts.onlyStock) {
    mapped.last_stock_sync_at = new Date().toISOString();
  }
  delete mapped.discount_percentage;

  // Resolver/criar categoria
  let categoryId: string | null = null;
  try {
    const catSlug = slugify(catNameForLink);
    const { data: existCat } = await supabase.from("categories").select("id").eq("slug", catSlug).maybeSingle();
    if (existCat) categoryId = existCat.id;
    else {
      const { data: newCat } = await supabase.from("categories")
        .insert({ name: catNameForLink, slug: catSlug, active: true, show_in_menu: true, show_on_home: true })
        .select("id").single();
      if (newCat) categoryId = newCat.id;
    }
  } catch (_) { /* ignora */ }
  if (categoryId) mapped.category_id = categoryId;

  // ------- INSERT (novo produto) -------
  if (!existing) {
    if (opts.onlyStock || opts.onlyPrice) {
      return { skipped: true, reason: "sem_mapeamento_ainda", trier_id: trierId, name };
    }
    mapped.shelves = autoShelves;
    if (opts.simulate) {
      return { created: true, trier_id: trierId, name, fields_updated: Object.keys(mapped) };
    }
    const { data: ins, error } = await supabase.from("products").insert(mapped).select("id").single();
    if (error) {
      await recordProductSyncLog({ trier_product_id: trierId, sync_type: opts.syncType || "create", status: "error", error_message: error.message });
      return { failed: true, error: `insert: ${error.message}`, trier_id: trierId, name };
    }
    await supabase.from("trier_product_mappings").insert({
      product_id: ins.id, trier_product_id: trierId, trier_barcode: mapped.barcode, trier_name: mapped.name,
      last_synced_at: new Date().toISOString(), sync_status: "ok",
    });
    await recordProductSyncLog({
      product_id: ins.id, trier_product_id: trierId, sync_type: opts.syncType || "create",
      fields_updated: Object.keys(mapped), new_values: mapped,
    });
    return { created: true, trier_id: trierId, name, fields_updated: Object.keys(mapped) };
  }

  // ------- UPDATE (produto existente) -------
  if (existing.sync_with_trier === false) {
    return { skipped: true, reason: "sync_desativado_no_produto", trier_id: trierId, name };
  }

  // 1) Determinar campos permitidos pelo modo
  let allowed: Set<string>;
  if (opts.onlyStock) allowed = new Set([...FIELDS_STOCK, "active", "last_trier_sync_at"]);
  else if (opts.onlyPrice) allowed = new Set([...FIELDS_PRICE, "last_trier_sync_at"]);
  else allowed = fieldsForMode(opts.mode || "safe_operational");

  // create_only não atualiza existentes
  if ((opts.mode === "create_only") && !opts.onlyStock && !opts.onlyPrice) {
    return { skipped: true, reason: "modo_create_only_ja_existe", trier_id: trierId, name };
  }

  // 2) Manual locks
  const locks = manualLocksOf(existing);
  const fields_protected: string[] = [];
  const fields_updated: string[] = [];
  const oldValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  let barcodeDivergence = false;

  const candidate: Record<string, any> = {};
  for (const [k, v] of Object.entries(mapped)) {
    if (!allowed.has(k) && !PROTECTED_ALWAYS.has(k)) {
      if (allowed.size > 0 && !["last_trier_sync_at"].includes(k)) { /* fora do modo */ continue; }
    }
    if (!allowed.has(k)) continue;
    if (PROTECTED_ALWAYS.has(k)) { fields_protected.push(k + ":sempre_manual"); continue; }
    if (locks.has(k)) { fields_protected.push(k + ":manual"); continue; }
    // Nunca apagar com null/empty vindo da Trier
    if (isEmptyValue(v) && !isEmptyValue((existing as any)[k])) {
      fields_protected.push(k + ":nao_apagar_com_vazio");
      continue;
    }
    // Barcode: detectar divergência e NÃO sobrescrever automaticamente
    if (k === "barcode") {
      const cur = (existing as any).barcode;
      if (cur && v && String(cur).trim() !== String(v).trim()) {
        barcodeDivergence = true;
        fields_protected.push("barcode:divergencia_aguardando_revisao");
        // registra divergência (idempotente por product_id)
        if (!opts.simulate) {
          await supabase.from("trier_barcode_divergences").upsert({
            product_id: existing.id, trier_product_id: trierId,
            current_barcode: String(cur), trier_barcode: String(v), status: "pending",
          }, { onConflict: "product_id" });
        }
        continue;
      }
    }
    candidate[k] = v;
    if ((existing as any)[k] !== v) {
      fields_updated.push(k);
      oldValues[k] = (existing as any)[k];
      newValues[k] = v;
    }
  }

  // Sempre atualizar last_trier_sync_at
  candidate.last_trier_sync_at = mapped.last_trier_sync_at;

  // Mesclar prateleiras (somente se permitido e não bloqueado)
  if (!opts.onlyStock && !opts.onlyPrice && !locks.has("shelves") && (opts.mode === "catalog_protected")) {
    candidate.shelves = Array.from(new Set([...(existing.shelves || []), ...autoShelves]));
    if (JSON.stringify(existing.shelves || []) !== JSON.stringify(candidate.shelves)) {
      fields_updated.push("shelves");
    }
  }

  if (opts.simulate) {
    return {
      updated: fields_updated.length > 0, skipped: fields_updated.length === 0,
      trier_id: trierId, name, fields_updated, fields_protected, barcode_divergence: barcodeDivergence,
      reason: fields_updated.length === 0 ? "nada_a_atualizar" : undefined,
    };
  }

  if (fields_updated.length === 0) {
    // só toca last_trier_sync_at
    await supabase.from("products").update({ last_trier_sync_at: candidate.last_trier_sync_at }).eq("id", existing.id);
    await recordProductSyncLog({
      product_id: existing.id, trier_product_id: trierId, sync_type: opts.syncType || "update",
      fields_updated: [], fields_protected, status: "noop",
    });
    return { skipped: true, reason: "nada_a_atualizar", trier_id: trierId, name, fields_protected, barcode_divergence: barcodeDivergence };
  }

  const { error } = await supabase.from("products").update(candidate).eq("id", existing.id);
  if (error) {
    await recordProductSyncLog({
      product_id: existing.id, trier_product_id: trierId, sync_type: opts.syncType || "update",
      fields_updated, fields_protected, old_values: oldValues, new_values: newValues,
      status: "error", error_message: error.message,
    });
    return { failed: true, error: `update: ${error.message}`, trier_id: trierId, name };
  }
  await supabase.from("trier_product_mappings").upsert({
    product_id: existing.id, trier_product_id: trierId, trier_barcode: mapped.barcode, trier_name: mapped.name,
    last_synced_at: new Date().toISOString(), sync_status: "ok",
  }, { onConflict: "trier_product_id" });
  await recordProductSyncLog({
    product_id: existing.id, trier_product_id: trierId, sync_type: opts.syncType || "update",
    fields_updated, fields_protected, old_values: oldValues, new_values: newValues,
  });
  return { updated: true, trier_id: trierId, name, fields_updated, fields_protected, barcode_divergence: barcodeDivergence };
}

// ---------- ACTIONS ----------
function buildTestProductsPath(s: Settings): string {
  const qs = buildProductsQuery(s, 0, PAGE_SIZE);
  return `/rest/integracao/produto/obter-todos-v1?${qs}`;
}

async function actionTestConnection() {
  const s = await getSettings({ requireToken: false });
  const endpoint = buildTestProductsPath(s);
  const finalUrl = buildTrierUrl(s.base_url, endpoint);
  if (!s.bearer_token) {
    await supabase.from("trier_settings").update({
      last_connection_test_at: new Date().toISOString(), last_connection_status: "error",
    }).eq("id", 1);
    return {
      ok: false, environment: s.environment, baseUrl: s.base_url, endpoint, finalUrl,
      tokenMasked: "", authorizationHeaderMasked: "", message: "Token Trier não informado.",
    };
  }
  const response = await requestTrier(s, endpoint, { method: "GET" });
  await supabase.from("trier_settings").update({
    last_connection_test_at: new Date().toISOString(),
    last_connection_status: response.ok ? "ok" : "error",
  }).eq("id", 1);
  await log("connection", response.ok ? "success" : "error", response.message, {
    baseUrl: response.baseUrl, endpoint: response.endpoint, finalUrl: response.finalUrl,
    tokenMasked: response.tokenMasked, authorizationHeaderMasked: response.authorizationHeaderMasked,
    status: response.status, responseTimeMs: response.responseTimeMs, body: response.body,
  });
  return response;
}

async function actionTestProductsEndpoint() {
  const s = await getSettings({ requireToken: false });
  const endpoint = buildTestProductsPath(s);
  const finalUrl = buildTrierUrl(s.base_url, endpoint);
  const qs = endpoint.split("?")[1] || "";
  const queryParamsObj: Record<string, string> = {};
  new URLSearchParams(qs).forEach((v, k) => { queryParamsObj[k] = v; });

  if (!s.bearer_token) {
    return {
      ok: false, environment: s.environment, baseUrl: s.base_url, endpoint, finalUrl,
      queryParams: queryParamsObj,
      tokenMasked: "", authorizationHeaderMasked: "",
      message: "Token Trier não informado.", body: "",
    };
  }

  const response = await requestTrier(s, endpoint, { method: "GET" });
  let count: number | null = null;
  let firstItemJson: string | null = null;
  try {
    const list = extractList(response.json ?? []);
    count = list.length;
    if (list.length > 0) {
      const safeFirst = JSON.stringify(list[0], null, 2);
      firstItemJson = safeFirst.slice(0, 1000);
    }
  } catch { /* ignore */ }

  return {
    ...response,
    queryParams: queryParamsObj,
    count,
    firstItemJson,
  };
}

function summarizeResults(results: UpsertResult[]) {
  const created = results.filter((r) => r.created).length;
  const updated = results.filter((r) => r.updated).length;
  const failed = results.filter((r) => r.failed).length;
  const ignored = results.filter((r) => r.skipped).length;
  const ignored_reasons: Record<string, number> = {};
  for (const r of results) if (r.skipped && r.reason) ignored_reasons[r.reason] = (ignored_reasons[r.reason] || 0) + 1;
  const errors = results.filter((r) => r.failed).slice(0, 20).map((r) => ({ trier_id: r.trier_id, name: r.name, error: r.error }));
  const sampleIgnored = results.filter((r) => r.skipped).slice(0, 10).map((r) => ({ trier_id: r.trier_id, name: r.name, reason: r.reason }));
  return { created, updated, failed, ignored, ignored_reasons, errors, sampleIgnored };
}

async function actionSyncProducts(trigger = "manual", changed = false, modeOverride?: SyncMode) {
  const s = await getSettings();
  const job = await startJob(changed ? "products_changed" : "products", trigger);
  try {
    const allItems: any[] = [];
    const metaByFilter: Record<string, PaginateMeta> = {};
    if (changed) {
      const since = s.last_sync_products_at || new Date(Date.now() - 7 * 86400000).toISOString();
      const dataInicial = since.slice(0, 10);
      const dataFinal = new Date().toISOString().slice(0, 10);
      const r = await paginateProducts(s, "/rest/integracao/produto/obter-alterados-v1", { dataInicial, dataFinal }, { ativo: "" });
      allItems.push(...r.items);
      metaByFilter["alterados"] = r.meta;
    } else {
      // Sincronização COMPLETA: percorre ativo=true e depois ativo=false para
      // garantir o cadastro de produtos inativos/sem estoque também.
      for (const ativo of ["true", "false"] as const) {
        const r = await paginateProducts(s, "/rest/integracao/produto/obter-todos-v1", {}, { ativo });
        // dedup por código (caso a API retorne em ambos)
        const seen = new Set(allItems.map((t) => pickCode(t)));
        for (const t of r.items) {
          const c = pickCode(t);
          if (!c || seen.has(c)) continue;
          allItems.push(t); seen.add(c);
        }
        metaByFilter[`ativo_${ativo}`] = r.meta;
      }
    }

    const mode: SyncMode = modeOverride || s.sync_mode || "safe_operational";
    const results: UpsertResult[] = [];
    for (const t of allItems) results.push(await upsertProductFromTrier(t, { mode, stockSource: s.stock_source, syncType: changed ? "products_changed" : "products" }));
    const sum = summarizeResults(results);
    await supabase.from("trier_settings").update({ last_sync_products_at: new Date().toISOString() }).eq("id", 1);

    const total_returned_api = Object.values(metaByFilter).reduce((a, m) => a + m.total_returned, 0);
    const pages = Object.values(metaByFilter).reduce((a, m) => a + m.pages, 0);
    const last_offset = Math.max(0, ...Object.values(metaByFilter).map((m) => m.last_offset));
    const stop_reasons = Object.fromEntries(Object.entries(metaByFilter).map(([k, m]) => [k, m.stop_reason]));

    await finishJob(job.id, {
      status: sum.failed > 0 ? "partial" : "success",
      records_checked: allItems.length,
      records_created: sum.created,
      records_updated: sum.updated,
      records_failed: sum.failed,
      records_ignored: sum.ignored,
      details: {
        total_returned_api,
        unique_processed: allItems.length,
        pages_consulted: pages,
        last_offset,
        stop_reasons,
        ignored_reasons: sum.ignored_reasons,
        per_filter: metaByFilter,
      },
    });
    const msg = allItems.length === 0
      ? "A Trier respondeu com sucesso, mas não retornou produtos para esses filtros."
      : `Produtos: ${total_returned_api} retornados (API) · ${allItems.length} únicos · ${sum.created} criados · ${sum.updated} atualizados · ${sum.ignored} ignorados · ${sum.failed} com erro · ${pages} páginas · último offset ${last_offset}`;
    await log("products", sum.failed > 0 ? "error" : "success", msg, { changed, total: allItems.length, total_returned_api, pages, last_offset, stop_reasons, ...sum });
    return { ok: true, total: allItems.length, total_returned_api, pages, last_offset, stop_reasons, ...sum };
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 1200);
    await finishJob(job.id, { status: "error", error_message: msg });
    await log("products", "error", "Erro na sincronização de produtos", { error: msg });
    return { ok: false, error: msg };
  }
}

async function actionDiagnoseProductsPage() {
  const s = await getSettings();
  const qs = buildProductsQuery(s, 0, 150);
  const path = `/rest/integracao/produto/obter-todos-v1?${qs}`;
  const response = await requestTrier(s, path, { method: "GET" }, { page: 0 });
  if (!response.ok) {
    return {
      ok: false, stage: "api", message: response.message,
      finalUrl: response.finalUrl, queryParams: response.queryParams,
      status: response.status, responseTimeMs: response.responseTimeMs,
      body: response.body, error: response.error,
    };
  }
  const list = extractList(response.json ?? []);
  if (list.length === 0) {
    return {
      ok: true, stage: "empty",
      message: "A Trier respondeu com sucesso, mas não retornou produtos para esses filtros.",
      finalUrl: response.finalUrl, queryParams: response.queryParams,
      status: response.status, responseTimeMs: response.responseTimeMs,
      count: 0, firstItemJson: null, firstItemKeys: null,
    };
  }
  const results: UpsertResult[] = [];
  for (const t of list) results.push(await upsertProductFromTrier(t, { stockSource: s.stock_source }));
  const sum = summarizeResults(results);
  return {
    ok: true, stage: "done",
    message: `${list.length} produtos retornados · ${sum.created} criados · ${sum.updated} atualizados · ${sum.ignored} ignorados · ${sum.failed} com erro`,
    finalUrl: response.finalUrl, queryParams: response.queryParams,
    status: response.status, responseTimeMs: response.responseTimeMs,
    count: list.length, firstItemJson: response.firstItemJson, firstItemKeys: response.firstItemKeys,
    ...sum,
  };
}

// Conta produtos retornados pela API SEM gravar nada — para sabermos o universo real da Trier
async function actionDiagnoseTotal() {
  const s = await getSettings();
  const stats = {
    ativo_true: 0,
    ativo_false: 0,
    ecommerce_true: 0,
    ecommerce_empty: 0,
    com_estoque: 0,
    sem_estoque: 0,
    sem_ativo_definido: 0,
  };
  const per_filter: Record<string, PaginateMeta> = {};
  const seenCodes = new Set<string>();
  for (const ativo of ["true", "false"] as const) {
    const r = await paginateProducts(s, "/rest/integracao/produto/obter-todos-v1", {}, {
      ativo,
      onPage: (items) => {
        for (const t of items) {
          const c = pickCode(t);
          if (c) {
            if (seenCodes.has(c)) continue;
            seenCodes.add(c);
          }
          if (t.ativo === true || t.ativo === "true") stats.ativo_true++;
          else if (t.ativo === false || t.ativo === "false") stats.ativo_false++;
          else stats.sem_ativo_definido++;
          if (t.integracaoEcommerce === true || t.integracaoEcommerce === "true") stats.ecommerce_true++;
          else stats.ecommerce_empty++;
          const stockVal = pickStockNum(t);
          if ((stockVal ?? 0) > 0) stats.com_estoque++;
          else stats.sem_estoque++;
        }
      },
    });
    per_filter[`ativo_${ativo}`] = r.meta;
  }
  const total_unicos = seenCodes.size;
  const total_api = Object.values(per_filter).reduce((a, m) => a + m.total_returned, 0);
  await log("diagnose_total", "info", `Diagnóstico Trier: ${total_unicos} produtos únicos · ${total_api} retornos da API`, { stats, per_filter, total_unicos, total_api });
  return { ok: true, total_unicos, total_api, stats, per_filter };
}

async function actionCancelJob(jobId: string) {
  await supabase.from("trier_sync_jobs").update({
    status: "cancelled", finished_at: new Date().toISOString(), error_message: "Cancelado manualmente pelo admin",
  }).eq("id", jobId);
  return { ok: true };
}

async function actionDbStats() {
  const [tot, ativ, inat, vinc, comE, semE] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("active", false),
    supabase.from("products").select("id", { count: "exact", head: true }).not("trier_product_id", "is", null),
    supabase.from("products").select("id", { count: "exact", head: true }).gt("stock", 0),
    supabase.from("products").select("id", { count: "exact", head: true }).lte("stock", 0),
  ]);
  return {
    ok: true,
    cadastrados: tot.count || 0,
    ativos: ativ.count || 0,
    inativos: inat.count || 0,
    vinculados_trier: vinc.count || 0,
    com_estoque: comE.count || 0,
    sem_estoque: semE.count || 0,
  };
}

// ============================================================
//  DIAGNÓSTICO TÉCNICO — só leitura / testes pontuais
// ============================================================

function buildDiagProductsQuery(
  branch: string | null,
  offset: number,
  pageSize: number,
  opts: { ativo?: "true" | "false" | "__none__"; ecom?: "true" | "false" | "" | "__none__" } = {},
): string {
  const params = new URLSearchParams();
  if (branch) params.set("codFilial", String(branch));
  params.set("primeiroRegistro", String(offset));
  params.set("quantidadeRegistros", String(pageSize));
  if (opts.ativo !== "__none__") params.set("ativo", opts.ativo ?? "true");
  if (opts.ecom !== "__none__") params.set("integracaoEcommerce", opts.ecom ?? "");
  params.set("processaCustoMedio", "false");
  return params.toString();
}

// Paginação sem gravar — apenas conta + amostra primeiro/último
async function paginateCountOnly(
  s: Settings,
  endpointPath: string,
  opts: { ativo?: "true" | "false" | "__none__"; ecom?: "true" | "false" | "" | "__none__"; maxPages?: number } = {},
): Promise<{ pages: number; last_offset: number; last_page_count: number; total: number; stop_reason: string; first_item: any; first_item_keys: string[]; last_item: any; last_item_keys: string[]; duration_ms: number }> {
  const max = opts.maxPages ?? 400;
  let page = 0, total = 0, last_offset = 0, last_page_count = 0, stop_reason = "concluido";
  let first_item: any = null, last_item: any = null;
  const started = Date.now();
  while (page < max) {
    const offset = page * PAGE_SIZE;
    last_offset = offset;
    const qs = buildDiagProductsQuery(s.branch_code, offset, PAGE_SIZE, opts);
    const path = `${endpointPath}?${qs}`;
    let list: any[] = [];
    try {
      const json = await trierGet(s, path, { page });
      list = extractList(json);
    } catch (e: any) {
      stop_reason = `erro_pagina_${page}: ${String(e?.message || e).slice(0, 160)}`;
      break;
    }
    last_page_count = list.length;
    if (list.length > 0) {
      if (first_item == null) first_item = list[0];
      last_item = list[list.length - 1];
    }
    total += list.length;
    if (list.length === 0) { stop_reason = "resposta_vazia"; break; }
    if (list.length < PAGE_SIZE) { stop_reason = "pagina_parcial"; break; }
    page++;
    if (page >= max) { stop_reason = `limite_seguranca_${max}_paginas`; break; }
    await sleep(PAUSE_BETWEEN_PAGES_MS);
  }
  return {
    pages: page + (stop_reason === "concluido" ? 0 : 1),
    last_offset, last_page_count, total, stop_reason,
    first_item, first_item_keys: first_item && typeof first_item === "object" ? Object.keys(first_item) : [],
    last_item, last_item_keys: last_item && typeof last_item === "object" ? Object.keys(last_item) : [],
    duration_ms: Date.now() - started,
  };
}

async function actionDiagApiTotal() {
  const s = await getSettings();
  const r = await paginateCountOnly(s, "/rest/integracao/produto/obter-todos-v1", { ativo: "true", ecom: "" });
  await log("diag_api_total", "info", `Diagnóstico API: ${r.total} produtos · ${r.pages} páginas · parada=${r.stop_reason}`, r);
  return { ok: true, ...r };
}

async function actionDiagApiScenarios() {
  const s = await getSettings();
  const scenarios: { id: string; label: string; ativo: "true" | "false" | "__none__"; ecom: "true" | "false" | "" | "__none__" }[] = [
    { id: "A", label: "ativo=true · integracaoEcommerce=(vazio)", ativo: "true", ecom: "" },
    { id: "B", label: "sem ativo · integracaoEcommerce=(vazio)", ativo: "__none__", ecom: "" },
    { id: "C", label: "ativo=(vazio enviado)", ativo: "__none__", ecom: "" },
    { id: "D", label: "ativo=true · integracaoEcommerce=true", ativo: "true", ecom: "true" },
    { id: "E", label: "sem ativo · sem integracaoEcommerce", ativo: "__none__", ecom: "__none__" },
  ];
  const out: any[] = [];
  for (const sc of scenarios) {
    const r = await paginateCountOnly(s, "/rest/integracao/produto/obter-todos-v1", { ativo: sc.ativo, ecom: sc.ecom });
    out.push({ id: sc.id, label: sc.label, total: r.total, pages: r.pages, last_offset: r.last_offset, stop_reason: r.stop_reason, duration_ms: r.duration_ms });
  }
  await log("diag_api_scenarios", "info", `Cenários API: ${out.map((o) => `${o.id}=${o.total}`).join(" · ")}`, { scenarios: out });
  return { ok: true, scenarios: out };
}

async function actionDiagDbFull() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isoToday = today.toISOString();
  const c = async (q: any) => (await q).count || 0;
  const [
    total, ativos, inativos, comTrier, semTrier, comEstoque, semEstoque,
    comPreco, semPreco, criadosHoje, atualizadosHoje, semNome,
  ] = await Promise.all([
    c(supabase.from("products").select("id", { count: "exact", head: true })),
    c(supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).eq("active", false)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).not("trier_product_id", "is", null)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).is("trier_product_id", null)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).gt("stock", 0)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).lte("stock", 0)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).gt("price", 0)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).or("price.is.null,price.eq.0")),
    c(supabase.from("products").select("id", { count: "exact", head: true }).gte("created_at", isoToday)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).gte("updated_at", isoToday)),
    c(supabase.from("products").select("id", { count: "exact", head: true }).or("name.is.null,name.eq.")),
  ]);
  const { data: lastCreated } = await supabase.from("products").select("id,name,trier_product_id,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: lastUpdated } = await supabase.from("products").select("id,name,trier_product_id,updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  // Duplicados por código Trier — busca leve
  let duplicates = 0;
  try {
    const { data: dupRows } = await supabase.rpc as any;
    // fallback: pega top 200 trier_product_id e conta no JS
    const { data: sample } = await supabase.from("products").select("trier_product_id").not("trier_product_id", "is", null).limit(5000);
    const m = new Map<string, number>();
    (sample || []).forEach((r: any) => m.set(r.trier_product_id, (m.get(r.trier_product_id) || 0) + 1));
    for (const v of m.values()) if (v > 1) duplicates += v;
    void dupRows;
  } catch { /* ignore */ }
  return {
    ok: true,
    total, ativos, inativos, comTrier, semTrier, comEstoque, semEstoque,
    comPreco, semPreco, criadosHoje, atualizadosHoje, semNome,
    duplicados_codigo_trier: duplicates,
    last_created: lastCreated, last_updated: lastUpdated,
    upsert_key: "trier_product_id",
  };
}

async function actionDiagComparePage(offset: number, pageSize: number) {
  const s = await getSettings();
  const qs = buildDiagProductsQuery(s.branch_code, offset, pageSize, { ativo: "true", ecom: "" });
  const path = `/rest/integracao/produto/obter-todos-v1?${qs}`;
  const json = await trierGet(s, path, { page: Math.floor(offset / pageSize) });
  const list = extractList(json);
  const codes = list.map(pickCode).filter(Boolean);
  const { data: existing } = await supabase.from("products").select("trier_product_id").in("trier_product_id", codes.length ? codes : ["__none__"]);
  const existingSet = new Set((existing || []).map((r: any) => r.trier_product_id));
  const items = list.map((t: any) => {
    const code = pickCode(t);
    const name = pickName(t);
    const stock = pickStockNum(t);
    const price = pickPriceNum(t);
    let acao = "criar"; let motivo = "novo";
    if (!code) { acao = "ignorar"; motivo = "sem_codigo"; }
    else if (!name) { acao = "ignorar"; motivo = "sem_nome"; }
    else if (existingSet.has(code)) { acao = "atualizar"; motivo = "existe_no_banco"; }
    return { code, name, stock, price, existe: existingSet.has(code), acao, motivo };
  });
  const sum = {
    recebidos: list.length,
    com_codigo: items.filter((i) => i.code).length,
    sem_codigo: items.filter((i) => !i.code).length,
    sem_nome: items.filter((i) => i.code && !i.name).length,
    existem: items.filter((i) => i.existe).length,
    nao_existem: items.filter((i) => !i.existe && i.code).length,
    seriam_criados: items.filter((i) => i.acao === "criar").length,
    seriam_atualizados: items.filter((i) => i.acao === "atualizar").length,
    seriam_ignorados: items.filter((i) => i.acao === "ignorar").length,
  };
  return { ok: true, offset, pageSize, sum, items };
}

async function actionDiagUpsertPage(offset: number, pageSize: number, limit = 5) {
  const s = await getSettings();
  const qs = buildDiagProductsQuery(s.branch_code, offset, pageSize, { ativo: "true", ecom: "" });
  const path = `/rest/integracao/produto/obter-todos-v1?${qs}`;
  const json = await trierGet(s, path, { page: Math.floor(offset / pageSize) });
  const list = extractList(json).slice(0, limit);
  const results: any[] = [];
  for (const t of list) {
    const code = pickCode(t);
    const name = pickName(t);
    const payloadPreview = { trier_product_id: code, name, stock: pickStockNum(t), price: pickPriceNum(t) };
    const r = await upsertProductFromTrier(t, { stockSource: s.stock_source });
    results.push({ code, name, payload: payloadPreview, ...r });
  }
  return { ok: true, results };
}

async function actionDiagDbWrite() {
  const ts = Date.now();
  const trier_id = `diagnostic_test_${ts}`;
  const out: any = { trier_id, insert: null, update: null, delete: null };
  // INSERT
  const insertPayload: any = { trier_product_id: trier_id, name: "Produto Teste Diagnóstico", slug: `diagnostic-test-${ts}`, source: "diagnostic", active: false, price: 0, stock: 0 };
  const ins = await supabase.from("products").insert(insertPayload).select("id").maybeSingle();
  if (ins.error) { out.insert = { ok: false, error: ins.error.message, code: (ins.error as any).code, hint: (ins.error as any).hint }; return out; }
  out.insert = { ok: true, id: ins.data?.id };
  const id = ins.data!.id;
  // UPDATE
  const upd = await supabase.from("products").update({ name: "Produto Teste Diagnóstico v2" }).eq("id", id);
  out.update = upd.error ? { ok: false, error: upd.error.message, code: (upd.error as any).code } : { ok: true };
  // DELETE
  const del = await supabase.from("products").delete().eq("id", id);
  out.delete = del.error ? { ok: false, error: del.error.message, code: (del.error as any).code } : { ok: true };
  return { ok: true, ...out };
}

async function actionDiagStockEndpoint() {
  const s = await getSettings();
  const variants = [
    { id: 1, label: "sem codFilial · integracaoEcommerce=(vazio)", qs: "primeiroRegistro=0&quantidadeRegistros=150&integracaoEcommerce=" },
    { id: 2, label: "codFilial=1 · integracaoEcommerce=(vazio)", qs: `codFilial=${s.branch_code || 1}&primeiroRegistro=0&quantidadeRegistros=150&integracaoEcommerce=` },
    { id: 3, label: "codFilial=1 · sem integracaoEcommerce", qs: `codFilial=${s.branch_code || 1}&primeiroRegistro=0&quantidadeRegistros=150` },
    { id: 4, label: "sem codFilial · sem integracaoEcommerce", qs: "primeiroRegistro=0&quantidadeRegistros=150" },
  ];
  const out: any[] = [];
  for (const v of variants) {
    const path = `/rest/integracao/estoque/obter-todos-v1?${v.qs}`;
    const r = await requestTrier(s, path, { method: "GET" });
    const list = r.json ? extractList(r.json) : [];
    out.push({ id: v.id, label: v.label, finalUrl: r.finalUrl, status: r.status, count: list.length, body_preview: r.body?.slice(0, 400) });
  }
  return { ok: true, variants: out, recomendacao: out.every((o) => o.count === 0) ? "Endpoint retorna 0. Use quantidadeEstoque do endpoint de produtos." : "Endpoint de estoque retorna dados." };
}

async function actionDiagLastProductsJob() {
  const { data } = await supabase.from("trier_sync_jobs").select("*").in("sync_type", ["products", "products_changed"]).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return { ok: true, job: data };
}

async function actionListMappings(opts: { limit: number; offset: number }) {
  const { limit, offset } = opts;
  const { data, count, error } = await supabase
    .from("trier_product_mappings")
    .select("*, products(name, stock, price, active)", { count: "exact" })
    .order("last_synced_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: data || [], total: count || 0 };
}

async function actionSyncCategories(trigger = "manual") {
  const s = await getSettings();
  const job = await startJob("categories", trigger);
  let created = 0, updated = 0, failed = 0;
  try {
    const list = await paginateSimple(s, (o, q) => `/rest/integracao/categoria/obter-todos-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}`);
    for (const c of list) {
      const ext = String(c.codigo ?? "");
      if (!ext) continue;
      const slug = slugify(c.nome || ext);
      const { data: existing } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("categories").update({ name: c.nome }).eq("id", existing.id);
        if (error) failed++; else updated++;
      } else {
        const { error } = await supabase.from("categories").insert({ name: c.nome, slug });
        if (error) failed++; else created++;
      }
    }
    await supabase.from("trier_settings").update({ last_sync_categories_at: new Date().toISOString() }).eq("id", 1);
    await finishJob(job.id, { status: "success", records_checked: list.length, records_created: created, records_updated: updated, records_failed: failed });
    return { ok: true, total: list.length, created, updated, failed };
  } catch (e: any) {
    await finishJob(job.id, { status: "error", error_message: String(e.message).slice(0, 1200) });
    return { ok: false, error: e.message };
  }
}

async function actionSyncStock(trigger = "manual") {
  const s = await getSettings();
  const job = await startJob("stock", trigger);
  let updated = 0, ignored = 0, failed = 0;
  try {
    const ecom = ecommerceParamOrOmit(s); // undefined => omitido
    const codFilial = s.branch_code ?? 1;
    const ecomStatus = ecom === undefined ? "omitido" : ecom;

    await log("info", "stock", "Iniciando sincronização de estoque", {
      endpoint: "/rest/integracao/estoque/obter-todos-v1",
      codFilial,
      integracaoEcommerce: ecomStatus,
      pageSize: 150,
    });

    const list = await paginateSimple(s, (o, q) =>
      `/rest/integracao/estoque/obter-todos-v1?${buildQueryParams({
        codFilial,
        primeiroRegistro: o,
        quantidadeRegistros: q,
        integracaoEcommerce: ecom,
      })}`
    );

    for (const t of list) {
      const r = await upsertProductFromTrier(t, { onlyStock: true, stockSource: s.stock_source });
      if (r.updated) updated++;
      else if (r.failed) failed++;
      else ignored++;
    }
    await supabase.from("trier_settings").update({ last_sync_stock_at: new Date().toISOString() }).eq("id", 1);
    await finishJob(job.id, {
      status: "success",
      records_checked: list.length,
      records_updated: updated,
      records_failed: failed,
      records_ignored: ignored,
      details: { codFilial, integracaoEcommerce: ecomStatus, total_returned: list.length },
    });
    return { ok: true, total: list.length, updated, failed, ignored, codFilial, integracaoEcommerce: ecomStatus };
  } catch (e: any) {
    await finishJob(job.id, { status: "error", error_message: String(e.message).slice(0, 1200) });
    return { ok: false, error: e.message };
  }
}

async function actionSyncPrices(trigger = "manual") {
  const s = await getSettings();
  const job = await startJob("prices", trigger);
  let updated = 0, ignored = 0, failed = 0;
  try {
    const list = await paginateSimple(s, (o, q) => `/rest/integracao/produto/precificacao/obter-todos-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}&removerRestricaoEstoque=true`);
    for (const t of list) {
      const r = await upsertProductFromTrier(t, { onlyPrice: true, stockSource: s.stock_source });
      if (r.updated) updated++;
      else if (r.failed) failed++;
      else ignored++;
    }
    await supabase.from("trier_settings").update({ last_sync_prices_at: new Date().toISOString() }).eq("id", 1);
    await finishJob(job.id, { status: "success", records_checked: list.length, records_updated: updated, records_failed: failed, records_ignored: ignored });
    return { ok: true, total: list.length, updated, failed, ignored };
  } catch (e: any) {
    await finishJob(job.id, { status: "error", error_message: String(e.message).slice(0, 1200) });
    return { ok: false, error: e.message };
  }
}

async function actionSyncDiscounts(trigger = "manual") {
  const s = await getSettings();
  const job = await startJob("discounts", trigger);
  let updated = 0, ignored = 0, failed = 0;
  try {
    const list = await paginateSimple(s, (o, q) => `/rest/integracao/produto/desconto/melhor/obter-todos-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}&removerRestricaoEstoque=true`);
    for (const t of list) {
      const r = await upsertProductFromTrier(t, { onlyPrice: true, stockSource: s.stock_source });
      if (r.updated) updated++;
      else if (r.failed) failed++;
      else ignored++;
    }
    await supabase.from("trier_settings").update({ last_sync_discounts_at: new Date().toISOString() }).eq("id", 1);
    await finishJob(job.id, { status: "success", records_checked: list.length, records_updated: updated, records_failed: failed, records_ignored: ignored });
    return { ok: true, total: list.length, updated, failed, ignored };
  } catch (e: any) {
    await finishJob(job.id, { status: "error", error_message: String(e.message).slice(0, 1200) });
    return { ok: false, error: e.message };
  }
}

async function actionSyncAll(trigger = "manual") {
  const r1 = await actionSyncProducts(trigger);
  const r2 = await actionSyncCategories(trigger);
  const r3 = await actionSyncStock(trigger);
  const r4 = await actionSyncPrices(trigger);
  const r5 = await actionSyncDiscounts(trigger);
  return { products: r1, categories: r2, stock: r3, prices: r4, discounts: r5 };
}

const STATUS_MAP: Record<number, string> = {
  0: "indefinido", 1: "pendente", 2: "disponivel_retirada", 3: "entregue", 4: "cancelado", 5: "em_entrega",
};

async function actionSendOrder(orderId: string) {
  const s = await getSettings();
  const { data: order, error: oe } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (oe || !order) throw new Error("Pedido não encontrado");
  if (order.payment_status && order.payment_status !== "approved") {
    throw new Error("Pedido ainda não foi pago. Aguarde a confirmação do Mercado Pago antes de enviar à Trier.");
  }
  const { data: items, error: ie } = await supabase.from("order_items").select("*, products(trier_product_id, stock, name)").eq("order_id", orderId);
  if (ie) throw new Error(ie.message);

  for (const it of items || []) {
    if (!it.products?.trier_product_id) throw new Error(`Item "${it.product_name}" sem código Trier — sincronize produtos primeiro.`);
    if ((it.products.stock ?? 0) <= 0) throw new Error(`Item "${it.product_name}" sem estoque local.`);
  }

  const payload = {
    numeroPedido: order.id,
    dataPedido: order.created_at,
    valorTotalVenda: Number(order.total),
    valorFrete: 0,
    entrega: order.delivery_method !== "pickup",
    cliente: { nome: order.customer_name, telefone: order.customer_phone },
    enderecoEntrega: order.customer_address ? { logradouro: order.customer_address } : null,
    pagamento: null,
    pagamentoMultiplo: null,
    produtos: (items || []).map((it: any) => ({
      codigoProduto: it.products.trier_product_id,
      nomeProduto: it.product_name,
      quantidade: it.quantity,
      valorUnitario: Number(it.unit_price),
      valorDesconto: 0,
    })),
  };

  try {
    const res = await trierPost(s, "/rest/integracao/venda/ecommerce/", payload);
    await supabase.from("orders").update({
      trier_sent: true, trier_sent_at: new Date().toISOString(),
      trier_status: "pendente", trier_status_code: 1,
      trier_numero_nota: res?.numeroNota ?? null, trier_error_message: null,
    }).eq("id", orderId);
    await log("order_send", "success", `Pedido ${orderId} enviado para Trier`, { order_id: orderId });
    return { ok: true, response: res };
  } catch (e: any) {
    await supabase.from("orders").update({ trier_error_message: String(e.message).slice(0, 1200) }).eq("id", orderId);
    await log("order_send", "error", `Erro ao enviar pedido ${orderId}`, { error: String(e.message).slice(0, 1200), order_id: orderId });
    return { ok: false, error: e.message };
  }
}

async function actionCheckOrderStatus(orderIds?: string[]) {
  const s = await getSettings();
  let ids = orderIds;
  if (!ids?.length) {
    const { data } = await supabase.from("orders").select("id").eq("trier_sent", true).neq("trier_status", "entregue").neq("trier_status", "cancelado").limit(50);
    ids = (data || []).map((d) => d.id);
  }
  if (!ids.length) return { ok: true, updated: 0 };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  let updated = 0;
  for (const chunk of chunks) {
    const q = chunk.map((i) => `numerosPedidos=${encodeURIComponent(i)}`).join("&");
    try {
      const res = await trierGet(s, `/rest/integracao/venda/ecommerce/consultar-venda-v1?${q}`);
      const arr = extractList(res);
      for (const r of arr) {
        const code = Number(r.status ?? r.statusVenda ?? 0);
        const label = STATUS_MAP[code] || "indefinido";
        await supabase.from("orders").update({
          trier_status: label, trier_status_code: code,
          trier_last_status_check_at: new Date().toISOString(),
        }).eq("id", r.numeroPedido || r.numero_pedido);
        updated++;
      }
    } catch (e: any) {
      await log("order_status", "error", "Erro consultando status", { error: String(e.message).slice(0, 1200) });
    }
  }
  return { ok: true, updated };
}

async function actionUpdateOrderStatus(orderId: string, statusCode: number) {
  const s = await getSettings();
  await trierPost(s, "/rest/integracao/venda/ecommerce/atualizar-status-v1", {
    numeroPedido: orderId, status: statusCode,
  });
  await supabase.from("orders").update({ trier_status_code: statusCode, trier_status: STATUS_MAP[statusCode] }).eq("id", orderId);
  return { ok: true };
}

async function actionScheduled() {
  const s = await getSettings();
  if (s.auto_sync_paused) {
    await log("scheduled", "info", "Sincronização automática pausada (auto_sync_paused=true). Nada será executado.");
    return { ok: true, paused: true, results: {} };
  }
  const now = Date.now();
  const due = (last: string | null, mins: number) => !last || (now - new Date(last).getTime()) >= mins * 60000;
  const results: any = {};
  if (s.sync_stock_enabled && due(s.last_sync_stock_at, s.schedule_stock_minutes)) results.stock = await actionSyncStock("cron");
  if (s.sync_prices_enabled && due(s.last_sync_prices_at, s.schedule_prices_minutes)) results.prices = await actionSyncPrices("cron");
  if (s.sync_discounts_enabled && due(s.last_sync_discounts_at, s.schedule_discounts_minutes)) results.discounts = await actionSyncDiscounts("cron");
  if (s.sync_products_enabled && due(s.last_sync_products_at, s.schedule_products_minutes)) results.products = await actionSyncProducts("cron", true);
  return { ok: true, results };
}

// ---------- SAFE-SYNC ACTIONS ----------

async function actionMarkStalledJobs(minutes = 20) {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data: stalled } = await supabase.from("trier_sync_jobs")
    .select("id, sync_type, started_at, records_checked")
    .eq("status", "running")
    .lt("started_at", cutoff);
  const ids = (stalled || []).map((j: any) => j.id);
  if (ids.length === 0) return { ok: true, marked: 0, jobs: [] };
  await supabase.from("trier_sync_jobs").update({
    status: "error",
    error_message: "job_travado_sem_progresso",
    finished_at: new Date().toISOString(),
  }).in("id", ids);
  await log("jobs", "info", `Marcados ${ids.length} jobs travados (>${minutes}min) como falhos.`, { ids });
  return { ok: true, marked: ids.length, jobs: stalled };
}

async function actionToggleAutoSync(paused: boolean) {
  await supabase.from("trier_settings").update({ auto_sync_paused: !!paused }).eq("id", 1);
  await log("settings", "info", `Sincronização automática ${paused ? "PAUSADA" : "RETOMADA"}.`, { auto_sync_paused: !!paused });
  return { ok: true, auto_sync_paused: !!paused };
}

async function actionSetSyncMode(mode: SyncMode) {
  const valid: SyncMode[] = ["create_only", "stock_only", "price_only", "barcode_only", "safe_operational", "catalog_protected"];
  if (!valid.includes(mode)) throw new Error("Modo de sincronização inválido");
  await supabase.from("trier_settings").update({ sync_mode: mode }).eq("id", 1);
  await log("settings", "info", `Modo de sincronização alterado para: ${mode}.`, { sync_mode: mode });
  return { ok: true, sync_mode: mode };
}

async function actionSimulateSyncPage(offset = 0, pageSize = 50, mode?: SyncMode) {
  const s = await getSettings();
  const effMode: SyncMode = mode || s.sync_mode || "safe_operational";
  const qs = buildProductsQuery(s, offset, pageSize, {}, { ativo: "true" });
  const json = await trierGet(s, `/rest/integracao/produto/obter-todos-v1?${qs}`, { page: Math.floor(offset / pageSize) });
  const list = extractList(json);
  const results: UpsertResult[] = [];
  for (const t of list) results.push(await upsertProductFromTrier(t, { mode: effMode, simulate: true, syncType: "simulate", stockSource: s.stock_source }));
  const created = results.filter((r) => r.created).length;
  const updated = results.filter((r) => r.updated).length;
  const skipped = results.filter((r) => r.skipped).length;
  const divergences = results.filter((r) => r.barcode_divergence).length;
  const items = results.map((r) => ({
    trier_id: r.trier_id, name: r.name,
    action: r.created ? "criar" : r.updated ? "atualizar" : "ignorar",
    fields_updated: r.fields_updated || [],
    fields_protected: r.fields_protected || [],
    barcode_divergence: !!r.barcode_divergence,
    reason: r.reason,
  }));
  return { ok: true, mode: effMode, offset, pageSize, total: list.length, created, updated, skipped, divergences, items };
}

async function actionListBarcodeDivergences(limit = 100, offset = 0) {
  const { data, count } = await supabase
    .from("trier_barcode_divergences")
    .select("*, products(name, trier_product_id)", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return { ok: true, items: data || [], total: count || 0 };
}

async function actionResolveBarcodeDivergence(id: string, action: "keep_current" | "use_trier" | "ignore") {
  const { data: div } = await supabase.from("trier_barcode_divergences").select("*").eq("id", id).maybeSingle();
  if (!div) return { ok: false, error: "Divergência não encontrada" };
  if (action === "use_trier" && div.product_id) {
    await supabase.from("products").update({ barcode: div.trier_barcode, trier_barcode: div.trier_barcode }).eq("id", div.product_id);
  }
  await supabase.from("trier_barcode_divergences").update({
    status: action === "keep_current" ? "kept_current" : action === "use_trier" ? "replaced" : "ignored",
    resolved_at: new Date().toISOString(),
  }).eq("id", id);
  return { ok: true };
}

async function actionListProductSyncLogs(productId?: string, limit = 50) {
  let q = supabase.from("product_sync_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (productId) q = q.eq("product_id", productId);
  const { data } = await q;
  return { ok: true, items: data || [] };
}

async function actionSyncBarcodes(trigger = "manual") {
  return actionSyncProducts(trigger, false, "barcode_only");
}



// ---------- AUTH ----------
async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Não autenticado");
  const userSb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: claims, error } = await userSb.auth.getClaims(auth.replace("Bearer ", ""));
  if (error || !claims?.claims) throw new Error("Não autenticado");
  const userId = claims.claims.sub;
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!role) throw new Error("Acesso restrito a administradores");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "POST" ? (await req.clone().json().catch(() => ({}))).action : null);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const trigger = body.trigger || url.searchParams.get("trigger") || "manual";

    if (action !== "scheduled") {
      await requireAdmin(req);
    }

    // Sync actions can exceed the 150s edge timeout — run them in background.
    const runAsync = (syncType: string, fn: () => Promise<any>) => {
      const p = (async () => {
        try { await fn(); }
        catch (e: any) { await log("error", syncType, `Async ${syncType} falhou`, { error: String(e?.message || e) }); }
      })();
      // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
      return { ok: true, async: true, started: true, sync_type: syncType, message: "Sincronização iniciada em background. Acompanhe em Jobs/Logs." };
    };

    let result: any;
    switch (action) {
      case "test-connection": result = await actionTestConnection(); break;
      case "test-products-endpoint": result = await actionTestProductsEndpoint(); break;
      case "diagnose-products-page": result = await actionDiagnoseProductsPage(); break;
      case "diagnose-total": result = runAsync("diagnose-total", () => actionDiagnoseTotal()); break;
      case "diag-api-total": result = runAsync("diag-api-total", () => actionDiagApiTotal()); break;
      case "diag-api-scenarios": result = runAsync("diag-api-scenarios", () => actionDiagApiScenarios()); break;
      case "diag-db-full": result = await actionDiagDbFull(); break;
      case "diag-compare-page": result = await actionDiagComparePage(Number(body.offset) || 0, Number(body.pageSize) || 150); break;
      case "diag-upsert-page": result = await actionDiagUpsertPage(Number(body.offset) || 0, Number(body.pageSize) || 150, Number(body.limit) || 5); break;
      case "diag-db-write": result = await actionDiagDbWrite(); break;
      case "diag-stock-endpoint": result = await actionDiagStockEndpoint(); break;
      case "diag-last-products-job": result = await actionDiagLastProductsJob(); break;
      case "db-stats": result = await actionDbStats(); break;
      case "list-mappings": result = await actionListMappings({ limit: Number(body.limit) || 100, offset: Number(body.offset) || 0 }); break;
      case "cancel-job": result = await actionCancelJob(body.job_id); break;
      case "preview-url": {
        const s = await getSettings({ requireToken: false });
        const endpoint = buildTestProductsPath(s);
        result = { baseUrl: s.base_url, endpoint, finalUrl: buildTrierUrl(s.base_url, endpoint) };
        break;
      }
      case "sync-products": result = runAsync("products", () => actionSyncProducts(trigger, !!body.changed, body.mode as SyncMode | undefined)); break;
      case "sync-barcodes": result = runAsync("barcodes", () => actionSyncBarcodes(trigger)); break;
      case "mark-stalled-jobs": result = await actionMarkStalledJobs(Number(body.minutes) || 20); break;
      case "toggle-auto-sync": result = await actionToggleAutoSync(!!body.paused); break;
      case "set-sync-mode": result = await actionSetSyncMode(body.mode as SyncMode); break;
      case "simulate-sync-page": result = await actionSimulateSyncPage(Number(body.offset) || 0, Number(body.pageSize) || 50, body.mode as SyncMode | undefined); break;
      case "list-barcode-divergences": result = await actionListBarcodeDivergences(Number(body.limit) || 100, Number(body.offset) || 0); break;
      case "resolve-barcode-divergence": result = await actionResolveBarcodeDivergence(body.id, body.action); break;
      case "list-product-sync-logs": result = await actionListProductSyncLogs(body.product_id, Number(body.limit) || 50); break;
      case "sync-categories": result = runAsync("categories", () => actionSyncCategories(trigger)); break;
      case "sync-stock": result = runAsync("stock", () => actionSyncStock(trigger)); break;
      case "sync-prices": result = runAsync("prices", () => actionSyncPrices(trigger)); break;
      case "sync-discounts": result = runAsync("discounts", () => actionSyncDiscounts(trigger)); break;
      case "sync-all": result = runAsync("all", () => actionSyncAll(trigger)); break;
      case "send-order": result = await actionSendOrder(body.order_id); break;
      case "check-order-status": result = await actionCheckOrderStatus(body.order_ids); break;
      case "update-order-status": result = await actionUpdateOrderStatus(body.order_id, body.status); break;
      case "scheduled": result = runAsync("scheduled", () => actionScheduled()); break;
      default: return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
