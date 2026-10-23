export type ShadowProduct = {
  id: string;
  name?: string | null;
  price?: number | string | null;
  price_base?: number | string | null;
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
  trier_active?: boolean | null;
  manual_disabled?: boolean | null;
  archived_at?: string | null;
  force_active?: boolean | null;
};

export type ShadowMismatch = {
  field: "site_price" | "whatsapp_price" | "pdv_price" | "stock" | "availability";
  legacy: number | boolean;
  erp: number | boolean;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function positive(v: unknown): number | null {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
}

function promotionActive(p: ShadowProduct, now: number) {
  const start = p.promotion_start ? new Date(p.promotion_start).getTime() : null;
  const end = p.promotion_end ? new Date(p.promotion_end).getTime() : null;
  if (start !== null && Number.isFinite(start) && start > now) return false;
  if (end !== null && Number.isFinite(end) && end < now) return false;
  return true;
}

export function legacySitePrice(p: ShadowProduct, now = Date.now()) {
  const active = promotionActive(p, now);
  if (active && positive(p.site_promo_price) !== null) return positive(p.site_promo_price)!;
  if (active && positive(p.promo_price) !== null) return positive(p.promo_price)!;
  if (positive(p.site_price) !== null) return positive(p.site_price)!;
  return positive(p.price) ?? 0;
}

export function legacyWhatsappPrice(p: ShadowProduct) {
  return positive(p.whatsapp_promo_price)
    ?? positive(p.whatsapp_price)
    ?? positive(p.promo_price)
    ?? positive(p.price_base)
    ?? positive(p.price)
    ?? 0;
}

export function legacyPdvPrice(p: ShadowProduct, now = Date.now()) {
  const base = positive(p.pdv_price) ?? positive(p.price) ?? 0;
  const promo = positive(p.pdv_promo_price) ?? positive(p.promo_price);
  if (promotionActive(p, now) && promo !== null && base > 0 && promo < base) return promo;
  return base;
}

// Candidato ERP durante a transição: deve reproduzir o legado.
export function erpCandidateSitePrice(p: ShadowProduct, now = Date.now()) {
  return legacySitePrice(p, now);
}

export function erpCandidateWhatsappPrice(p: ShadowProduct) {
  return legacyWhatsappPrice(p);
}

export function erpCandidatePdvPrice(p: ShadowProduct, now = Date.now()) {
  return legacyPdvPrice(p, now);
}

export function legacySiteStock(p: ShadowProduct) {
  const a = num(p.stock);
  const b = num(p.stock_quantity);
  if (a === null && b === null) return 0;
  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
}

export function erpCandidateStock(p: ShadowProduct) {
  // Enquanto o Trier é mestre, usar o saldo Trier quando presente.
  return num(p.trier_stock_quantity) ?? legacySiteStock(p);
}

function blocked(p: ShadowProduct) {
  if (p.manual_disabled === true || !!p.archived_at) return true;
  if (p.trier_active === false && p.force_active !== true) return true;
  return false;
}

export function legacyAvailability(p: ShadowProduct) {
  return !blocked(p) && legacySiteStock(p) > 0;
}

export function erpCandidateAvailability(p: ShadowProduct) {
  return !blocked(p) && erpCandidateStock(p) > 0;
}

export function compareProductShadow(p: ShadowProduct, now = Date.now()) {
  const mismatches: ShadowMismatch[] = [];

  const legacySite = legacySitePrice(p, now);
  const erpSite = erpCandidateSitePrice(p, now);
  if (legacySite !== erpSite) mismatches.push({ field: "site_price", legacy: legacySite, erp: erpSite });

  const legacyWa = legacyWhatsappPrice(p);
  const erpWa = erpCandidateWhatsappPrice(p);
  if (legacyWa !== erpWa) mismatches.push({ field: "whatsapp_price", legacy: legacyWa, erp: erpWa });

  const legacyPdv = legacyPdvPrice(p, now);
  const erpPdv = erpCandidatePdvPrice(p, now);
  if (legacyPdv !== erpPdv) mismatches.push({ field: "pdv_price", legacy: legacyPdv, erp: erpPdv });

  const legacyStock = legacySiteStock(p);
  const erpStock = erpCandidateStock(p);
  if (legacyStock !== erpStock) mismatches.push({ field: "stock", legacy: legacyStock, erp: erpStock });

  const legacyAvailable = legacyAvailability(p);
  const erpAvailable = erpCandidateAvailability(p);
  if (legacyAvailable !== erpAvailable) {
    mismatches.push({ field: "availability", legacy: legacyAvailable, erp: erpAvailable });
  }

  return {
    productId: p.id,
    name: p.name ?? null,
    ok: mismatches.length === 0,
    mismatches,
  };
}
