import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = "supabase/migrations/20261025211000_professional_goods_receiving.sql";
const page = "src/pages/admin/AdminPurchaseOperations.tsx";

describe("professional goods receiving contract", () => {
  it("starts receiving only from approved operational purchase orders", () => {
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("start_goods_receipt_from_order");
    expect(sql).toContain("('approved','sent','partially_received')");
    expect(sql).toContain("quantity_ordered - poi.quantity_received");
    expect(sql).toContain("existing");
  });

  it("requires conference before posting stock", () => {
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("check_goods_receipt");
    expect(sql).toContain("status = 'checked'");
    expect(sql).toContain("O recebimento precisa ser conferido antes de lançar no estoque");
    expect(sql).toContain("checked_by = auth.uid()");
  });

  it("records quantity cost traceability and expiry divergences", () => {
    const sql = readFileSync(migration, "utf8");
    for (const marker of [
      "quantity_divergence",
      "cost_divergence",
      "traceability_missing",
      "expired",
      "discrepancy_summary",
      "checked_with_divergences",
    ]) expect(sql).toContain(marker);
  });

  it("blocks anonymous execution and keeps invoker security", () => {
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on function public.start_goods_receipt_from_order(uuid) from anon");
    expect(sql).toContain("revoke all on function public.check_goods_receipt(uuid,boolean) from anon");
  });
});

describe("professional receiving UI", () => {
  it("exposes receive conference and post as separate steps", () => {
    const source = readFileSync(page, "utf8");
    expect(source).toContain("start_goods_receipt_from_order");
    expect(source).toContain("check_goods_receipt");
    expect(source).toContain("Lançar no estoque");
    expect(source).toContain("Conferir recebimento");
    expect(source).toContain("Divergências");
  });

  it("captures invoice lot expiry quantity and cost", () => {
    const source = readFileSync(page, "utf8");
    for (const marker of [
      "supplier_invoice_number",
      "supplier_invoice_series",
      "supplier_invoice_access_key",
      "batch_number",
      "expiry_date",
      "unit_cost",
      "quantity",
    ]) expect(source).toContain(marker);
  });
});
