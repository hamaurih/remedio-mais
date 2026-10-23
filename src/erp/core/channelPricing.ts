import type {
  ChannelPriceInput,
  ChannelPriceSnapshot,
  PriceSource,
  SalesChannel,
} from "./contracts";

function positive(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function promotionActive(input: ChannelPriceInput, now: number) {
  const start = input.promotion_start ? new Date(input.promotion_start).getTime() : null;
  const end = input.promotion_end ? new Date(input.promotion_end).getTime() : null;
  if (start !== null && Number.isFinite(start) && start > now) return false;
  if (end !== null && Number.isFinite(end) && end < now) return false;
  return true;
}

function result(
  channel: SalesChannel,
  finalPrice: number,
  comparePrice: number | null,
  source: PriceSource,
  now: number,
): ChannelPriceSnapshot {
  const validCompare = comparePrice !== null && comparePrice > finalPrice && finalPrice > 0
    ? comparePrice
    : null;
  return {
    channel,
    finalPrice,
    comparePrice: validCompare,
    discountPercent: validCompare
      ? Math.round((1 - finalPrice / validCompare) * 100)
      : 0,
    source,
    calculatedAt: new Date(now).toISOString(),
  };
}

/**
 * Compatibilidade de cutover:
 * cada canal reproduz primeiro a regra que já está em produção.
 * Só alteraremos precedências comerciais em uma fase posterior e explícita.
 */
export function resolveChannelPrice(
  input: ChannelPriceInput,
  channel: SalesChannel,
  now: number = Date.now(),
): ChannelPriceSnapshot {
  const windowActive = promotionActive(input, now);
  const rawPrice = positive(input.price);
  const base = positive(input.price_base) ?? rawPrice;

  if (channel === "site" || channel === "marketplace" || channel === "b2b") {
    // Site atual (src/lib/pricing.ts):
    // site_promo_price -> promo_price -> site_price -> price
    const sitePrice = positive(input.site_price);
    const compare = sitePrice ?? rawPrice;
    const sitePromo = windowActive ? positive(input.site_promo_price) : null;
    if (sitePromo !== null) return result(channel, sitePromo, compare, "site_promo_price", now);

    const genericPromo = windowActive ? positive(input.promo_price) : null;
    if (genericPromo !== null) return result(channel, genericPromo, compare, "promo_price", now);

    if (sitePrice !== null) return result(channel, sitePrice, null, "site_price", now);
    return result(channel, rawPrice ?? 0, null, "price", now);
  }

  if (channel === "whatsapp_ia" || channel === "whatsapp_humano" || channel === "telefone") {
    // Catálogo WhatsApp atual (public-catalog-search):
    // whatsapp_promo_price -> whatsapp_price -> promo_price -> price_base -> price.
    // O legado ainda não usa janela promocional neste canal; preservar no shadow.
    const waPromo = positive(input.whatsapp_promo_price);
    if (waPromo !== null) return result(channel, waPromo, base, "whatsapp_promo_price", now);

    const waPrice = positive(input.whatsapp_price);
    if (waPrice !== null) return result(channel, waPrice, base, "whatsapp_price", now);

    const genericPromo = positive(input.promo_price);
    if (genericPromo !== null) return result(channel, genericPromo, base, "promo_price", now);

    if (positive(input.price_base) !== null) return result(channel, positive(input.price_base)!, null, "price_base", now);
    return result(channel, rawPrice ?? 0, null, "price", now);
  }

  // PDV atual (src/lib/pos.ts):
  // base = pdv_price > 0 ? pdv_price : price;
  // promoção = pdv_promo_price ?? promo_price, somente se < base e janela válida.
  const pdvPrice = positive(input.pdv_price);
  const pdvBase = pdvPrice ?? rawPrice ?? 0;
  const promoCandidate = positive(input.pdv_promo_price) ?? positive(input.promo_price);
  if (
    windowActive &&
    promoCandidate !== null &&
    pdvBase > 0 &&
    promoCandidate < pdvBase
  ) {
    const source: PriceSource = positive(input.pdv_promo_price) !== null
      ? "pdv_promo_price"
      : "promo_price";
    return result(channel, promoCandidate, pdvBase, source, now);
  }

  if (pdvPrice !== null) return result(channel, pdvPrice, null, "pdv_price", now);
  return result(channel, rawPrice ?? 0, null, "price", now);
}
