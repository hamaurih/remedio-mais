export type DryRunChannel =
  | "site"
  | "pdv"
  | "whatsapp_ia"
  | "whatsapp_humano"
  | "telefone"
  | "b2b"
  | "marketplace";

export type DryRunRequestedItem = {
  product_id: string;
  quantity: number;
  expected_unit_price?: number | null;
};

export type DryRunResolvedItem = {
  product_id: string;
  name: string;
  unit_price: number;
  available: number;
  sellable: boolean;
  source: string;
};

export type DryRunIssue = {
  code:
    | "invalid_quantity"
    | "product_not_found"
    | "product_unavailable"
    | "insufficient_stock"
    | "price_changed";
  product_id: string;
  message: string;
  expected?: number | null;
  actual?: number | null;
};

export function validateOrderDryRun(args: {
  channel: DryRunChannel;
  requested: DryRunRequestedItem[];
  resolved: Map<string, DryRunResolvedItem>;
  delivery_fee?: number;
  discount?: number;
  tolerance?: number;
}) {
  const tolerance = Math.max(0, args.tolerance ?? 0.01);
  const issues: DryRunIssue[] = [];
  const items: Array<{
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    stock_available: number;
    price_source: string;
  }> = [];

  for (const item of args.requested) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      issues.push({
        code: "invalid_quantity",
        product_id: item.product_id,
        message: "Quantidade inválida.",
      });
      continue;
    }

    const product = args.resolved.get(item.product_id);
    if (!product) {
      issues.push({
        code: "product_not_found",
        product_id: item.product_id,
        message: "Produto não encontrado.",
      });
      continue;
    }

    if (!product.sellable || product.unit_price <= 0) {
      issues.push({
        code: "product_unavailable",
        product_id: item.product_id,
        message: "Produto indisponível para venda neste canal.",
      });
      continue;
    }

    if (product.available < quantity) {
      issues.push({
        code: "insufficient_stock",
        product_id: item.product_id,
        message: `Estoque insuficiente: disponível ${product.available}.`,
        actual: product.available,
        expected: quantity,
      });
      continue;
    }

    if (
      item.expected_unit_price !== undefined &&
      item.expected_unit_price !== null &&
      Math.abs(Number(item.expected_unit_price) - product.unit_price) > tolerance
    ) {
      issues.push({
        code: "price_changed",
        product_id: item.product_id,
        message: "O preço mudou desde a seleção do item.",
        expected: Number(item.expected_unit_price),
        actual: product.unit_price,
      });
      continue;
    }

    items.push({
      product_id: product.product_id,
      name: product.name,
      quantity,
      unit_price: product.unit_price,
      line_total: Math.round(product.unit_price * quantity * 100) / 100,
      stock_available: product.available,
      price_source: product.source,
    });
  }

  const subtotal = Math.round(items.reduce((sum, item) => sum + item.line_total, 0) * 100) / 100;
  const discount = Math.max(0, Number(args.discount || 0));
  const deliveryFee = Math.max(0, Number(args.delivery_fee || 0));
  const total = Math.max(0, Math.round((subtotal - discount + deliveryFee) * 100) / 100);

  return {
    accepted: issues.length === 0 && items.length === args.requested.length,
    channel: args.channel,
    issues,
    items,
    totals: {
      subtotal,
      discount,
      delivery_fee: deliveryFee,
      total,
    },
    writes: 0,
  };
}
