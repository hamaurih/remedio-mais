import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/productSelect";
import type { Product } from "@/components/ProductCard";

const sb = supabase as any;

export type CollectionTheme = "yellow" | "red" | "blue" | "green" | "neutral";
export type CollectionMode = "auto" | "manual" | "hybrid";

export interface CollectionDef {
  /** slug usado na rota pública e como shelf_key na curadoria manual */
  slug: string;
  /** rota pública canônica */
  route: string;
  title: string;
  description: string;
  theme: CollectionTheme;
  mode: CollectionMode;
  /** quantidade máxima exibida */
  limit: number;
  order: number;
  active: boolean;
}

/**
 * Coleções comerciais. Reutilizam estruturas já existentes:
 * - curadoria manual: tabela `home_shelf_items` (shelf_key = slug)
 * - marcação por produto: coluna `products.shelves`
 * - campanhas: tabelas `campaigns` / `campaign_products`
 * Coleção comercial NÃO é categoria: a taxonomia de medicamentos não é alterada.
 */
export const COLLECTIONS: CollectionDef[] = [
  { slug: "ofertas-da-semana", route: "/ofertas", title: "Ofertas da Semana", description: "Promoções por tempo limitado", theme: "red", mode: "hybrid", limit: 60, order: 1, active: true },
  { slug: "melhores-ofertas", route: "/melhores-ofertas", title: "Melhores Ofertas", description: "Os maiores descontos da loja", theme: "yellow", mode: "hybrid", limit: 60, order: 2, active: true },
  { slug: "medicamentos-populares", route: "/medicamentos-populares", title: "Medicamentos Populares", description: "Os medicamentos mais procurados", theme: "neutral", mode: "hybrid", limit: 60, order: 3, active: true },
  { slug: "mais-vendidos", route: "/mais-vendidos", title: "Mais Vendidos", description: "Ranking por unidades realmente vendidas", theme: "neutral", mode: "auto", limit: 60, order: 4, active: true },
  { slug: "novidades", route: "/novidades", title: "Novidades", description: "Produtos que chegaram recentemente", theme: "blue", mode: "hybrid", limit: 60, order: 5, active: true },
  { slug: "preco-reduzido", route: "/preco-reduzido", title: "Preço Reduzido", description: "Produtos com preço menor que o normal", theme: "green", mode: "hybrid", limit: 60, order: 6, active: true },
  { slug: "genericos-em-oferta", route: "/genericos-em-oferta", title: "Genéricos em Oferta", description: "Mesmo princípio ativo, preço menor", theme: "green", mode: "hybrid", limit: 60, order: 7, active: true },
];

export function getCollection(slug?: string): CollectionDef | undefined {
  if (!slug) return undefined;
  return COLLECTIONS.find((c) => c.slug === slug || c.route === `/${slug}`);
}

export function collectionRoute(slug: string): string {
  return getCollection(slug)?.route ?? `/colecao/${slug}`;
}

/** Filtro base de vendabilidade: ativo, com estoque e com preço. */
function vendable(q: any) {
  return q.eq("active", true).gt("stock", 0).gt("price", 0).is("archived_at", null);
}

function isVendable(p: any) {
  return !!p && p.active === true && Number(p.stock ?? 0) > 0 && Number(p.price ?? 0) > 0;
}

/** Desconto efetivo em % (0 quando não há oferta real). */
export function discountPercentage(p: any): number {
  const price = Number(p?.price ?? 0);
  const promo = p?.promo_price != null ? Number(p.promo_price) : null;
  if (!price || promo == null || promo <= 0 || promo >= price) return 0;
  return ((price - promo) / price) * 100;
}

/** Valor economizado em reais (0 quando não há oferta real). */
export function economyAmount(p: any): number {
  const price = Number(p?.price ?? 0);
  const promo = p?.promo_price != null ? Number(p.promo_price) : null;
  if (!price || promo == null || promo <= 0 || promo >= price) return 0;
  return price - promo;
}

/** Oferta comercial vigente (não confundir com simples redução de preço). */
export function hasActiveOffer(p: any): boolean {
  const now = Date.now();
  const startOk = !p?.promotion_start || new Date(p.promotion_start).getTime() <= now;
  const endOk = !p?.promotion_end || new Date(p.promotion_end).getTime() >= now;
  if (!startOk || !endOk) return false;
  if (p?.on_sale === true) return true;
  return discountPercentage(p) > 0;
}

/** Curadoria manual (Admin > Vitrines da Home) para a coleção. */
export async function fetchManualCollection(slug: string): Promise<Product[]> {
  const { data } = await sb
    .from("home_shelf_items")
    .select(`position, products:product_id(${PUBLIC_PRODUCT_SELECT})`)
    .eq("shelf_key", slug)
    .order("position");
  return ((data || []) as any[]).map((r) => r.products).filter(isVendable) as Product[];
}

