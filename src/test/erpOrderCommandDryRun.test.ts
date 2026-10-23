import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateOrderDryRun } from "../../supabase/functions/_shared/erp/order-command";
import { buildProductReadModel } from "../../supabase/functions/_shared/erp/product-service";

function resolvedFrom(row: any, channel = "site") {
  const model = buildProductReadModel(row, channel);
  return {
    product_id: row.id,
    name: row.name,
    unit_price: Number(model.price.final_price),
    available: Number(model.inventory.available),
    sellable: Boolean(model.inventory.sellable),
    source: String(model.price.source),
  };
}

describe("Order Command dry-run", () => {
  it("preserva site_price manual no cálculo do pedido", () => {
    const row = {
      id: "p1",
      name: "Produto",
      price: 29.99,
      site_price: 27.99,
      promo_price: null,
      stock: 16,
      stock_quantity: 16,
      trier_stock_quantity: 16,
      trier_active: true,
    };
    const resolved = new Map([["p1", resolvedFrom(row, "site")]]);
    const out = validateOrderDryRun({
      channel: "site",
      requested: [{ product_id: "p1", quantity: 1, expected_unit_price: 27.99 }],
      resolved,
    });
    expect(out.accepted).toBe(true);
    expect(out.items[0].unit_price).toBe(27.99);
  });

  it("bloqueia quando o preço esperado diverge", () => {
    const resolved = new Map([["p1", {
      product_id: "p1", name: "Produto", unit_price: 20, available: 5, sellable: true, source: "site_price",
    }]]);
    const out = validateOrderDryRun({
      channel: "site",
      requested: [{ product_id: "p1", quantity: 1, expected_unit_price: 19 }],
      resolved,
    });
    expect(out.accepted).toBe(false);
    expect(out.issues[0].code).toBe("price_changed");
  });

  it("bloqueia estoque insuficiente sem baixar estoque", () => {
    const resolved = new Map([["p1", {
      product_id: "p1", name: "Produto", unit_price: 20, available: 1, sellable: true, source: "price",
    }]]);
    const out = validateOrderDryRun({
      channel: "site",
      requested: [{ product_id: "p1", quantity: 2, expected_unit_price: 20 }],
      resolved,
    });
    expect(out.accepted).toBe(false);
    expect(out.issues[0].code).toBe("insufficient_stock");
    expect(out.writes).toBe(0);
  });

  it("calcula totais sem persistir", () => {
    const resolved = new Map([["p1", {
      product_id: "p1", name: "Produto", unit_price: 10, available: 10, sellable: true, source: "price",
    }]]);
    const out = validateOrderDryRun({
      channel: "site",
      requested: [{ product_id: "p1", quantity: 2, expected_unit_price: 10 }],
      resolved,
      discount: 2,
      delivery_fee: 5,
    });
    expect(out.totals).toEqual({ subtotal: 20, discount: 2, delivery_fee: 5, total: 23 });
  });

  it("a Edge Function é read-only e não chama pagamento/Trier", () => {
    const code = readFileSync("supabase/functions/erp-order-dry-run/index.ts", "utf8");
    expect(code).not.toContain(".insert(");
    expect(code).not.toContain(".update(");
    expect(code).not.toContain(".delete(");
    expect(code).not.toContain(".upsert(");
    expect(code).not.toContain("send-order-to-trier");
    expect(code).not.toContain("create-cielo");
  });
});
