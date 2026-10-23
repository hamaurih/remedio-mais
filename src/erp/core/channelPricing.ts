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

function pick(
  values: Array<[PriceSource, number | null]>,
): { source: PriceSource; value: number } {
  for (const [source, value] of values) {
    if (value !== null) return { source, value };
  }
  return { source: "price", value: 0 };
}

export function resolveChannelPrice(
  input: ChannelPriceInput,
  channel: SalesChannel,
  now: number = Date.now(),
): ChannelPriceSnapshot {
  const promoAllowed = promotionActive(input, now);
  const base = positive(input.price_base) ?? positive(input.price);
  const genericPromo = promoAllowed ? positive(input.promo_price) : null;

  let resolved: { source: PriceSource; value: number };

  if (channel === "site" || channel === "marketplace" || channel === "b2b") {
    // Compatibilidade inicial com o site atual (resolveSitePrice):
    // site_promo_price -> promo_price -> site_price -> price.
    // price_base fica fora deste canal durante o shadow/cutover para não
    // introduzir alteração comercial silenciosa.
    resolved = pick([
      ["site_promo_price", promoAllowed ? positive(input.site_promo_price) : null],
      ["promo_price", genericPromo],
      ["site_price", positive(input.site_price)],
      ["price", positive(input.price)],
    ]);
  } else if (channel === "whatsapp_ia" || channel === "whatsapp_humano" || channel === "telefone") {
    resolved = pick([
      ["whatsapp_promo_price", promoAllowed ? positive(input.whatsapp_promo_price) : null],
      ["whatsapp_price", positive(input.whatsapp_price)],
      ["promo_price", genericPromo],
      ["price_base", positive(input.price_base)],
      ["price", positive(input.price)],
    ]);
  } else {
    resolved = pick([
      ["pdv_promo_price", promoAllowed ? positive(input.pdv_promo_price) : null],
      ["pdv_price", positive(input.pdv_price)],
      ["promo_price", genericPromo],
      ["price_base", positive(input.price_base)],
      ["price", positive(input.price)],
    ]);
  }

  const comparePrice = base !== null && base > resolved.value ? base : null;
  const discountPercent = comparePrice && resolved.value > 0
    ? Math.round((1 - resolved.value / comparePrice) * 100)
    : 0;

  return {
    channel,
    finalPrice: resolved.value,
    comparePrice,
    discountPercent,
    source: resolved.source,
    calculatedAt: new Date(now).toISOString(),
  };
}
