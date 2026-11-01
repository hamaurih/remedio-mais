import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { needsPaymentReconciliation } from "@/lib/cieloPaymentSafety";
const read = (path: string) => readFileSync(path, "utf8");
describe("Segurança do checkout Cielo", () => {
  const order = "123e4567-e89b-42d3-a456-426614174000";
  it("reconhece somente resposta de conciliação vinculada a pedido", () => {
    expect(needsPaymentReconciliation({ order_id:order,error_code:"payment_reconciliation_required" })).toBe(true);
    expect(needsPaymentReconciliation({ order_id: "bad", error_code:"payment_reconciliation_required" })).toBe(false);
    expect(needsPaymentReconciliation({ order_id: order,status:"rejected" })).toBe(false);
  });
  it("impede submit simultâneo e redireciona incerteza para acompanhamento", () => {
    const s = read("src/pages/Checkout.tsx");
    expect(s).toContain("paymentInFlightRef.current");
    expect(s).toContain("if (redirectPaymentReview(data, idempotencyKey)) return;");
    expect(s).toContain("/pedido/pendente?order=");
  });
  it.each(["create-cielo-pix", "create-cielo-card"])("não confirma sucesso sem gravar pedido (%s)", name => {
    const s = read("supabase/functions/" + name + "/index.ts");
    expect(s).toContain("payment_reconciliation_required");
    expect(s).toContain("saveError");
    expect(s).toContain("savedOrder");
    expect(s).toContain("payment_review");
  });
  it("recupera pagamento pela referência comercial e valida vínculo", () => {
    const s=read("supabase/functions/check-cielo-status/index.ts");
    expect(s).toContain("merchantOrderId=");
    expect(s).toContain("merchant_order_mismatch");
    expect(s).toContain("cielo_payment_id:paymentId");
    expect(s).toContain("paidCents!==expectedCents");
  });
});
