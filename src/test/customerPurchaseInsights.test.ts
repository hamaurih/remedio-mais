import { describe, expect, it } from "vitest";
import { buildCustomerPurchaseInsights, isSuccessfulPurchase, sameCustomer } from "@/lib/customerPurchaseInsights";

const order = (overrides: any = {}) => ({
  id: crypto.randomUUID(),
  created_at: "2026-10-01T12:00:00Z",
  customer_phone: "(83) 99999-0000",
  payment_status: "approved",
  status: "finalizado",
  total: 100,
  delivery_fee: 0,
  order_items: [],
  ...overrides,
});

describe("customerPurchaseInsights", () => {
  it("reconhece o mesmo cliente por telefone normalizado", () => {
    expect(sameCustomer(order(), order({ customer_phone: "83999990000" }))).toBe(true);
  });

  it("não conta pedido cancelado como compra", () => {
    expect(isSuccessfulPurchase(order({ payment_status: "cancelled", status: "cancelado" }))).toBe(false);
  });

  it("detecta recompra do mesmo produto", () => {
    const prior = order({
      id: "prior",
      created_at: "2026-09-01T12:00:00Z",
      order_items: [{ product_id: "p1", product_name: "Produto A", quantity: 1, unit_price: 20 }],
    });
    const current = order({
      id: "current",
      created_at: "2026-10-01T12:00:00Z",
      order_items: [{ product_id: "p1", product_name: "Produto A", quantity: 2, unit_price: 20 }],
    });
    const insight = buildCustomerPurchaseInsights(current, [current, prior]);
    expect(insight.purchaseCount).toBe(2);
    expect(insight.repeatedCurrentItemCount).toBe(1);
    expect(insight.repeatedCurrentItems[0].previousPurchases).toBe(1);
  });

  it("exclui item sensível de oportunidades automáticas", () => {
    const orders = [
      order({ id: "a", created_at: "2026-08-01T12:00:00Z", order_items: [{ product_id: "rx", product_name: "Item RX", quantity: 1, unit_price: 30, requires_prescription: true }] }),
      order({ id: "b", created_at: "2026-09-01T12:00:00Z", order_items: [{ product_id: "rx", product_name: "Item RX", quantity: 1, unit_price: 30, requires_prescription: true }] }),
    ];
    const insight = buildCustomerPurchaseInsights(orders[1], orders);
    expect(insight.topProducts[0].purchaseOrders).toBe(2);
    expect(insight.recurringOpportunities).toHaveLength(0);
  });
});

it('includes the current unlinked guest order without inventing a contact identity', () => {
  const guest = order({ id: 'guest', user_id: null, customer_phone: null, customer_email: null, customer_cpf: null });
  const other = order({ id: 'other', customer_phone: null });
  expect(buildCustomerPurchaseInsights(guest, [guest, other]).purchaseCount).toBe(1);
  expect(buildCustomerPurchaseInsights(guest, [guest, other]).totalSpent).toBe(100);
  expect(sameCustomer(guest, other)).toBe(false);
});
