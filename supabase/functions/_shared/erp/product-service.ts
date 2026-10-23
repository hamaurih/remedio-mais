export type ErpReadChannel =
  | "site"
  | "pdv"
  | "whatsapp_ia"
  | "whatsapp_humano"
  | "telefone"
  | "b2b"
  | "marketplace";

export type ProductRow = {
  id: string;
  name: string;
  slug?: string | null;
  sku?: string | null;
  barcode?: string | null;
  trier_product_id?: string | null;
  manufacturer?: string | null;
  laboratory?: string | null;
  active?: boolean | null;
  requires_prescription?: boolean | null;
  controlled?: boolean | null;

  price?: number | string | null;
  price_base?: number | string | null;
  ecommerce_price?: number | string | null;
  promo_price?: number | string | null;
  site_price?: number | string | null;
  site_promo_price?: number | string | null;
  whatsapp_price?: number | string | null;
  whatsapp_promo_price?: number | string | null;
  pdv_price?: number | string | null;
  pdv_promo_price?: number | string | null;
  promotion_start?: string | null;
  promotion_end?: string | null;

  stock?: number | string | null;
  stock_quantity?: number | string | null;
  trier_stock_quantity?: number | string | null;
  last_stock_sync_at?: string | null;
  trier_active?: boolean | null;
  manual_disabled?: boolean | null;
  archived_at?: string | null;
  force_active?: boolean | null;
};

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value: unknown): number | null {
  const n = numberOrNull(value);
  return n !== null && n > 0 ? n : null;
}

function promotionActive(row: ProductRow, now: number) {
  const start = row.promotion_start ? new Date(row.promotion_start).getTime() : null;
  const end = row.promotion_end ? new Date(row.promotion_end).getTime() : null;
  if (start !== null && Number.isFinite(start) && start > now) return false;
  if (end !== null && Number.isFinite(end) && end < now) return false;
  return true;
}

function normalizeChannel(value: string): ErpReadChannel {
  const c = value.trim().toLowerCase();
  if (c === "pdv" || c === "balcao") return "pdv";
  if (c === "whatsapp" || c === "ia" || c === "whatsapp_ia") return "whatsapp_ia";
  if (c === "whatsapp_humano") return "whatsapp_humano";
  if (c === "telefone") return "telefone";
  if (c === "b2b") return "b2b";
  if (c === "marketplace") return "marketplace";
  return "site";
}

export function resolveReadPrice(row: ProductRow, channelInput: string, now = Date.now()) {
  const channel = normalizeChannel(channelInput);
  const activePromo = promotionActive(row, now);
  const rawPrice = positive(row.price);
  const base = positive(row.price_base) ?? rawPrice;

  if (channel === "site" || channel === "b2b" || channel === "marketplace") {
    // Regra atual do site. site_price/site_promo_price são CAMPOS MANUAIS e
    // nunca são preenchidos/sobrescritos pelo Trier neste serviço.
    const site = positive(row.site_price);
    const compare = site ?? rawPrice;
    const sitePromo = activePromo ? positive(row.site_promo_price) : null;
    if (sitePromo !== null) return { channel, final_price: sitePromo, compare_price: compare, source: "site_promo_price" };
    const promo = activePromo ? positive(row.promo_price) : null;
    if (promo !== null) return { channel, final_price: promo, compare_price: compare, source: "promo_price" };
    if (site !== null) return { channel, final_price: site, compare_price: null, source: "site_price" };
    return { channel, final_price: rawPrice ?? 0, compare_price: null, source: "price" };
  }

  if (channel === "whatsapp_ia" || channel === "whatsapp_humano" || channel === "telefone") {
    const final =
      positive(row.whatsapp_promo_price) ??
      positive(row.whatsapp_price) ??
      positive(row.promo_price) ??
      positive(row.price_base) ??
      positive(row.price) ??
      0;
    const source =
      positive(row.whatsapp_promo_price) !== null ? "whatsapp_promo_price" :
      positive(row.whatsapp_price) !== null ? "whatsapp_price" :
      positive(row.promo_price) !== null ? "promo_price" :
      positive(row.price_base) !== null ? "price_base" : "price";
    return { channel, final_price: final, compare_price: base && base > final ? base : null, source };
  }

  const pdvBase = positive(row.pdv_price) ?? rawPrice ?? 0;
  const promo = positive(row.pdv_promo_price) ?? positive(row.promo_price);
  if (activePromo && promo !== null && pdvBase > 0 && promo < pdvBase) {
    return {
      channel,
      final_price: promo,
      compare_price: pdvBase,
      source: positive(row.pdv_promo_price) !== null ? "pdv_promo_price" : "promo_price",
    };
  }
  return {
    channel,
    final_price: pdvBase,
    compare_price: null,
    source: positive(row.pdv_price) !== null ? "pdv_price" : "price",
  };
}

export function resolveReadInventory(row: ProductRow) {
  const legacyA = numberOrNull(row.stock);
  const legacyB = numberOrNull(row.stock_quantity);
  const legacyStock = legacyA === null && legacyB === null
    ? 0
    : Math.max(legacyA ?? Number.NEGATIVE_INFINITY, legacyB ?? Number.NEGATIVE_INFINITY);

  // Enquanto o Trier é o mestre operacional do estoque, ele é a primeira fonte.
  const trierStock = numberOrNull(row.trier_stock_quantity);
  const onHand = trierStock ?? legacyStock;
  const blocked =
    row.manual_disabled === true ||
    !!row.archived_at ||
    (row.trier_active === false && row.force_active !== true);

  return {
    on_hand: onHand,
    reserved: 0,
    available: blocked ? 0 : Math.max(0, onHand),
    sellable: !blocked && onHand > 0,
    source: trierStock !== null ? "trier" : "legacy_fallback",
    source_updated_at: row.last_stock_sync_at ?? null,
  };
}

export function buildProductReadModel(row: ProductRow, channel: string, now = Date.now()) {
  const price = resolveReadPrice(row, channel, now);
  const inventory = resolveReadInventory(row);

  return {
    id: row.id,
    sku: row.sku ?? null,
    trier_product_id: row.trier_product_id ?? null,
    barcode: row.barcode ?? null,
    name: row.name,
    manufacturer: row.manufacturer ?? row.laboratory ?? null,
    active: row.active !== false,
    requires_prescription: row.requires_prescription === true,
    controlled: row.controlled === true,
    price,
    inventory,
    authority: {
      site_price: "erp_admin",
      site_promo_price: "erp_admin",
      base_price: "trier_transitional",
      stock: "trier_transitional",
    },
    read_only: true,
  };
}
