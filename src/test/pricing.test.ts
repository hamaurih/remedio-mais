import { describe, expect, it } from "vitest";
import { resolveSitePrice, isPromotionWindowActive } from "@/lib/pricing";

const now = new Date("2026-08-29T12:00:00Z").getTime();

describe("resolveSitePrice", () => {
  it("usa price quando não há nada mais", () => {
    const r = resolveSitePrice({ price: 100 }, null, now);
    expect(r.finalPrice).toBe(100);
    expect(r.hasDiscount).toBe(false);
    expect(r.comparePrice).toBeNull();
  });

  it("prioriza site_promo_price sobre promo_price", () => {
    const r = resolveSitePrice({ price: 100, promo_price: 90, site_promo_price: 80 }, null, now);
    expect(r.finalPrice).toBe(80);
    expect(r.source).toBe("site_promo_price");
    expect(r.comparePrice).toBe(100);
    expect(r.discountPercent).toBe(20);
  });

  it("usa promo_price quando não há site_promo_price", () => {
    const r = resolveSitePrice({ price: 100, promo_price: 75 }, null, now);
    expect(r.finalPrice).toBe(75);
    expect(r.discountPercent).toBe(25);
  });

  it("usa site_price como base de comparação", () => {
    const r = resolveSitePrice({ price: 100, site_price: 90, promo_price: 81 }, null, now);
    expect(r.finalPrice).toBe(81);
    expect(r.comparePrice).toBe(90);
    expect(r.discountPercent).toBe(10);
  });

  it("ignora promoção fora do período", () => {
    const r = resolveSitePrice(
      { price: 100, promo_price: 50, promotion_end: "2026-08-01T00:00:00Z" },
      null,
      now,
    );
    expect(r.finalPrice).toBe(100);
    expect(r.hasDiscount).toBe(false);
  });

  it("ignora promoção que ainda não começou", () => {
    const r = resolveSitePrice(
      { price: 100, site_promo_price: 50, promotion_start: "2026-09-01T00:00:00Z" },
      null,
      now,
    );
    expect(r.finalPrice).toBe(100);
  });

  it("ignora valores inválidos (0 / negativos)", () => {
    const r = resolveSitePrice({ price: 100, promo_price: 0, site_promo_price: -5 }, null, now);
    expect(r.finalPrice).toBe(100);
  });

  it("não trata promo maior que base como desconto", () => {
    const r = resolveSitePrice({ price: 100, promo_price: 120 }, null, now);
    expect(r.finalPrice).toBe(120);
    expect(r.hasDiscount).toBe(false);
  });

  it("respeita preços da variação selecionada", () => {
    const r = resolveSitePrice({ price: 100, promo_price: 90 }, { price: 200, promo_price: 150 }, now);
    expect(r.finalPrice).toBe(150);
    expect(r.comparePrice).toBe(200);
  });

  it("variação sem promo usa o preço da variação", () => {
    const r = resolveSitePrice({ price: 100, site_promo_price: 60 }, { price: 250 }, now);
    expect(r.finalPrice).toBe(250);
    expect(r.hasDiscount).toBe(false);
  });

  it("janela de promoção", () => {
    expect(isPromotionWindowActive({ promotion_start: "2026-08-01T00:00:00Z" }, now)).toBe(true);
    expect(isPromotionWindowActive({ promotion_end: "2026-08-01T00:00:00Z" }, now)).toBe(false);
  });
});
