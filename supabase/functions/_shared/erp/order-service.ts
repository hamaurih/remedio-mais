export type OrderRow = {
  id: string;
  order_code?: string | null;
  user_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  store_id?: string | null;

  sales_channel?: string | null;
  source?: string | null;
  created_by?: string | null;

  subtotal?: number | string | null;
  discount?: number | string | null;
  delivery_fee?: number | string | null;
  total?: number | string | null;

  payment_gateway?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  paid_at?: string | null;

  status?: string | null;
  order_status?: string | null;
  fulfillment_status?: string | null;
  delivery_status?: string | null;

  trier_eligible?: boolean | null;
  trier_sent?: boolean | null;
  trier_status?: string | null;
  trier_sending_at?: string | null;
  trier_sent_at?: string | null;
  trier_order_id?: string | null;
  trier_sale_id?: string | null;
  trier_last_error?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

export type OrderItemRow = {
  id: string;
  product_id?: string | null;
  product_name: string;
  trier_product_id?: string | null;
  variant_id?: string | null;
  variant_label?: string | null;
  unit_price: number | string;
  quantity: number;
  total?: number | string | null;
  requires_prescription?: boolean | null;
  controlled?: boolean | null;
  prescription_id?: string | null;
  prescription_condition?: string | null;
  item_status?: string | null;
};

function money(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeChannel(salesChannel?: string | null, source?: string | null) {
  const channel = String(salesChannel || "").trim().toLowerCase();
  const origin = String(source || "").trim().toLowerCase();
  if (channel === "pdv" || channel === "balcao") return "pdv";
  if (channel === "whatsapp") return origin === "ia" ? "whatsapp_ia" : "whatsapp_humano";
  if (channel === "telefone") return "telefone";
  if (channel === "b2b") return "b2b";
  if (channel === "marketplace") return "marketplace";
  if (origin === "ia") return "whatsapp_ia";
  return "site";
}

export function trierIntegrationStatus(order: OrderRow) {
  if (order.trier_eligible === false) return "not_required";
  if (order.trier_sent === true || String(order.trier_status || "").toLowerCase() === "sent") return "sent";
  if (order.trier_sending_at || String(order.trier_status || "").toLowerCase() === "sending") return "sending";
  if (String(order.trier_status || "").toLowerCase() === "error") return "error";
  return "pending";
}

export function buildCanonicalOrder(
  order: OrderRow,
  items: OrderItemRow[] = [],
) {
  return {
    id: order.id,
    order_code: order.order_code ?? null,
    channel: normalizeChannel(order.sales_channel, order.source),
    source_legacy: {
      sales_channel: order.sales_channel ?? null,
      source: order.source ?? null,
      created_by: order.created_by ?? null,
    },
    customer: {
      user_id: order.user_id ?? null,
      name: order.customer_name ?? null,
      email: order.customer_email ?? null,
      phone: order.customer_phone ?? null,
    },
    store_id: order.store_id ?? null,
    money: {
      subtotal: money(order.subtotal),
      discount: money(order.discount),
      delivery_fee: money(order.delivery_fee),
      total: money(order.total),
    },
    payment: {
      gateway: order.payment_gateway ?? null,
      method: order.payment_method ?? null,
      status: order.payment_status ?? "pending",
      paid_at: order.paid_at ?? null,
    },
    lifecycle: {
      status: order.status ?? null,
      order_status: order.order_status ?? null,
      fulfillment_status: order.fulfillment_status ?? null,
      delivery_status: order.delivery_status ?? null,
    },
    integrations: {
      trier: {
        eligible: order.trier_eligible !== false,
        status: trierIntegrationStatus(order),
        sent_at: order.trier_sent_at ?? null,
        order_id: order.trier_order_id ?? null,
        sale_id: order.trier_sale_id ?? null,
        last_error: order.trier_last_error ?? null,
      },
    },
    items: items.map((item) => ({
      id: item.id,
      product_id: item.product_id ?? null,
      product_name: item.product_name,
      trier_product_id: item.trier_product_id ?? null,
      variant_id: item.variant_id ?? null,
      variant_label: item.variant_label ?? null,
      unit_price: money(item.unit_price),
      quantity: Number(item.quantity || 0),
      total: item.total == null ? money(item.unit_price) * Number(item.quantity || 0) : money(item.total),
      requires_prescription: item.requires_prescription === true,
      controlled: item.controlled === true,
      prescription_id: item.prescription_id ?? null,
      prescription_condition: item.prescription_condition ?? null,
      status: item.item_status ?? null,
    })),
    created_at: order.created_at ?? null,
    updated_at: order.updated_at ?? null,
    read_only: true,
  };
}
