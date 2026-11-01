import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalCheckoutAttempt, type CheckoutAttemptIntent } from "@/lib/checkoutAttempt";

const source = (path: string) => readFileSync(path, "utf8");
const base: CheckoutAttemptIntent = {
  userId: "123e4567-e89b-42d3-a456-426614174000",
  paymentMethod: "pix",
  products: [
    { id: "B", quantity: 2, unitCents: 999 },
    { id: "A", quantity: 1, unitCents: 1499, variantId: "v1" },
  ],
  deliveryType: "pickup", delivery: null,
  customer: { name: "Maria", phone: "000", cpf: "00000000000" },
  totalCents: 3497, installments: 1,
};

describe("Checkout — idempotência forte por tentativa", () => {
  it("produz a mesma intenção independentemente da ordem dos itens", () => {
    const swapped = { ...base, products: [...base.products].reverse() };
    expect(canonicalCheckoutAttempt(swapped)).toBe(canonicalCheckoutAttempt(base));
  });
  it("não mistura cartão, Pix, valores nem endereços distintos", () => {
    const fingerprint = canonicalCheckoutAttempt(base);
    expect(canonicalCheckoutAttempt({ ...base, paymentMethod:"credit_card" })).not.toBe(fingerprint);
    expect(canonicalCheckoutAttempt({ ...base, totalCents:3498 })).not.toBe(fingerprint);
    expect(canonicalCheckoutAttempt({ ...base, deliveryType:"delivery", delivery:{ cep:"12345678", number:"15" } })).not.toBe(fingerprint);
    expect(canonicalCheckoutAttempt({ ...base, products:base.products.map(p => ({ ...p, quantity:p.quantity + 1 })) })).not.toBe(fingerprint);
  });
  it("não precisa de PAN ou CVV para gerar intenção", () => {
    const fingerprint = canonicalCheckoutAttempt({ ...base, paymentMethod:"credit_card", cardLast4:"1234" });
    expect(fingerprint).toContain("cardLast4");
    expect(fingerprint).not.toContain("security_code");
    expect(fingerprint).not.toContain("CardNumber");
    const helper = source("src/lib/checkoutAttempt.ts");
    expect(helper).toContain("SHA-256");
    expect(helper).toContain("randomUUID");
    expect(helper).toContain("localStorage");
  });
  it("utiliza índice único existente, recupera corrida e preserva pedido original", () => {
    const migration = source("supabase/migrations/20260919210000_whatsapp_ia_order_identity.sql");
    const server = source("supabase/functions/_shared/prepare-order.ts");
    expect(migration).toContain("orders_external_idempotency_unique");
    expect(server).toContain("external_idempotency_key");
    expect(server).toContain('orderErr?.code === "23505"');
    expect(server).toContain("const prior = await recoverExisting()");
    expect(server).toContain("reused: true");
    expect(server).toContain("reused: false");
  });
  it("nunca envia uma segunda cobrança quando a tentativa já tem pedido", () => {
    for (const name of ["create-cielo-pix", "create-cielo-card"]) {
      const server = source("supabase/functions/" + name + "/index.ts");
      expect(server).toContain("reused");
      expect(server).toContain("payment_reconciliation_required");
      const reuseAt = server.indexOf("if (reused)") >= 0 ? server.indexOf("if (reused)") : server.indexOf("if(reused)");
      const gatewayAt = server.indexOf("await fetch(");
      expect(reuseAt).toBeGreaterThan(-1);
      expect(reuseAt).toBeLessThan(gatewayAt);
    }
    const checkout = source("src/pages/Checkout.tsx");
    expect(checkout).toContain("idempotency_key: idempotencyKey");
  });
});