/** Produtos de campanhas ativas e publicadas. */
async function fetchCampaignProducts(limit: number): Promise<Product[]> {
  const nowIso = new Date().toISOString();
  const { data: camps } = await sb
    .from("campaigns")
    .select("id")
    .eq("active", true)
    .eq("published", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`);
  const ids = ((camps || []) as any[]).map((c) => c.id);
  if (ids.length === 0) return [];
  const { data } = await sb
    .from("campaign_products")
    .select(`position, products:product_id(${PUBLIC_PRODUCT_SELECT})`)
    .in("campaign_id", ids)
    .order("position")
    .limit(limit);
  return ((data || []) as any[]).map((r) => r.products).filter(isVendable) as Product[];
}

async function fetchTagged(slug: string, limit: number): Promise<Product[]> {
  const { data } = await vendable(sb.from("products").select(PUBLIC_PRODUCT_SELECT))
    .contains("shelves", [slug])
    .limit(limit);
  return ((data || []) as any[]) as Product[];
}

/** Ranking real de vendas via função do banco (unidades vendidas). */
export async function fetchBestsellers(days = 30, limit = 12): Promise<Product[]> {
  const rpc = await sb.rpc("public_bestseller_product_ids", { _days: days, _limit: limit });
  if (rpc.error) return [];

  const rank = (rpc.data || []) as any[];
  const ids = rank.map((r) => r.product_id);
  if (ids.length === 0) return [];
  const { data } = await vendable(sb.from("products").select(PUBLIC_PRODUCT_SELECT)).in("id", ids);
  const byId = new Map(((data || []) as any[]).map((p) => [p.id, p]));
  // preserva a ordem do ranking, ocultando apenas os não vendáveis no momento
  return ids.map((id: string) => byId.get(id)).filter(Boolean).slice(0, limit) as Product[];
}

function dedupe(list: Product[]): Product[] {
  const seen = new Set<string>();
  return list.filter((p: any) => (p?.id && !seen.has(p.id) ? (seen.add(p.id), true) : false));
}

/**
 * Resolve os produtos de uma coleção comercial (modo híbrido:
 * fixados manualmente primeiro, completando automaticamente).
 */
export async function fetchCollectionProducts(
  slug: string,
  opts: { limit?: number; bestsellerDays?: number; autoPriceDrop?: boolean } = {},
): Promise<Product[]> {
  const def = getCollection(slug);
  const limit = opts.limit ?? def?.limit ?? 24;
  const manual = def?.mode === "auto" ? [] : await fetchManualCollection(slug);
  if (def?.mode === "manual") return manual.slice(0, limit);

  let auto: Product[] = [];

  if (slug === "mais-vendidos") {
    auto = await fetchBestsellers(opts.bestsellerDays ?? 30, limit);
  } else if (slug === "ofertas-da-semana" || slug === "melhores-ofertas" || slug === "preco-reduzido" || slug === "genericos-em-oferta") {
    const tagged = await fetchTagged(slug, limit * 2);
    const campaign = await fetchCampaignProducts(limit);
    let pool = dedupe([...tagged, ...campaign]);

    const needsAuto = slug !== "preco-reduzido" ? opts.autoPriceDrop !== false : true;
    if (pool.length < limit && needsAuto) {
      const { data } = await vendable(sb.from("products").select(PUBLIC_PRODUCT_SELECT))
        .not("promo_price", "is", null)
        .limit(240);
      pool = dedupe([...pool, ...((data || []) as Product[])]);
    }

    let eligible = pool.filter((p: any) => isVendable(p) && hasActiveOffer(p) && discountPercentage(p) > 0);
    if (slug === "genericos-em-oferta") eligible = eligible.filter((p: any) => p.is_generic === true);

    eligible.sort((a: any, b: any) => {
      const d = discountPercentage(b) - discountPercentage(a);
      if (d !== 0) return d;
      return economyAmount(b) - economyAmount(a);
    });
    auto = eligible;
  } else if (slug === "novidades") {
    const { data } = await vendable(sb.from("products").select(PUBLIC_PRODUCT_SELECT))
      .order("created_at", { ascending: false })
      .limit(limit);
    auto = (data || []) as Product[];
  } else if (slug === "medicamentos-populares") {
    // ranking real restrito a medicamentos; sem cair no catálogo geral
    const best = await fetchBestsellers(opts.bestsellerDays ?? 90, limit * 2);
    const meds = best.filter((p: any) =>
      (p.category_name || "").toLowerCase().includes("medicament") ||
      (p.department_name || "").toLowerCase().includes("medicament") ||
      !!p.medicine_list_type || !!p.active_ingredient,
    );
    auto = meds.length > 0 ? meds : await fetchTagged(slug, limit);
  } else {
    auto = await fetchTagged(slug, limit);
  }

  return dedupe([...manual, ...auto]).slice(0, limit);
}
