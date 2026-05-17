import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_TOKEN = Deno.env.get("TRIER_API_TOKEN");
const HOMOLOGATION_BASE_URL = "https://homologacao.triersistemas.com.br/sgfpod1";

type Settings = {
  environment: string; base_url: string; bearer_token: string | null;
  page_size: number; ecommerce_filter_enabled: boolean;
  sync_products_enabled: boolean; sync_categories_enabled: boolean;
  sync_stock_enabled: boolean; sync_prices_enabled: boolean;
  sync_discounts_enabled: boolean;
  schedule_products_minutes: number; schedule_stock_minutes: number;
  schedule_prices_minutes: number; schedule_discounts_minutes: number;
  last_sync_products_at: string | null; last_sync_stock_at: string | null;
  last_sync_prices_at: string | null; last_sync_discounts_at: string | null;
};

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const slugify = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function cleanTrierToken(input: string): string {
  return (input || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\r?\n|\r/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function maskToken(token: string | null | undefined): string {
  const clean = cleanTrierToken(token || "");
  if (!clean) return "";
  if (clean.length <= 6) return `${clean.slice(0, 1)}...${clean.slice(-1)}`;
  return `${clean.slice(0, 3)}...${clean.slice(-3)}`;
}

function normalizeBaseUrl(raw: string, environment = "homologacao"): string {
  let base = (raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\r?\n|\r/g, "")
    .replace(/\/+$/, "");

  if (!base && environment === "homologacao") {
    return HOMOLOGATION_BASE_URL;
  }

  if (environment === "homologacao" && /^http:\/\//i.test(base)) {
    base = `https://${base.slice(7)}`;
  }

  const restIdx = base.toLowerCase().indexOf("/rest/");
  if (restIdx > 0) base = base.slice(0, restIdx);

  if (/^https?:\/\/homologacao\.triersistemas\.com\.br(\/.*)?$/i.test(base)) {
    return HOMOLOGATION_BASE_URL;
  }

  return base.replace(/\/api-sgf(\/.*)?$/i, "/sgfpod1").replace(/\/+$/, "");
}

function buildTrierUrl(baseUrl: string, endpoint: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}

function buildTrierHeaders(token: string): HeadersInit {
  const clean = cleanTrierToken(token);
  return {
    Authorization: `Bearer ${clean}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function friendlyTrierMessage(status?: number, body?: string, fallback?: string): string {
  const normalizedBody = (body || "").toLowerCase();
  if (status === 401) {
    return "Erro 401: token não reconhecido pela Trier. Verifique se o token é de homologação, se está ativo, se foi colado sem aspas e se não está duplicando o prefixo Bearer.";
  }
  if (status === 500 && normalizedBody.includes("endpoint não localizado")) {
    return "Endpoint não localizado. Verifique Base URL e caminho /rest/integracao/...";
  }
  return fallback || (status ? `A Trier respondeu com HTTP ${status}.` : "Falha ao conectar com a Trier.");
}

function sanitizeLogDetails(details: any): any {
  if (details == null) return details;
  if (Array.isArray(details)) return details.map(sanitizeLogDetails);

  if (typeof details === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(details)) {
      if (value == null) {
        sanitized[key] = value;
        continue;
      }

      if (/authorization/i.test(key)) {
        const masked = maskToken(String(value));
        sanitized[key] = masked ? `Bearer ${masked}` : "Bearer [masked]";
        continue;
      }

      if (/(bearer_)?token/i.test(key)) {
        sanitized[key] = maskToken(String(value)) || "[masked]";
        continue;
      }

      sanitized[key] = sanitizeLogDetails(value);
    }
    return sanitized;
  }

  if (typeof details === "string") {
    return details.replace(/Bearer\s+([A-Za-z0-9._=-]+)/gi, (_match, token) => `Bearer ${maskToken(token) || "[masked]"}`);
  }

  return details;
}

async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase.from("trier_settings").select("*").eq("id", 1).single();
  if (error) throw new Error("Configurações Trier não encontradas: " + error.message);
  const normalizedBaseUrl = normalizeBaseUrl(data.base_url, data.environment);
  const token = cleanTrierToken(data.bearer_token || FALLBACK_TOKEN || "");

  const patch: Record<string, any> = {};
  if (data.base_url !== normalizedBaseUrl) patch.base_url = normalizedBaseUrl;
  if (data.bearer_token && data.bearer_token !== token) patch.bearer_token = token;
  if (Object.keys(patch).length > 0) {
    await supabase.from("trier_settings").update(patch).eq("id", 1);
  }

  if (!token) throw new Error("Token Trier não informado.");
  return { ...data, base_url: normalizedBaseUrl, bearer_token: token };
}

async function log(type: string, status: string, message: string, details?: any) {
  await supabase.from("trier_logs").insert({ type, status, message, details: sanitizeLogDetails(details) });
}

async function requestTrier(s: Settings, path: string, init: RequestInit = {}) {
  const url = buildTrierUrl(s.base_url, path);
  const method = init.method || "GET";
  const tokenMasked = maskToken(s.bearer_token);
  const authorizationHeaderMasked = `Authorization: Bearer ${tokenMasked}`;
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      headers: buildTrierHeaders(s.bearer_token),
    });
    const text = await response.text();
    const body = text.slice(0, 1500);
    const responseTimeMs = Date.now() - startedAt;
    const message = response.ok
      ? "Conexão com a Trier realizada com sucesso."
      : friendlyTrierMessage(response.status, body);

    await log("api_call", response.ok ? "success" : "error", `${method} ${path} → HTTP ${response.status}`, {
      environment: s.environment,
      baseUrl: s.base_url,
      endpoint: path,
      finalUrl: url,
      tokenMasked,
      authorizationHeaderMasked,
      status: response.status,
      responseTimeMs,
      body,
      message,
    });

    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }

    return {
      ok: response.ok,
      status: response.status,
      environment: s.environment,
      baseUrl: s.base_url,
      endpoint: path,
      finalUrl: url,
      tokenMasked,
      authorizationHeaderMasked,
      responseTimeMs,
      body,
      message,
      text,
      json,
    };
  } catch (e: any) {
    const responseTimeMs = Date.now() - startedAt;
    const message = `Falha de rede ao chamar Trier: ${e.message}`;
    await log("api_call", "error", `${method} ${path} → falha de rede`, {
      environment: s.environment,
      baseUrl: s.base_url,
      endpoint: path,
      finalUrl: url,
      tokenMasked,
      authorizationHeaderMasked,
      responseTimeMs,
      error: e.message,
      message,
    });
    return {
      ok: false,
      environment: s.environment,
      baseUrl: s.base_url,
      endpoint: path,
      finalUrl: url,
      tokenMasked,
      authorizationHeaderMasked,
      responseTimeMs,
      message,
      error: e.message,
    };
  }
}

async function trierGet(s: Settings, path: string): Promise<any> {
  const response = await requestTrier(s, path, { method: "GET" });
  if (!response.ok) throw new Error(response.message);
  return response.json ?? response.text;
}

async function trierPost(s: Settings, path: string, body: any): Promise<any> {
  const response = await requestTrier(s, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(response.message);
  return response.json ?? response.text;
}

function extractList(json: any): any[] {
  if (Array.isArray(json)) return json;
  return json?.content || json?.data || json?.items || json?.produtos || json?.list || [];
}

async function paginate(s: Settings, buildPath: (offset: number, pageSize: number) => string): Promise<any[]> {
  const pageSize = s.page_size || 100;
  let offset = 0;
  const all: any[] = [];
  while (true) {
    const json = await trierGet(s, buildPath(offset, pageSize));
    const list = extractList(json);
    all.push(...list);
    if (list.length < pageSize) break;
    offset += pageSize;
    if (offset > 50000) break; // safety
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
function mapProduct(t: any) {
  const price = Number(t.valorVenda ?? 0);
  const ecomPrice = t.valorVendaEcommerce != null ? Number(t.valorVendaEcommerce) : null;
  const finalPrice = ecomPrice ?? price;
  const promo = ecomPrice != null && ecomPrice < price ? ecomPrice : null;
  const stockEcom = t.quantidadeEstoqueEcommerce != null ? Number(t.quantidadeEstoqueEcommerce) : null;
  const stock = stockEcom ?? Number(t.quantidadeEstoque ?? 0);
  const ecomEnabled = t.integracaoEcommerce ?? false;
  const tarja = t.tipoLista || null;
  return {
    trier_product_id: String(t.codigo ?? t.id ?? ""),
    name: t.nomeEcommerce || t.nome || "Sem nome",
    ecommerce_name: t.nomeEcommerce ?? null,
    slug: slugify(t.nomeEcommerce || t.nome || String(t.codigo)),
    description: t.descricaoEcommerce ?? null,
    barcode: t.codigoBarras ?? null,
    trier_barcode: t.codigoBarras ?? null,
    laboratory: t.nomeLaboratorio ?? null,
    laboratory_code: t.codigoLaboratorio ?? null,
    manufacturer: t.nomeLaboratorio ?? null,
    group_code: t.codigoGrupo ?? null,
    group_name: t.nomeGrupo ?? null,
    category_external_id: t.codigoCategoria ?? null,
    category_name: t.nomeCategoria ?? null,
    department_external_id: t.codigoDepartamento ?? null,
    department_name: t.nomeDepartamento ?? null,
    active_ingredient: t.nomePrincipioAtivo ?? null,
    active_ingredient_code: t.codigoPrincipioAtivo ?? null,
    price: finalPrice,
    ecommerce_price: ecomPrice,
    promo_price: promo,
    on_sale: promo != null,
    stock,
    stock_quantity: t.quantidadeEstoque != null ? Number(t.quantidadeEstoque) : null,
    ecommerce_stock_quantity: stockEcom,
    is_active: t.ativo ?? true,
    ecommerce_enabled: ecomEnabled,
    active: (t.ativo ?? true) && ecomEnabled && stock > 0,
    max_discount_percentage: t.percentualDescontoMax != null ? Number(t.percentualDescontoMax) : null,
    discount_percentage: t.percentualDesconto != null ? Number(t.percentualDesconto) : null,
    sale_observation: t.observacaoVenda ?? null,
    medicine_list_type: tarja,
    tarja: ["VERMELHA", "vermelha"].includes(tarja) ? "vermelha" : (["PRETA", "preta"].includes(tarja) ? "preta" : null),
    requires_prescription: ["VERMELHA", "PRETA", "vermelha", "preta"].includes(tarja),
    tags: Array.isArray(t.tags) ? t.tags.join(",") : (t.tags ?? null),
    cart_quantity_limit: t.qtdLimiteCarrinhoEcommerce != null ? Number(t.qtdLimiteCarrinhoEcommerce) : null,
    source: "trier",
    last_trier_sync_at: new Date().toISOString(),
  };
}

async function upsertProductFromTrier(t: any, opts: { onlyStock?: boolean; onlyPrice?: boolean } = {}) {
  const trierId = String(t.codigo ?? t.id ?? "");
  if (!trierId) return { skipped: true };

  // find existing by trier_product_id
  const { data: existing } = await supabase.from("products")
    .select("id, lock_manual_price, lock_manual_stock, sync_with_trier")
    .eq("trier_product_id", trierId).maybeSingle();

  const mapped = mapProduct(t);
  let payload: any = mapped;

  if (existing) {
    if (existing.sync_with_trier === false) return { skipped: true };
    if (opts.onlyStock) payload = { stock: mapped.stock, ecommerce_stock_quantity: mapped.ecommerce_stock_quantity, stock_quantity: mapped.stock_quantity, active: mapped.active, last_trier_sync_at: mapped.last_trier_sync_at };
    if (opts.onlyPrice) payload = { price: mapped.price, ecommerce_price: mapped.ecommerce_price, promo_price: mapped.promo_price, on_sale: mapped.on_sale, discount_percentage: mapped.discount_percentage, last_trier_sync_at: mapped.last_trier_sync_at };
    if (existing.lock_manual_price) { delete payload.price; delete payload.ecommerce_price; delete payload.promo_price; delete payload.on_sale; }
    if (existing.lock_manual_stock) { delete payload.stock; delete payload.ecommerce_stock_quantity; delete payload.stock_quantity; }

    const { error } = await supabase.from("products").update(payload).eq("id", existing.id);
    if (error) return { failed: true, error: error.message };
    await supabase.from("trier_product_mappings").upsert({
      product_id: existing.id, trier_product_id: trierId, trier_barcode: mapped.barcode, trier_name: mapped.name,
      last_synced_at: new Date().toISOString(), sync_status: "ok",
    }, { onConflict: "trier_product_id" });
    return { updated: true };
  } else {
    if (opts.onlyStock || opts.onlyPrice) return { skipped: true };
    const { data: ins, error } = await supabase.from("products").insert(mapped).select("id").single();
    if (error) return { failed: true, error: error.message };
    await supabase.from("trier_product_mappings").insert({
      product_id: ins.id, trier_product_id: trierId, trier_barcode: mapped.barcode, trier_name: mapped.name,
      last_synced_at: new Date().toISOString(), sync_status: "ok",
    });
    return { created: true };
  }
}

// ---------- ACTIONS ----------
async function actionTestConnection() {
  const s = await getSettings();
  try {
    await trierGet(s, "/rest/integracao/produto/obter-todos-v1?primeiroRegistro=0&quantidadeRegistros=1");
    await supabase.from("trier_settings").update({
      last_connection_test_at: new Date().toISOString(), last_connection_status: "ok",
    }).eq("id", 1);
    await log("connection", "success", "Conexão com Trier OK", { env: s.environment });
    return { ok: true };
  } catch (e: any) {
    await supabase.from("trier_settings").update({
      last_connection_test_at: new Date().toISOString(), last_connection_status: "error",
    }).eq("id", 1);
    await log("connection", "error", "Falha na conexão com Trier", { error: e.message });
    return { ok: false, error: e.message };
  }
}

async function actionSyncProducts(trigger = "manual", changed = false) {
  const s = await getSettings();
  const job = await startJob(changed ? "products_changed" : "products", trigger);
  let created = 0, updated = 0, failed = 0, ignored = 0;
  try {
    const ativo = "true";
    const ecom = s.ecommerce_filter_enabled ? "true" : "false";
    let list: any[];
    if (changed) {
      const since = s.last_sync_products_at || new Date(Date.now() - 7 * 86400000).toISOString();
      const dataInicial = since.slice(0, 10);
      const dataFinal = new Date().toISOString().slice(0, 10);
      list = await paginate(s, (o, q) =>
        `/rest/integracao/produto/obter-alterados-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}&dataInicial=${dataInicial}&dataFinal=${dataFinal}&integracaoEcommerce=${ecom}&processaCustoMedio=false`);
    } else {
      list = await paginate(s, (o, q) =>
        `/rest/integracao/produto/obter-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}&ativo=${ativo}&integracaoEcommerce=${ecom}&processaCustoMedio=false`);
    }
    for (const t of list) {
      const r = await upsertProductFromTrier(t);
      if (r.created) created++;
      else if (r.updated) updated++;
      else if (r.failed) failed++;
      else ignored++;
    }
    await supabase.from("trier_settings").update({ last_sync_products_at: new Date().toISOString() }).eq("id", 1);
    await finishJob(job.id, { status: "success", records_checked: list.length, records_created: created, records_updated: updated, records_failed: failed, records_ignored: ignored });
    await log("products", "success", `Produtos sincronizados: ${created} criados, ${updated} atualizados`, { changed });
    return { ok: true, total: list.length, created, updated, failed, ignored };
  } catch (e: any) {
    await finishJob(job.id, { status: "error", error_message: e.message, records_created: created, records_updated: updated, records_failed: failed });
    await log("products", "error", "Erro na sincronização de produtos", { error: e.message });
    return { ok: false, error: e.message };
  }
}

async function actionSyncCategories(trigger = "manual") {
  const s = await getSettings();
  const job = await startJob("categories", trigger);
  let created = 0, updated = 0, failed = 0;
  try {
    const list = await paginate(s, (o, q) => `/rest/integracao/categoria/obter-todos-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}`);
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
    await finishJob(job.id, { status: "error", error_message: e.message });
    return { ok: false, error: e.message };
  }
}

async function actionSyncStock(trigger = "manual") {
  const s = await getSettings();
  const job = await startJob("stock", trigger);
  let updated = 0, ignored = 0, failed = 0;
  try {
    const ecom = s.ecommerce_filter_enabled ? "true" : "false";
    const list = await paginate(s, (o, q) => `/rest/integracao/estoque/obter-todos-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}&integracaoEcommerce=${ecom}`);
    for (const t of list) {
      const r = await upsertProductFromTrier(t, { onlyStock: true });
      if (r.updated) updated++;
      else if (r.failed) failed++;
      else ignored++;
    }
    await supabase.from("trier_settings").update({ last_sync_stock_at: new Date().toISOString() }).eq("id", 1);
    await finishJob(job.id, { status: "success", records_checked: list.length, records_updated: updated, records_failed: failed, records_ignored: ignored });
    return { ok: true, total: list.length, updated, failed, ignored };
  } catch (e: any) {
    await finishJob(job.id, { status: "error", error_message: e.message });
    return { ok: false, error: e.message };
  }
}

async function actionSyncPrices(trigger = "manual") {
  const s = await getSettings();
  const job = await startJob("prices", trigger);
  let updated = 0, ignored = 0, failed = 0;
  try {
    const list = await paginate(s, (o, q) => `/rest/integracao/produto/precificacao/obter-todos-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}&removerRestricaoEstoque=true`);
    for (const t of list) {
      const r = await upsertProductFromTrier(t, { onlyPrice: true });
      if (r.updated) updated++;
      else if (r.failed) failed++;
      else ignored++;
    }
    await supabase.from("trier_settings").update({ last_sync_prices_at: new Date().toISOString() }).eq("id", 1);
    await finishJob(job.id, { status: "success", records_checked: list.length, records_updated: updated, records_failed: failed, records_ignored: ignored });
    return { ok: true, total: list.length, updated, failed, ignored };
  } catch (e: any) {
    await finishJob(job.id, { status: "error", error_message: e.message });
    return { ok: false, error: e.message };
  }
}

async function actionSyncDiscounts(trigger = "manual") {
  const s = await getSettings();
  const job = await startJob("discounts", trigger);
  let updated = 0, ignored = 0, failed = 0;
  try {
    const list = await paginate(s, (o, q) => `/rest/integracao/produto/desconto/melhor/obter-todos-v1?primeiroRegistro=${o}&quantidadeRegistros=${q}&removerRestricaoEstoque=true`);
    for (const t of list) {
      const r = await upsertProductFromTrier(t, { onlyPrice: true });
      if (r.updated) updated++;
      else if (r.failed) failed++;
      else ignored++;
    }
    await supabase.from("trier_settings").update({ last_sync_discounts_at: new Date().toISOString() }).eq("id", 1);
    await finishJob(job.id, { status: "success", records_checked: list.length, records_updated: updated, records_failed: failed, records_ignored: ignored });
    return { ok: true, total: list.length, updated, failed, ignored };
  } catch (e: any) {
    await finishJob(job.id, { status: "error", error_message: e.message });
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
    await supabase.from("orders").update({ trier_error_message: e.message }).eq("id", orderId);
    await log("order_send", "error", `Erro ao enviar pedido ${orderId}`, { error: e.message, order_id: orderId });
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
      await log("order_status", "error", "Erro consultando status", { error: e.message });
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
  const now = Date.now();
  const due = (last: string | null, mins: number) => !last || (now - new Date(last).getTime()) >= mins * 60000;
  const results: any = {};
  if (s.sync_stock_enabled && due(s.last_sync_stock_at, s.schedule_stock_minutes)) results.stock = await actionSyncStock("cron");
  if (s.sync_prices_enabled && due(s.last_sync_prices_at, s.schedule_prices_minutes)) results.prices = await actionSyncPrices("cron");
  if (s.sync_discounts_enabled && due(s.last_sync_discounts_at, s.schedule_discounts_minutes)) results.discounts = await actionSyncDiscounts("cron");
  if (s.sync_products_enabled && due(s.last_sync_products_at, s.schedule_products_minutes)) results.products = await actionSyncProducts("cron", true);
  return { ok: true, results };
}

async function actionTestProductsEndpoint() {
  const s = await getSettings();
  const endpoint = "/rest/integracao/produto/obter-todos-v1?primeiroRegistro=0&quantidadeRegistros=50";
  const finalUrl = buildUrl(s.base_url, endpoint);
  try {
    const r = await fetch(finalUrl, {
      headers: {
        Authorization: `Bearer ${s.bearer_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    const text = await r.text();
    const bodyPreview = text.slice(0, 1500);
    await log("api_call", r.ok ? "success" : "error", `Teste endpoint produtos → HTTP ${r.status}`, {
      baseUrl: s.base_url, endpoint, finalUrl, status: r.status, body: bodyPreview,
    });
    let count: number | null = null;
    try { const j = JSON.parse(text); count = extractList(j).length; } catch { /* ignore */ }
    return { ok: r.ok, status: r.status, baseUrl: s.base_url, endpoint, finalUrl, body: bodyPreview, count };
  } catch (e: any) {
    await log("api_call", "error", "Teste endpoint produtos falhou (network)", {
      baseUrl: s.base_url, endpoint, finalUrl, error: e.message,
    });
    return { ok: false, baseUrl: s.base_url, endpoint, finalUrl, error: e.message };
  }
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

    // Scheduled call from cron uses service key directly
    if (action !== "scheduled") {
      await requireAdmin(req);
    }

    let result: any;
    switch (action) {
      case "test-connection": result = await actionTestConnection(); break;
      case "test-products-endpoint": result = await actionTestProductsEndpoint(); break;
      case "preview-url": {
        const s = await getSettings();
        const endpoint = body.endpoint || "/rest/integracao/produto/obter-todos-v1?primeiroRegistro=0&quantidadeRegistros=50";
        result = { baseUrl: s.base_url, endpoint, finalUrl: buildUrl(s.base_url, endpoint) };
        break;
      }
      case "sync-products": result = await actionSyncProducts(trigger, !!body.changed); break;
      case "sync-categories": result = await actionSyncCategories(trigger); break;
      case "sync-stock": result = await actionSyncStock(trigger); break;
      case "sync-prices": result = await actionSyncPrices(trigger); break;
      case "sync-discounts": result = await actionSyncDiscounts(trigger); break;
      case "sync-all": result = await actionSyncAll(trigger); break;
      case "send-order": result = await actionSendOrder(body.order_id); break;
      case "check-order-status": result = await actionCheckOrderStatus(body.order_ids); break;
      case "update-order-status": result = await actionUpdateOrderStatus(body.order_id, body.status); break;
      case "scheduled": result = await actionScheduled(); break;
      default: return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
