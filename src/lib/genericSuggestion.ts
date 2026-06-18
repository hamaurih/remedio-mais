// Sugestão de genérico/similar mais barato
// - Manual: campo generic_equivalent_id no produto
// - Automático: outro produto com is_generic=true e mesmo active_ingredient
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/components/ProductCard";

export type GenericCandidate = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price: number;
  promo_price: number | null;
  stock: number;
  manufacturer: string | null;
  controlled: boolean;
  requires_prescription: boolean;
  has_variants: boolean | null;
};

export type GenericSuggestion = {
  original: { id: string; name: string; finalPrice: number };
  candidate: GenericCandidate;
  finalPrice: number;
  savings: number;
  pct: number; // 0..1
  source: "manual" | "auto";
};

const MIN_SAVINGS_PCT = 0.05;

export async function fetchGenericSuggestion(productId: string): Promise<GenericSuggestion | null> {
  const { data: p } = await supabase
    .from("products")
    .select("id,name,is_generic,controlled,active,price,promo_price,active_ingredient,generic_equivalent_id")
    .eq("id", productId)
    .maybeSingle();
  if (!p || (p as any).is_generic || (p as any).controlled) return null;

  const pp: any = p;
  let candidate: any = null;
  let source: "manual" | "auto" = "auto";

  if (pp.generic_equivalent_id) {
    const { data } = await supabase
      .from("products")
      .select("id,name,slug,image_url,price,promo_price,stock,manufacturer,controlled,requires_prescription,has_variants,active")
      .eq("id", pp.generic_equivalent_id)
      .maybeSingle();
    if (data && (data as any).active && (data as any).stock > 0) {
      candidate = data;
      source = "manual";
    }
  }

  if (!candidate && pp.active_ingredient) {
    const { data } = await supabase
      .from("products")
      .select("id,name,slug,image_url,price,promo_price,stock,manufacturer,controlled,requires_prescription,has_variants")
      .eq("is_generic", true)
      .eq("active", true)
      .gt("stock", 0)
      .ilike("active_ingredient", pp.active_ingredient.trim())
      .neq("id", pp.id)
      .limit(10);
    const list = (data || []) as any[];
    list.sort((a, b) => Number(a.promo_price ?? a.price) - Number(b.promo_price ?? b.price));
    candidate = list[0] || null;
  }

  if (!candidate) return null;

  const origFinal = Number(pp.promo_price ?? pp.price);
  const candFinal = Number(candidate.promo_price ?? candidate.price);
  if (!(origFinal > 0) || !(candFinal > 0) || candFinal >= origFinal) return null;
  const savings = origFinal - candFinal;
  const pct = savings / origFinal;
  if (pct < MIN_SAVINGS_PCT) return null;

  return {
    original: { id: pp.id, name: pp.name, finalPrice: origFinal },
    candidate: candidate as GenericCandidate,
    finalPrice: candFinal,
    savings,
    pct,
    source,
  };
}

// Event bus para abrir o modal a partir de qualquer ProductCard / Product page
const EVENT = "atacadao:generic-check";

export type OpenGenericCheckPayload = {
  product: Product;
  onAddOriginal: () => void;
};

export function openGenericCheck(payload: OpenGenericCheckPayload) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: payload }));
}

export function onGenericCheck(cb: (p: OpenGenericCheckPayload) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
