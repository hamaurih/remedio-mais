import { describe, expect, it } from "vitest";
import {
  getPaymentAdapter,
  normalizePaymentMethod,
  PaymentRoutingError,
} from "../../supabase/functions/_shared/paymentProvider";

describe("payment provider adapters", () => {
  it("maps the current Pix implementation through the registry", () => {
    expect(getPaymentAdapter("mercado_pago", "pix").functionName).toBe(
      "create-pix-payment",
    );
  });

  it("maps the current credit-card implementation through the registry", () => {
    expect(
      getPaymentAdapter("mercado_pago", "credit_card").functionName,
    ).toBe("create-mercado-pago-checkout");
  });

  it("rejects a database provider without reviewed adapter code", () => {
    expect(() => getPaymentAdapter("unreviewed_bank", "pix")).toThrowError(
      PaymentRoutingError,
    );
  });

  it("rejects unknown payment methods before provider resolution", () => {
    expect(() => normalizePaymentMethod("card_number_direct")).toThrowError(
      "Forma de pagamento não suportada.",
    );
  });
});
