export type FieldAuthority =
  | "erp_admin"
  | "trier_transitional"
  | "erp_system"
  | "derived";

export const SITE_MANUAL_PRICE_FIELDS = [
  "site_price",
  "site_promo_price",
  "site_discount_percentage",
] as const;

export const PRODUCT_FIELD_AUTHORITY = {
  // Canal Site: decisão comercial manual do Atacadão. Integrações externas não escrevem.
  site_price: "erp_admin",
  site_promo_price: "erp_admin",
  site_discount_percentage: "erp_admin",

  // Canais próprios: também administrados pelo ERP.
  whatsapp_price: "erp_admin",
  whatsapp_promo_price: "erp_admin",
  whatsapp_discount_percentage: "erp_admin",
  pdv_price: "erp_admin",
  pdv_promo_price: "erp_admin",
  pdv_discount_percentage: "erp_admin",

  // Durante a transição estes campos operacionais/base ainda vêm do Trier.
  price: "trier_transitional",
  ecommerce_price: "trier_transitional",
  promo_price: "trier_transitional",
  stock: "trier_transitional",
  stock_quantity: "trier_transitional",
  trier_stock_quantity: "trier_transitional",
  trier_active: "trier_transitional",

  // Identidade técnica e visual são propriedade do ERP/admin quando manuais.
  image_url: "erp_admin",
  gallery_images: "erp_admin",
  seo_title: "erp_admin",
  seo_description: "erp_admin",
  shelves: "erp_admin",

  // Campos calculados nunca devem ser gravados por integração externa.
  effective_price: "derived",
  available_to_sell: "derived",
} as const satisfies Record<string, FieldAuthority>;

export type GovernedProductField = keyof typeof PRODUCT_FIELD_AUTHORITY;

export function fieldAuthority(field: GovernedProductField): FieldAuthority {
  return PRODUCT_FIELD_AUTHORITY[field];
}

export function canTrierWriteField(field: GovernedProductField): boolean {
  return PRODUCT_FIELD_AUTHORITY[field] === "trier_transitional";
}

export function isSiteManualPriceField(field: string): boolean {
  return (SITE_MANUAL_PRICE_FIELDS as readonly string[]).includes(field);
}
