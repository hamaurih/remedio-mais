import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20261025165000_inventory_management_engine.sql";

describe("inventory management SQL engine contract", () => {
  it("creates an admin-only inventory management RPC with safe grants", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("admin_inventory_management");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("public.has_role(auth.uid(), 'admin')");
    expect(sql).toContain("revoke all on function public.admin_inventory_management(integer, integer)");
    expect(sql).toContain("grant execute on function public.admin_inventory_management(integer, integer) to authenticated");
  });

  it("uses ABC consumption value, weighted rotation and supplier lead time with a safe fallback", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("units_30d");
    expect(sql).toContain("units_90d");
    expect(sql).toContain("0.7");
    expect(sql).toContain("0.3");
    expect(sql).toContain("lead_time_days");
    expect(sql).toContain("coalesce(sup.lead_time_days, 3)");
    expect(sql).toContain("80");
    expect(sql).toContain("95");
  });

  it("prefers the member store name before falling back to the tenant headquarters", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("member_store");
    expect(sql).toContain("coalesce(member_store.name, s.name, 'Unidade principal')");
  });

  it("returns one shared summary for operational inventory states", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const key of [
      "rupture_count",
      "critical_count",
      "replenishment_count",
      "excess_count",
      "no_rotation_count",
      "suggested_units",
    ]) {
      expect(sql).toContain(key);
    }
  });

  it("encodes the agreed A/B/C safety and coverage policy", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("when 'A' then 7");
    expect(sql).toContain("when 'B' then 5");
    expect(sql).toContain("when 'C' then 3");
    expect(sql).toContain("when 'A' then 21");
    expect(sql).toContain("when 'B' then 14");
    expect(sql).toContain("when 'C' then 7");
  });
});

describe("inventory management consumers", () => {
  for (const path of [
    "src/pages/admin/AdminHome.tsx",
    "src/pages/admin/AdminStock.tsx",
    "src/pages/admin/AdminSmartPurchasing.tsx",
    "src/pages/admin/AdminCurveABC.tsx",
  ]) {
    it(`${path} consumes the shared inventory engine`, () => {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("admin_inventory_management");
    });
  }

  it("removes the fixed stock <= 5 alert from the admin home", () => {
    const source = readFileSync("src/pages/admin/AdminHome.tsx", "utf8");
    expect(source).not.toContain('.lte("stock", 5)');
    expect(source).toContain("Rupturas de estoque");
    expect(source).toContain("Estoque crítico");
  });
});
