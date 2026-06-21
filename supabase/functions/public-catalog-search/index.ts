// Edge Function: public-catalog-search
// Consultada pelo agente WhatsApp. Autenticação via header x-agent-key.
// NUNCA expor preço de custo, margens, tokens, dados de cliente/pedidos/receitas.

import { createClient } from "npm:@supabase/supabase-js@2";
import { safeLog, safeError, maskToken } from "../_shared/mask.ts";

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

type Channel = "whatsapp" | "site" | "balcao" | "telefone";

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
  const promo = num(p.promo_price);

  if (channel === "whatsapp" || channel === "balcao" || channel === "telefone") {
    return waPromo ?? wa ?? sitePromo ?? site ?? promo ?? base;
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

// Detect numeric (barcode) terms
function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}

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
      count: 0,
      results: [],
      message: "Informe um termo de busca.",
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- Build search ---
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const barcode = digitsOnly(term);
  const orParts = [
    `name.ilike.${like}`,
    `manufacturer.ilike.${like}`,
    `active_ingredient.ilike.${like}`,
    `tags.ilike.${like}`,
  ];
  if (barcode.length >= 8) orParts.push(`barcode.eq.${barcode}`);

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, manufacturer, active_ingredient, image_url, short_description, " +
      "requires_prescription, controlled, stock, active, " +
      "price, price_base, site_price, whatsapp_price, site_promo_price, whatsapp_promo_price, " +
      "promo_price, ecommerce_price, discount_percentage, category_id, categories(name)",
    )
    .eq("active", true)
    .gt("stock", 0)
    .or(orParts.join(","))
    .limit(limit * 3); // over-fetch, we re-rank/filter

  if (error) {
    safeError("public-catalog-search query error", { msg: error.message });
    return json({ success: false, error: "query_failed" }, 500);
  }

  const lowerTerm = term.toLowerCase();
  const rows = (data || []).filter((p: any) => {
    const eff = effectivePrice(p, channel);
    return eff !== null && eff > 0;
  });

  function rank(p: any): number {
    const n = (p.name || "").toLowerCase();
    const m = (p.manufacturer || "").toLowerCase();
    const cat = (p.categories?.name || "").toLowerCase();
    const tg = (p.tags || "").toLowerCase();
    const ai = (p.active_ingredient || "").toLowerCase();
    if (barcode && barcode.length >= 8 && p.barcode === barcode) return 0;
    if (n.startsWith(lowerTerm)) return 1;
    if (n.includes(lowerTerm)) return 2;
    if (m.includes(lowerTerm)) return 3;
    if (cat.includes(lowerTerm)) return 4;
    if (tg.includes(lowerTerm) || ai.includes(lowerTerm)) return 5;
    return 9;
  }
  rows.sort((a: any, b: any) => rank(a) - rank(b));
  const top = rows.slice(0, limit);

  const results = top.map((p: any) => {
    const base = num(p.price_base) ?? num(p.price);
    const site = num(p.site_price) ?? num(p.ecommerce_price);
    const wa = num(p.whatsapp_price);
    const effective = effectivePrice(p, channel)!;
    const reference = base ?? site ?? wa ?? effective;
    const discount = reference && reference > effective
      ? Math.round((1 - effective / reference) * 100)
      : 0;
    const stock = Number(p.stock || 0);
    const available = stock > 0;
    const isWa = channel !== "site";

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
      effective_price: effective,
      price_label: isWa ? "Preço WhatsApp" : "Preço do site",
      promo_price: effective,
      discount_percentage: discount,
      stock,
      available,
      requires_prescription: !!p.requires_prescription,
      controlled: !!p.controlled,
      image_url: p.image_url || null,
      short_description: shortDesc(p, available),
    };
  });

  const message = results.length === 0
    ? "Nenhum produto encontrado com esse nome no catálogo disponível."
    : (results.some((r) => r.requires_prescription || r.controlled)
        ? "Produtos encontrados. Há itens sujeitos à apresentação de receita."
        : "Produtos encontrados.");

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
    count: results.length,
    results,
    message,
  });
});
