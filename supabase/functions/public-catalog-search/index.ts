// Edge Function: public-catalog-search
// Consultada pelo agente WhatsApp. Autenticação via header x-agent-key.
// NUNCA expor preço de custo, margens, tokens, dados de cliente/pedidos/receitas.

import { createClient } from "npm:@supabase/supabase-js@2";
import { safeLog, safeError, maskToken } from "../_shared/mask.ts";
import {
  STOCK_DISCLAIMER,
  STOCK_SOURCE,
  buildCatalogPlans,
  buildPostgrestFilter,
  catalogEnvelopeMessage,
  scoreCatalogProduct,
  selectCatalogHits,
  stockSystemMessage,
  type CatalogHit,
} from "../_shared/catalog-search.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Channel = "whatsapp" | "ia" | "site" | "balcao" | "pdv" | "telefone";

interface AgentBody {
  mensagem?: string;
  query?: string;
  channel?: Channel | string;
  limit?: number;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}

function effectivePrice(p: any, channel: string) {
  const base = num(p.price_base) ?? num(p.price);
  const sitePromo = num(p.site_promo_price);
  const site = num(p.site_price) ?? num(p.ecommerce_price);
  const waPromo = num(p.whatsapp_promo_price);
  const wa = num(p.whatsapp_price);
  const pdvPromo = num(p.pdv_promo_price);
  const pdv = num(p.pdv_price);
  const promo = num(p.promo_price);

  if (channel === "whatsapp" || channel === "ia" || channel === "telefone") {
    return waPromo ?? wa ?? promo ?? base;
  }
  if (channel === "balcao" || channel === "pdv") {
    return pdvPromo ?? pdv ?? promo ?? base;
  }
  return sitePromo ?? site ?? promo ?? base;
}

function shortDesc(p: any, available: boolean): string {
  if (p.requires_prescription || p.controlled) {
    return "Produto sujeito à apresentação e análise de receita.";
  }
  if (!available) return "Produto temporariamente indisponível.";
  if (p.short_description && String(p.short_description).trim()) {
    return String(p.short_description).trim().slice(0, 240);
  }
  return "Produto disponível para venda assistida pelo WhatsApp.";
}

const PRODUCT_COLUMNS =
  "id, name, slug, manufacturer, active_ingredient, tags, barcode, image_url, short_description, " +
  "requires_prescription, controlled, stock, active, " +
  "price, price_base, site_price, whatsapp_price, pdv_price, site_promo_price, whatsapp_promo_price, pdv_promo_price, " +
  "promo_price, ecommerce_price, discount_percentage, category_id, categories(name)";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  // --- Auth ---
  const provided = req.headers.get("x-agent-key") || "";
  const expected = Deno.env.get("WHATSAPP_AGENT_API_KEY") || "";
  if (!expected) {
    safeError("public-catalog-search: missing WHATSAPP_AGENT_API_KEY secret");
    return json({ success: false, error: "server_misconfigured" }, 500);
  }
  if (!provided || provided !== expected) {
    safeLog("public-catalog-search auth fail", { hint: maskToken(provided) });
    return json({ success: false, error: "unauthorized" }, 401);
  }

  // --- Parse body ---
  let body: AgentBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const channel: string = (body.channel || "whatsapp").toString().toLowerCase();
  const rawQuery = (body.query?.toString() || "").trim();
  const rawMsg = (body.mensagem?.toString() || "").trim();
  const term = (rawQuery || rawMsg).slice(0, 120);
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 20);

  if (!term) {
    return json({
      success: true,
      channel,
      query: "",
      queries: [],
      count: 0,
      results: [],
      stock_source: STOCK_SOURCE,
      stock_disclaimer: STOCK_DISCLAIMER,
      message: "Informe um termo de busca.",
    });
  }

  const plans = buildCatalogPlans(term);
  if (plans.length === 0) {
    return json({
      success: true,
      channel,
      query: term,
      queries: [],
      count: 0,
      results: [],
      stock_source: STOCK_SOURCE,
      stock_disclaimer: STOCK_DISCLAIMER,
      message: catalogEnvelopeMessage(0, false),
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const batches = await Promise.all(plans.map(async (plan) => {
    const filter = buildPostgrestFilter(plan);
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("active", true)
      .gt("stock", 0)
      .or(filter)
      .order("name", { ascending: true })
      .limit(60);
    return { plan, data, error };
  }));

  const okBatches = batches.filter((batch) => !batch.error);
  const failed = batches.find((batch) => batch.error);
  if (okBatches.length === 0 && failed?.error) {
    safeError("public-catalog-search query error", { msg: failed.error.message });
    return json({ success: false, error: "query_failed" }, 500);
  }
  if (failed?.error) {
    safeError("public-catalog-search partial query error", { msg: failed.error.message });
  }

  const hits: CatalogHit<any>[] = [];
  for (const batch of okBatches) {
    for (const row of batch.data || []) {
      const score = scoreCatalogProduct({
        name: row.name,
        manufacturer: row.manufacturer,
        active_ingredient: row.active_ingredient,
        tags: row.tags,
        barcode: row.barcode,
      }, batch.plan);
      if (score === null) continue;
      const eff = effectivePrice(row, channel);
      if (eff === null || eff <= 0) continue;
      hits.push({
        id: String(row.id),
        itemIndex: batch.plan.itemIndex,
        planKind: batch.plan.kind,
        aliasKey: batch.plan.text,
        score,
        row,
      });
    }
  }

  const top = selectCatalogHits(hits, limit).map((hit) => hit.row);

  const results = top.map((p: any) => {
    const base = num(p.price_base) ?? num(p.price);
    const site = num(p.site_price) ?? num(p.ecommerce_price);
    const wa = num(p.whatsapp_price);
    const pdv = num(p.pdv_price);
    const effective = effectivePrice(p, channel)!;
    const reference = base ?? site ?? wa ?? effective;
    const discount = reference && reference > effective
      ? Math.round((1 - effective / reference) * 100)
      : 0;
    const stock = Number(p.stock || 0);
    const available = stock > 0;
    const priceLabel = channel === "site"
      ? "Preço do site"
      : (channel === "balcao" || channel === "pdv")
        ? "Preço do balcão"
        : "Preço IA/WhatsApp";

    return {
      id: p.id,
      name: p.name,
      brand: p.manufacturer || null,
      laboratory: p.manufacturer || null,
      category: p.categories?.name || null,
      subcategory: null,
      base_price: base,
      site_price: site,
      whatsapp_price: wa,
      pdv_price: pdv,
      effective_price: effective,
      price_label: priceLabel,
      promo_price: effective,
      discount_percentage: discount,
      stock,
      available,
      stock_source: STOCK_SOURCE,
      stock_message: stockSystemMessage(stock),
      requires_prescription: !!p.requires_prescription,
      controlled: !!p.controlled,
      image_url: p.image_url || null,
      short_description: shortDesc(p, available),
    };
  });

  const literalQueries = plans.filter((plan) => plan.kind === "literal").map((plan) => plan.text);
  const message = catalogEnvelopeMessage(
    results.length,
    results.some((r) => r.requires_prescription || r.controlled),
  );

  safeLog("public-catalog-search", {
    source: "whatsapp_agent",
    channel,
    query_len: term.length,
    count: results.length,
    status: "ok",
  });

  return json({
    success: true,
    channel,
    query: term,
    queries: literalQueries,
    count: results.length,
    results,
    stock_source: STOCK_SOURCE,
    stock_disclaimer: STOCK_DISCLAIMER,
    message,
  });
});
