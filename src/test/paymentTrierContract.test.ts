import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("critical payment -> Trier contract", () => {
  it("keeps the Cielo webhook dispatching the first approved site order to Trier", () => {
    const code = source("supabase/functions/cielo-webhook/index.ts");
    expect(code).toContain("send-order-to-trier");
    expect(code).toContain("auto_send_orders_enabled");
    expect(code).toContain('order.sales_channel==="site"');
  });

  it("keeps Cielo reconciliation dispatching a newly approved site order to Trier", () => {
    const code = source("supabase/functions/check-cielo-status/index.ts");
    expect(code).toContain("send-order-to-trier");
    expect(code).toContain("auto_send_orders_enabled");
    expect(code).toContain('order.sales_channel==="site"');
  });

  it("keeps Trier send idempotency and success markers", () => {
    const code = source("supabase/functions/send-order-to-trier/index.ts");
    expect(code).toContain("trier_payload_hash");
    expect(code).toContain("trier_sent");
    expect(code).toContain('trier_status: "sent"');
    expect(code).toContain("trier_sent_at");
    expect(code).toContain("trier_dispatched_at");
  });

  it("keeps WhatsApp/IA orders isolated from Trier during the transition", () => {
    const code = source("supabase/functions/send-order-to-trier/index.ts");
    expect(code).toContain('String(order.source || "") === "ia"');
    expect(code).toContain('String(order.sales_channel || "") === "whatsapp"');
    expect(code).toContain("order.trier_eligible === false");
  });

  it("keeps payment errors separate from Trier success state", () => {
    const code = source("supabase/functions/send-order-to-trier/index.ts");
    expect(code).toContain('trier_status: "error"');
    expect(code).toContain("trier_last_error");
    expect(code).toContain("trier_error_message");
  });
});
