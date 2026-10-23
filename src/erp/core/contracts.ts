export const SALES_CHANNELS = [
  "site",
  "pdv",
  "whatsapp_ia",
  "whatsapp_humano",
  "telefone",
  "b2b",
  "marketplace",
] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

export type Money = number;

export type ProductIdentity = {
  id: string;
  sku: string | null;
  trierProductId: string | null;
  barcode: string | null;
  name: string;
  laboratory: string | null;
  active: boolean;
};

export type ChannelPriceInput = {
  price?: Money | string | null;
  price_base?: Money | string | null;
  promo_price?: Money | string | null;
  site_price?: Money | string | null;
  site_promo_price?: Money | string | null;
  whatsapp_price?: Money | string | null;
  whatsapp_promo_price?: Money | string | null;
  pdv_price?: Money | string | null;
  pdv_promo_price?: Money | string | null;
  promotion_start?: string | null;
  promotion_end?: string | null;
};

export type PriceSource =
  | "site_promo_price"
  | "site_price"
  | "whatsapp_promo_price"
  | "whatsapp_price"
  | "pdv_promo_price"
  | "pdv_price"
  | "promo_price"
  | "price_base"
  | "price";

export type ChannelPriceSnapshot = {
  channel: SalesChannel;
  finalPrice: Money;
  comparePrice: Money | null;
  discountPercent: number;
  source: PriceSource;
  calculatedAt: string;
};

export type InventorySource = "trier" | "erp" | "manual" | "hybrid";

export type InventorySnapshot = {
  productId: string;
  storeId: string | null;
  onHand: number;
  reserved: number;
  available: number;
  source: InventorySource;
  sourceUpdatedAt: string | null;
  calculatedAt: string;
};

export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type OrderStatus =
  | "novo"
  | "aguardando_pagamento"
  | "pago"
  | "separacao"
  | "pronto"
  | "despachado"
  | "entregue"
  | "finalizado"
  | "cancelado";

export type IntegrationStatus = "not_required" | "pending" | "sending" | "sent" | "error";

export type ErpOrderItemSnapshot = {
  productId: string;
  variantId?: string | null;
  quantity: number;
  basePrice: Money | null;
  channelPrice: Money;
  unitPrice: Money;
  costSnapshot?: Money | null;
};

export type ErpOrderSnapshot = {
  id: string;
  orderCode: string;
  channel: SalesChannel;
  customerId: string | null;
  storeId: string | null;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  total: Money;
  trierEligible: boolean;
  trierIntegrationStatus: IntegrationStatus;
  items: ErpOrderItemSnapshot[];
  createdAt: string;
};

export function normalizeLegacySalesChannel(
  salesChannel?: string | null,
  source?: string | null,
): SalesChannel {
  const channel = String(salesChannel || "").trim().toLowerCase();
  const origin = String(source || "").trim().toLowerCase();

  if (channel === "site") return "site";
  if (channel === "pdv" || channel === "balcao") return "pdv";
  if (channel === "whatsapp") return origin === "ia" ? "whatsapp_ia" : "whatsapp_humano";
  if (channel === "telefone") return "telefone";
  if (channel === "b2b") return "b2b";
  if (channel === "marketplace") return "marketplace";
  if (origin === "ia") return "whatsapp_ia";

  return "site";
}
