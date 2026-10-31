export type PurchaseOrder = {
  id: string;
  created_at: string;
  user_id?: string | null;
  customer_cpf?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  payment_status?: string | null;
  status?: string | null;
  total?: number | string | null;
  delivery_fee?: number | string | null;
  order_items?: Array<any>;
};

const digits = (value?: string | null) => String(value || "").replace(/\D/g, "");
const email = (value?: string | null) => String(value || "").trim().toLowerCase();

export function sameCustomer(a: PurchaseOrder, b: PurchaseOrder) {
  // A guest order belongs to itself even without a reusable customer identity.
  if (a.id && a.id === b.id) return true;
  if (a.user_id && b.user_id && a.user_id === b.user_id) return true;

  const acpf = digits(a.customer_cpf);
  const bcpf = digits(b.customer_cpf);
  if (acpf.length >= 11 && bcpf.length >= 11 && acpf === bcpf) return true;

  const ae = email(a.customer_email);
  const be = email(b.customer_email);
  if (ae && be && ae === be) return true;

  const ap = digits(a.customer_phone);
  const bp = digits(b.customer_phone);
  return ap.length >= 10 && bp.length >= 10 && ap === bp;
}

export function isSuccessfulPurchase(order: PurchaseOrder) {
  const payment = String(order.payment_status || "").toLowerCase();
  const status = String(order.status || "").toLowerCase();

  if (["cancelled", "canceled", "refunded", "chargeback", "rejected"].includes(payment)) return false;
  if (["cancelado", "reembolsado"].includes(status)) return false;

  return payment === "approved"
    || payment === "partially_refunded"
    || ["entregue", "retirado", "finalizado"].includes(status);
}

function netOrderValue(order: PurchaseOrder) {
  if (String(order.payment_status || "").toLowerCase() !== "partially_refunded") {
    return Number(order.total || 0);
  }
  const itemNet = (order.order_items || [])
    .filter((item: any) => item.item_status !== "removido")
    .reduce((sum: number, item: any) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
  return itemNet + Number(order.delivery_fee || 0);
}

const productKey = (item: any) =>
  item.product_id ? `id:${item.product_id}` : `name:${String(item.product_name || "").trim().toLowerCase()}`;

function averageDays(dates: string[]) {
  if (dates.length < 2) return null;
  const sorted = [...dates].map((d) => new Date(d).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  let total = 0;
  for (let i = 1; i < sorted.length; i += 1) total += (sorted[i] - sorted[i - 1]) / 86_400_000;
  return Math.round(total / (sorted.length - 1));
}

export function buildCustomerPurchaseInsights(current: PurchaseOrder, allOrders: PurchaseOrder[]) {
  const customerOrders = allOrders.filter((order) => sameCustomer(current, order));
  const successful = customerOrders
    .filter(isSuccessfulPurchase)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const purchaseCount = successful.length;
  const totalSpent = successful.reduce((sum, order) => sum + netOrderValue(order), 0);
  const averageTicket = purchaseCount ? totalSpent / purchaseCount : 0;
  const averagePurchaseIntervalDays = averageDays(successful.map((o) => o.created_at));

  const profile =
    purchaseCount >= 10 || totalSpent >= 2000 ? "VIP"
      : purchaseCount >= 5 ? "Frequente"
        : purchaseCount >= 2 ? "Recorrente"
          : "Novo";

  const currentTime = new Date(current.created_at).getTime();
  const priorSuccessful = successful.filter((order) =>
    order.id !== current.id && new Date(order.created_at).getTime() < currentTime
  );

  const priorProductOrders = new Map<string, { orders: Set<string>; dates: string[] }>();
  for (const order of priorSuccessful) {
    const seenThisOrder = new Set<string>();
    for (const item of order.order_items || []) {
      if (item.item_status === "removido") continue;
      const key = productKey(item);
      if (!key || seenThisOrder.has(key)) continue;
      seenThisOrder.add(key);
      const row = priorProductOrders.get(key) || { orders: new Set<string>(), dates: [] };
      row.orders.add(order.id);
      row.dates.push(order.created_at);
      priorProductOrders.set(key, row);
    }
  }

  const repeatedCurrentItems = (current.order_items || []).map((item: any) => {
    const history = priorProductOrders.get(productKey(item));
    const previousPurchases = history?.orders.size || 0;
    const lastPurchaseAt = history?.dates?.length
      ? [...history.dates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : null;
    return {
      product_id: item.product_id || null,
      product_name: item.product_name,
      previousPurchases,
      lastPurchaseAt,
      repeated: previousPurchases > 0,
      sensitive: item.requires_prescription === true
        || item.controlled === true
        || (item.prescription_condition && item.prescription_condition !== "none"),
    };
  }).filter((item: any) => item.repeated);

  const productHistory = new Map<string, {
    product_name: string;
    quantity: number;
    orderIds: Set<string>;
    dates: string[];
    sensitive: boolean;
  }>();

  for (const order of successful) {
    for (const item of order.order_items || []) {
      if (item.item_status === "removido") continue;
      const key = productKey(item);
      const row = productHistory.get(key) || {
        product_name: item.product_name || "Produto",
        quantity: 0,
        orderIds: new Set<string>(),
        dates: [],
        sensitive: false,
      };
      row.quantity += Number(item.quantity || 0);
      row.orderIds.add(order.id);
      if (!row.dates.includes(order.created_at)) row.dates.push(order.created_at);
      row.sensitive = row.sensitive
        || item.requires_prescription === true
        || item.controlled === true
        || (item.prescription_condition && item.prescription_condition !== "none");
      productHistory.set(key, row);
    }
  }

  const topProducts = [...productHistory.values()]
    .map((row) => ({
      product_name: row.product_name,
      purchaseOrders: row.orderIds.size,
      quantity: row.quantity,
      lastPurchaseAt: [...row.dates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null,
      averageIntervalDays: averageDays(row.dates),
      sensitive: row.sensitive,
    }))
    .sort((a, b) => b.purchaseOrders - a.purchaseOrders || b.quantity - a.quantity)
    .slice(0, 8);

  // Oportunidades comerciais são limitadas a itens não sensíveis. Medicamentos
  // controlados/receita continuam visíveis apenas como histórico factual de compra.
  const recurringOpportunities = topProducts
    .filter((item) => !item.sensitive && item.purchaseOrders >= 2)
    .slice(0, 5);

  return {
    purchaseCount,
    priorPurchaseCount: priorSuccessful.length,
    totalSpent,
    averageTicket,
    averagePurchaseIntervalDays,
    firstPurchaseAt: successful[0]?.created_at || null,
    lastPurchaseAt: successful[successful.length - 1]?.created_at || null,
    profile,
    repeatedCurrentItems,
    repeatedCurrentItemCount: repeatedCurrentItems.length,
    topProducts,
    recurringOpportunities,
  };
}
