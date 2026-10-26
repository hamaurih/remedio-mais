import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20261025205500_smart_replenishment_purchase_drafts.sql";
const pagePath = "src/pages/admin/AdminSmartPurchasing.tsx";

describe("smart replenishment purchase draft contract", () => {
  it("creates draft purchase orders only for authenticated admins", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("create_smart_purchase_drafts");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("public.has_role(auth.uid(), 'admin')");
    expect(sql).toContain("'draft'");
    expect(sql).toContain("grant execute on function public.create_smart_purchase_drafts(jsonb) to authenticated");
    expect(sql).toContain("revoke all on function public.create_smart_purchase_drafts(jsonb) from anon");
  });

  it("groups items by supplier and recalculates each purchase order", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("select distinct x.supplier_id");
    expect(sql).toContain("insert into public.purchase_orders");
    expect(sql).toContain("insert into public.purchase_order_items");
    expect(sql).toContain("private.recalculate_purchase_order(v_order_id)");
  });

  it("prevents duplicate open purchasing and validates supplier linkage", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("public.supplier_products");
    expect(sql).toContain("po.status in ('draft','approved','sent','partially_received')");
    expect(sql).toContain("já possuem pedido de compra em aberto");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("keeps human approval between recommendation and purchasing", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain("create_smart_purchase_drafts");
    expect(source).toContain("Gerar pedido");
    expect(source).toContain("Nenhum pedido é aprovado ou enviado automaticamente");
    expect(source).toContain("/admin/compras-operacionais");
  });
});
