import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TRIER_BASE = "https://api-sgf-gateway.triersistemas.com.br/sgfpod1";
const TRIER_TOKEN = Deno.env.get("TRIER_API_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const slugify = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function mapProduct(t: any) {
  const ativo = t.ativo ?? true;
  const ecom = t.integracaoEcommerce ?? false;
  const price = Number(t.valorVenda ?? 0);
  const promo = t.valorVendaEcommerce != null && Number(t.valorVendaEcommerce) < price
    ? Number(t.valorVendaEcommerce) : null;
  return {
    trier_product_id: String(t.codigo ?? t.id ?? ""),
    name: t.nomeEcommerce || t.nome || "Sem nome",
    ecommerce_name: t.nomeEcommerce ?? null,
    slug: slugify(t.nomeEcommerce || t.nome || String(t.codigo)),
    description: t.descricaoEcommerce ?? null,
    barcode: t.codigoBarras ?? null,
    laboratory_code: t.codigoLaboratorio ?? null,
    laboratory: t.nomeLaboratorio ?? null,
    manufacturer: t.nomeLaboratorio ?? null,
    group_code: t.codigoGrupo ?? null,
    group_name: t.nomeGrupo ?? null,
    category_external_id: t.codigoCategoria ?? null,
    category_name: t.nomeCategoria ?? null,
    department_external_id: t.codigoDepartamento ?? null,
    department_name: t.nomeDepartamento ?? null,
    active_ingredient_code: t.codigoPrincipioAtivo ?? null,
    active_ingredient: t.nomePrincipioAtivo ?? null,
    price,
    ecommerce_price: t.valorVendaEcommerce != null ? Number(t.valorVendaEcommerce) : null,
    promo_price: promo,
    on_sale: promo != null,
    stock: Number(t.quantidadeEstoqueEcommerce ?? t.quantidadeEstoque ?? 0),
    stock_quantity: t.quantidadeEstoque != null ? Number(t.quantidadeEstoque) : null,
    ecommerce_stock_quantity: t.quantidadeEstoqueEcommerce != null ? Number(t.quantidadeEstoqueEcommerce) : null,
    is_active: ativo,
    ecommerce_enabled: ecom,
    active: ativo && ecom,
    max_discount_percentage: t.percentualDescontoMax != null ? Number(t.percentualDescontoMax) : null,
    sale_observation: t.observacaoVenda ?? null,
    medicine_list_type: t.tipoLista ?? null,
    tarja: t.tipoLista ?? null,
    tags: Array.isArray(t.tags) ? t.tags.join(",") : (t.tags ?? null),
    cart_quantity_limit: t.qtdLimiteCarrinhoEcommerce != null ? Number(t.qtdLimiteCarrinhoEcommerce) : null,
    requires_prescription: ["VERMELHA", "PRETA", "vermelha", "preta"].includes(t.tipoLista),
    last_synced_at: new Date().toISOString(),
  };
}

async function fetchAllProducts(): Promise<any[]> {
  const tried: { url: string; status: number; sample: string }[] = [];
  const endpoints = [
    "/produto?integracaoEcommerce=true&ativo=true",
    "/produtos?integracaoEcommerce=true&ativo=true",
    "/produto",
    "/produtos",
  ];
  for (const ep of endpoints) {
    const url = `${TRIER_BASE}${ep}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${TRIER_TOKEN}`, Accept: "application/json" } });
      const text = await r.text();
      tried.push({ url, status: r.status, sample: text.slice(0, 200) });
      if (!r.ok) continue;
      const json = JSON.parse(text);
      const list = Array.isArray(json) ? json : (json.content || json.data || json.items || json.produtos || []);
      if (Array.isArray(list) && list.length >= 0) return list;
    } catch (e) {
      tried.push({ url, status: 0, sample: String(e) });
    }
  }
  throw new Error("Não foi possível obter produtos do Trier. Tentativas: " + JSON.stringify(tried));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const trigger = new URL(req.url).searchParams.get("trigger") || "manual";

  const { data: log } = await supabase.from("trier_sync_logs")
    .insert({ trigger, status: "running" }).select().single();

  try {
    if (!TRIER_TOKEN) throw new Error("TRIER_API_TOKEN não configurado");

    const raw = await fetchAllProducts();
    const filtered = raw.filter((p: any) => (p.integracaoEcommerce ?? false) && (p.ativo ?? false));

    let created = 0, updated = 0, skipped = 0;
    for (const t of filtered) {
      const mapped = mapProduct(t);
      if (!mapped.trier_product_id) { skipped++; continue; }

      const { data: existing } = await supabase.from("products")
        .select("id").eq("trier_product_id", mapped.trier_product_id).maybeSingle();

      if (existing) {
        const { error } = await supabase.from("products").update(mapped).eq("id", existing.id);
        if (error) { skipped++; continue; }
        updated++;
      } else {
        const { error } = await supabase.from("products").insert(mapped);
        if (error) { skipped++; continue; }
        created++;
      }
    }

    await supabase.from("trier_sync_logs").update({
      status: "success", finished_at: new Date().toISOString(),
      items_fetched: raw.length, items_created: created, items_updated: updated, items_skipped: skipped,
    }).eq("id", log!.id);

    return new Response(JSON.stringify({ ok: true, fetched: raw.length, created, updated, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await supabase.from("trier_sync_logs").update({
      status: "error", finished_at: new Date().toISOString(), error_message: String(e?.message || e),
    }).eq("id", log!.id);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
