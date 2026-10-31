import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const reorder = readFileSync("supabase/migrations/20261031214833_fix_crm_checkout_duplicate_cart_trigger_order.sql", "utf8");
const guard = readFileSync("supabase/migrations/20261031214951_prevent_crm_projection_blocking_checkout.sql", "utf8");
const baseCrm = readFileSync("supabase/migrations/20261031184500_crm_omnichannel_phase1.sql", "utf8");

describe("Checkout não pode ser bloqueado por sincronização do CRM", () => {
  it("mantém associação cart->order antes da projeção CRM", () => {
    expect(baseCrm).toContain("create trigger trg_crm_sync_order");
    expect(baseCrm).toContain("create trigger trg_crm_sync_cart");
    expect(reorder).toMatch(/ALTER TRIGGER trg_crm_sync_order ON public.orders RENAME TO trg_z_crm_sync_order/i);
    // PostgreSQL executes same-kind triggers alphabetically.
    expect("trg_sync_cart_funnel_from_order" < "trg_z_crm_sync_order").toBe(true);
    expect("trg_crm_sync_order" < "trg_sync_cart_funnel_from_order").toBe(true);
  });

  it("retém as projeções de pedido e carrinho, mas não propaga falha ao checkout", () => {
    for (const fn of ["private.crm_order_trigger", "private.crm_cart_trigger"]) {
      const start = guard.indexOf("CREATE OR REPLACE FUNCTION " + fn);
      expect(start).toBeGreaterThan(-1);
      const rest = guard.slice(start);
      expect(rest).toMatch(/exception when others then/i);
      expect(rest).toContain("crm_projection_nonblocking_failure");
      expect(rest).toMatch(/return new;/i);
    }
    expect(guard).toContain("perform private.crm_sync_order(new.id)");
    expect(guard).toContain("perform private.crm_sync_cart_session(new.id)");
  });

  it("não mexe em valores financeiros, inventário, pagamentos nem ERP transacional", () => {
    const sql = reorder + "\n" + guard;
    expect(sql).not.toMatch(/\\b(update|insert into|delete from|truncate)\\s+(?:public\\.)?(?:orders|products|order_items|payments|inventory_stock)\\b/i);
    expect(sql).not.toMatch(/alter table|drop trigger|disable trigger/i);
    expect(sql).not.toMatch(/trier|merchantkey|service_role_key/i);
  });
});
