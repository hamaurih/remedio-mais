/**
 * Resolução única de preço do canal site.
 *
 * Todas as telas públicas (vitrine, página do produto, quick view, carrinho e
 * checkout) devem usar `resolveSitePrice` para que o preço exibido seja
 * exatamente o preço adicionado ao carrinho e cobrado no pedido.
 *
 * Prioridade (somente valores > 0):
 *  1) site_promo_price, se a promoção estiver vigente;
 *  2) promo_price, se a promoção estiver vigente;
 *  3) site_price;
 *  4) price.
 *
 * `discount_percentage` é informativo e nunca gera preço.
 */

export type PricingSource = {
  price?: number | string | null;
  promo_price?: number | string | null;
  site_price?: number | string | null;
  site_promo_price?: number | string | null;
  promotion_start?: string | null;
  promotion_end?: string | null;
};

/** Sobrescrita de variação: substitui o preço base do produto. */
export type PricingOverride = {
  price?: number | string | null;
  promo_price?: number | string | null;
};

export type ResolvedPrice = {
  /** Preço final que deve ser exibido, adicionado ao carrinho e cobrado. */
  finalPrice: number;
  /** Preço de referência (riscado) quando existe desconto real. */
  comparePrice: number | null;
  hasDiscount: boolean;
  /** Percentual arredondado do desconto (0 quando não há desconto). */
  discountPercent: number;
  source: "site_promo_price" | "promo_price" | "site_price" | "price" | "override_promo" | "override_price";
};

function positive(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Promoção vigente considerando janelas opcionais de início/fim. */
export function isPromotionWindowActive(p: PricingSource, now: number = Date.now()): boolean {
  const start = p?.promotion_start ? new Date(p.promotion_start).getTime() : null;
  const end = p?.promotion_end ? new Date(p.promotion_end).getTime() : null;
  if (start !== null && Number.isFinite(start) && start > now) return false;
  if (end !== null && Number.isFinite(end) && end < now) return false;
  return true;
}

export function resolveSitePrice(
  p: PricingSource,
  override?: PricingOverride | null,
  now: number = Date.now(),
): ResolvedPrice {
  const promotionActive = isPromotionWindowActive(p, now);

  const overrideBase = positive(override?.price);
  const overridePromo = positive(override?.promo_price);

  let finalPrice: number;
  let base: number | null;
  let source: ResolvedPrice["source"];

  if (overrideBase !== null || overridePromo !== null) {
    // Variação selecionada: os preços da variação mandam.
    base = overrideBase ?? positive(p.site_price) ?? positive(p.price);
    if (overridePromo !== null && promotionActive) {
      finalPrice = overridePromo;
      source = "override_promo";
    } else {
      finalPrice = base ?? overridePromo ?? 0;
      source = "override_price";
    }
  } else {
    const sitePromo = positive(p.site_promo_price);
    const promo = positive(p.promo_price);
    const sitePrice = positive(p.site_price);
    const price = positive(p.price);
    base = sitePrice ?? price;

    if (promotionActive && sitePromo !== null) {
      finalPrice = sitePromo;
      source = "site_promo_price";
    } else if (promotionActive && promo !== null) {
      finalPrice = promo;
      source = "promo_price";
    } else if (sitePrice !== null) {
      finalPrice = sitePrice;
      source = "site_price";
    } else {
      finalPrice = price ?? 0;
      source = "price";
    }
  }

  const comparePrice = base !== null && base > finalPrice ? base : null;
  const hasDiscount = comparePrice !== null && finalPrice > 0;
  const discountPercent = hasDiscount ? Math.round((1 - finalPrice / comparePrice!) * 100) : 0;

  return { finalPrice, comparePrice: hasDiscount ? comparePrice : null, hasDiscount, discountPercent, source };
}
