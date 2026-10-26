import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const checkout = readFileSync("src/pages/Checkout.tsx","utf8");

describe("card payment success redirect", () => {
  it("marks payment completion before clearing the cart", () => {
    const idxFlag = checkout.indexOf("paymentCompletedRef.current = true");
    const idxClear = checkout.indexOf("clearCart();", idxFlag);
    const idxNav = checkout.indexOf('nav(`/pedido/sucesso?order=${orderId}`', idxClear);
    expect(idxFlag).toBeGreaterThan(-1);
    expect(idxClear).toBeGreaterThan(idxFlag);
    expect(idxNav).toBeGreaterThan(idxClear);
  });

  it("does not redirect an approved card payment to the empty cart", () => {
    expect(checkout).toContain('if (!paymentCompletedRef.current && items.length === 0) nav("/carrinho"');
    expect(checkout).toContain('if (!paymentCompletedRef.current && items.length > 0 && checkoutItems.length === 0) nav("/carrinho"');
  });

  it("requires an order id before navigating to success", () => {
    expect(checkout).toContain('if (!orderId) throw new Error("Pagamento aprovado, mas o pedido não foi identificado.")');
    expect(checkout).toContain('/pedido/sucesso?order=');
  });
});
