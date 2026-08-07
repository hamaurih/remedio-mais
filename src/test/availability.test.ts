import { describe, it, expect } from "vitest";
import { shouldProductBeActive, productAvailabilityStatus } from "@/lib/availability";

describe("shouldProductBeActive", () => {
  it("estoque 0 => indisponível", () => {
    expect(shouldProductBeActive({ stock_quantity: 0 })).toBe(false);
  });
  it.each([1, 2, 3, 10, 15, 23])("estoque %i => disponível", (n) => {
    expect(shouldProductBeActive({ stock_quantity: n })).toBe(true);
  });
  it("estoque 1 + manual_disabled => indisponível", () => {
    expect(shouldProductBeActive({ stock_quantity: 1, manual_disabled: true })).toBe(false);
  });
  it("estoque 1 + trier_active=false => indisponível", () => {
    expect(shouldProductBeActive({ stock_quantity: 1, trier_active: false })).toBe(false);
  });
  it("estoque 1 + archived_at => indisponível", () => {
    expect(shouldProductBeActive({ stock_quantity: 1, archived_at: "2026-01-01" })).toBe(false);
  });
  it("0 -> 1 reativa e 3 -> 0 desativa", () => {
    const p = { trier_active: true, manual_disabled: false, archived_at: null };
    expect(shouldProductBeActive({ ...p, stock_quantity: 0 })).toBe(false);
    expect(shouldProductBeActive({ ...p, stock_quantity: 1 })).toBe(true);
    expect(shouldProductBeActive({ ...p, stock_quantity: 3 })).toBe(true);
    expect(shouldProductBeActive({ ...p, stock_quantity: 0 })).toBe(false);
  });
  it("flags legadas não bloqueiam", () => {
    expect(shouldProductBeActive({ stock_quantity: 1, ...({ is_active: false, ecommerce_enabled: false, sync_with_trier: false } as any) })).toBe(true);
  });
  it("usa stock quando stock_quantity é nulo", () => {
    expect(shouldProductBeActive({ stock_quantity: null, stock: 2 })).toBe(true);
  });
});

describe("productAvailabilityStatus", () => {
  it("estoque baixo continua Disponível", () => {
    expect(productAvailabilityStatus({ stock_quantity: 1 }).label).toBe("Disponível");
  });
  it("estoque 0 => Sem estoque", () => {
    expect(productAvailabilityStatus({ stock_quantity: 0 }).label).toBe("Sem estoque");
  });
  it("bloqueios exibem motivo", () => {
    expect(productAvailabilityStatus({ stock_quantity: 5, manual_disabled: true }).label).toBe("Bloqueado (manual)");
    expect(productAvailabilityStatus({ stock_quantity: 5, archived_at: "x" }).label).toBe("Arquivado");
    expect(productAvailabilityStatus({ stock_quantity: 5, trier_active: false }).label).toBe("Inativo no Trier");
  });
});
