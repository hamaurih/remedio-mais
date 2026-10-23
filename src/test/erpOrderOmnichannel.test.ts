import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizeOrderChannel,
  normalizeTrierIntegrationStatus,
} from "@/erp/core/orderModel";
import {
  buildCanonicalOrder,
  normalizeChannel,
  trierIntegrationStatus,
} from "../../supabase/functions/_shared/erp/order-service";

describe("Order Omnichannel contract", () => {
  it("normaliza Site, PDV e WhatsApp/IA para o mesmo vocabulário", () => {
    expect(normalizeOrderChannel("site", "site")).toBe("site");
    expect(normalizeOrderChannel("pdv", "pdv")).toBe("pdv");
    expect(normalizeOrderChannel("whatsapp", "ia")).toBe("whatsapp_ia");
    expect(normalizeOrderChannel("whatsapp", "humano")).toBe("whatsapp_humano");

    expect(normalizeChannel("site", "site")).toBe("site");
    expect(normalizeChannel("pdv", "pdv")).toBe("pdv");
    expect(normalizeChannel("whatsapp", "ia")).toBe("whatsapp_ia");
  });

  it("separa status comercial do status Trier", () => {
    const order = {
      id: "o1",
      order_code: "ADM-1",
      sales_channel: "site",
      source: "site",
      payment_status: "approved",
      order_status: "pago",
      trier_eligible: true,
      trier_sent: false,
      trier_status: "error",
      total: 100,
    };
    const model = buildCanonicalOrder(order);
    expect(model.payment.status).toBe("approved");
    expect(model.lifecycle.order_status).toBe("pago");
    expect(model.integrations.trier.status).toBe("error");
  });

  it("marca integração Trier enviada independentemente do status de entrega", () => {
    const row = {
      trier_eligible: true,
      trier_sent: true,
      trier_status: "sent",
      delivery_status: "pending",
    };
    expect(normalizeTrierIntegrationStatus(row)).toBe("sent");
    expect(trierIntegrationStatus(row)).toBe("sent");
  });

  it("pedido IA pode ser not_required no Trier durante a transição", () => {
    const model = buildCanonicalOrder({
      id: "o2",
      sales_channel: "whatsapp",
      source: "ia",
      trier_eligible: false,
      payment_status: "pending",
      total: 10,
    });
    expect(model.channel).toBe("whatsapp_ia");
    expect(model.integrations.trier.status).toBe("not_required");
  });

  it("mantém snapshot financeiro do item", () => {
    const model = buildCanonicalOrder(
      { id: "o3", sales_channel: "site", source: "site", total: 20 },
      [{
        id: "i1",
        product_id: "p1",
        product_name: "Produto",
        unit_price: 10,
        quantity: 2,
        total: 20,
      }],
    );
    expect(model.items[0].unit_price).toBe(10);
    expect(model.items[0].total).toBe(20);
  });

  it("a Edge Function omnichannel desta etapa permanece somente leitura", () => {
    const code = readFileSync("supabase/functions/erp-order-read/index.ts", "utf8");
    expect(code).not.toContain(".insert(");
    expect(code).not.toContain(".update(");
    expect(code).not.toContain(".delete(");
    expect(code).not.toContain(".upsert(");
  });
});
