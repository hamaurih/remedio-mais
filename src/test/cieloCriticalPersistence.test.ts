import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isConfirmedCieloDecline, needsPaymentReconciliation } from "@/lib/cieloPaymentSafety";

const files = {
  pix: readFileSync("supabase/functions/create-cielo-pix/index.ts", "utf8"),
  card: readFileSync("supabase/functions/create-cielo-card/index.ts", "utf8"),
  checkout: readFileSync("src/pages/Checkout.tsx", "utf8"),
};

const orderId = "123e4567-e89b-42d3-a456-426614174000";
describe("Cielo — endurecimento sem interromper pagamentos", () => {
  it("distingue recusa persistida de timeout e pagamento ainda em análise", () => {
    expect(isConfirmedCieloDecline({status:"rejected",order_id:orderId})).toBe(true);
    expect(isConfirmedCieloDecline({status:"cancelled",order_id:orderId})).toBe(true);
    for(const status of ["payment_review","pending","approved","authorized",null]){
      expect(isConfirmedCieloDecline({status,order_id:orderId})).toBe(false);
    }
    expect(isConfirmedCieloDecline({status:"rejected",order_id:"short"})).toBe(false);
    expect(needsPaymentReconciliation({order_id:orderId,error_code:"payment_reconciliation_required"})).toBe(true);
  });

  it("não acessa código de erro nulo após resposta válida da adquirente", () => {
    expect(files.pix).toContain('saveError?.code || "order_not_updated"');
    expect(files.card).toContain('saveError?.code||"order_not_updated"');
    expect(files.pix).not.toContain("code: saveError.code");
    expect(files.card).not.toContain("code:saveError.code");
  });

  it("trata corpo de resposta indisponível como reconciliação, não como recusa", () => {
    expect(files.pix).toContain("[cielo-pix] response body unavailable");
    expect(files.card).toContain("[cielo-card] response body unavailable");
    for(const source of [files.pix,files.card]){
      expect(source).toContain("payment_reconciliation_required");
      expect(source).toContain("payment_review");
    }
  });

  it("não chama de recusado um erro HTTP temporário do gateway Pix", () => {
    expect(files.pix).toContain("res.status >= 500 || res.status === 408 || res.status === 429");
    expect(files.pix).toContain("rejection persistence failed");
    expect(files.card).toContain('res.status>=500||res.status===408||res.status===429');
  });

  it("libera nova tentativa de cartão somente quando a recusa está persistida", () => {
    expect(files.card).toContain("declineWriteError||!declinedOrder");
    expect(files.card).toContain('status:"rejected"');
    expect(files.checkout).toContain("releaseDeclinedPaymentAttempt(parsed, attemptKey)");
    expect(files.checkout).toContain("releaseDeclinedPaymentAttempt(data, attemptKey)");
    expect(files.checkout).toContain("if (!attemptKey || !isConfirmedCieloDecline(payload)) return;");
    expect(files.checkout).toContain("parseInvokeError(error, data, idempotencyKey)");
  });

  it("mantém cobrança Cielo desativada até habilitação explícita da idempotência", () => {
    expect(files.checkout).toContain('VITE_CIELO_CHECKOUT_IDEMPOTENCY === "true"');
    expect(files.checkout).toContain("CIELO_IDEMPOTENCY_ACTIVE ? await getCheckoutAttemptKey");
  });
});
