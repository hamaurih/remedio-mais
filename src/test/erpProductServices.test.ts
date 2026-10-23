import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveChannelPrice } from "@/erp/core/channelPricing";
import {
  canTrierWriteField,
  fieldAuthority,
  isSiteManualPriceField,
} from "@/erp/core/fieldAuthority";
import {
  buildProductReadModel,
  resolveReadInventory,
  resolveReadPrice,
} from "../../supabase/functions/_shared/erp/product-service";

const now = new Date("2026-10-23T18:00:00Z").getTime();

describe("product field authority", () => {
  it("blinda preço manual do site contra Trier", () => {
    expect(fieldAuthority("site_price")).toBe("erp_admin");
    expect(fieldAuthority("site_promo_price")).toBe("erp_admin");
    expect(canTrierWriteField("site_price")).toBe(false);
    expect(canTrierWriteField("site_promo_price")).toBe(false);
    expect(isSiteManualPriceField("site_price")).toBe(true);
  });

  it("mantém preço/estoque-base Trier apenas como transitórios", () => {
    expect(canTrierWriteField("price")).toBe(true);
    expect(canTrierWriteField("trier_stock_quantity")).toBe(true);
  });

  it("o sincronizador Trier atual não inclui site_price no conjunto de preço gravável", () => {
    const code = readFileSync("supabase/functions/trier/index.ts", "utf8");
    const base = code.match(/const FIELDS_BASE_PRICE = \[(.*?)\];/s)?.[1] || "";
    const promotion = code.match(/const FIELDS_PROMOTION = \[(.*?)\];/s)?.[1] || "";
    expect(base).not.toContain("site_price");
    expect(base).not.toContain("site_promo_price");
    expect(promotion).not.toContain("site_price");
    expect(promotion).not.toContain("site_promo_price");
  });
});

describe("ERP Product Service read model", () => {
  const row = {
    id: "p1",
    name: "Produto",
    price: 100,
    price_base: 100,
    promo_price: 85,
    site_price: 90,
    site_promo_price: null,
    whatsapp_price: 88,
    pdv_price: 95,
    stock: 10,
    stock_quantity: 10,
    trier_stock_quantity: 10,
    trier_active: true,
  };

  it("produz o mesmo preço efetivo que o ERP Core por canal", () => {
    expect(resolveReadPrice(row, "site", now).final_price).toBe(resolveChannelPrice(row, "site", now).finalPrice);
    expect(resolveReadPrice(row, "whatsapp_ia", now).final_price).toBe(resolveChannelPrice(row, "whatsapp_ia", now).finalPrice);
    expect(resolveReadPrice(row, "pdv", now).final_price).toBe(resolveChannelPrice(row, "pdv", now).finalPrice);
  });

  it("usa Trier como fonte de estoque durante a transição", () => {
    const inv = resolveReadInventory({ ...row, stock: 12, trier_stock_quantity: 11 });
    expect(inv.on_hand).toBe(11);
    expect(inv.source).toBe("trier");
  });

  it("bloqueio manual vence estoque positivo", () => {
    const inv = resolveReadInventory({ ...row, manual_disabled: true });
    expect(inv.sellable).toBe(false);
    expect(inv.available).toBe(0);
  });

  it("declara explicitamente a autoridade do preço do site no snapshot", () => {
    const model = buildProductReadModel(row, "site", now);
    expect(model.authority.site_price).toBe("erp_admin");
    expect(model.authority.site_promo_price).toBe("erp_admin");
    expect(model.read_only).toBe(true);
  });

  it("a Edge Function desta etapa permanece somente leitura", () => {
    const code = readFileSync("supabase/functions/erp-product-read/index.ts", "utf8");
    expect(code).not.toContain(".insert(");
    expect(code).not.toContain(".update(");
    expect(code).not.toContain(".delete(");
    expect(code).not.toContain(".upsert(");
  });
});
