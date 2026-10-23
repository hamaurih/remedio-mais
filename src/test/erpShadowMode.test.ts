import { describe, expect, it } from "vitest";
import { resolveChannelPrice } from "@/erp/core/channelPricing";
import {
  compareProductShadow,
  erpCandidateStock,
  legacyAvailability,
  legacyPdvPrice,
  legacySitePrice,
  legacyWhatsappPrice,
} from "../../supabase/functions/_shared/erp/shadow-mode";

const now = new Date("2026-10-23T18:00:00Z").getTime();

describe("ERP shadow parity", () => {
  it("mantém site igual ao resolver canônico do ERP Core", () => {
    const p = { id: "1", price: 100, site_price: 90, promo_price: 80, site_promo_price: null };
    expect(resolveChannelPrice(p, "site", now).finalPrice).toBe(legacySitePrice(p, now));
  });

  it("mantém WhatsApp igual ao comportamento atual", () => {
    const p = {
      id: "1", price: 100, price_base: 95, promo_price: 85,
      whatsapp_price: 80, whatsapp_promo_price: 75,
      promotion_end: "2026-01-01T00:00:00Z",
    };
    expect(resolveChannelPrice(p, "whatsapp_ia", now).finalPrice).toBe(legacyWhatsappPrice(p));
  });

  it("mantém PDV igual ao comportamento atual e rejeita promoção acima da base", () => {
    const p = { id: "1", price: 100, pdv_price: 90, pdv_promo_price: 95 };
    expect(legacyPdvPrice(p, now)).toBe(90);
    expect(resolveChannelPrice(p, "pdv", now).finalPrice).toBe(90);
  });

  it("usa Trier como estoque candidato enquanto Trier for o mestre", () => {
    expect(erpCandidateStock({ id: "1", stock: 7, stock_quantity: 7, trier_stock_quantity: 7 })).toBe(7);
  });

  it("respeita bloqueios manuais e Trier na disponibilidade", () => {
    expect(legacyAvailability({ id: "1", stock: 10, trier_active: false })).toBe(false);
    expect(legacyAvailability({ id: "1", stock: 10, trier_active: false, force_active: true })).toBe(true);
    expect(legacyAvailability({ id: "1", stock: 10, manual_disabled: true })).toBe(false);
  });

  it("retorna zero divergências quando o candidato reproduz o legado", () => {
    const result = compareProductShadow({
      id: "1",
      name: "Produto teste",
      price: 100,
      price_base: 100,
      site_price: 90,
      whatsapp_price: 88,
      pdv_price: 95,
      stock: 12,
      stock_quantity: 12,
      trier_stock_quantity: 12,
      trier_active: true,
    }, now);
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });
});
