import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PRODUCTION_PROJECT_REF,
  evaluateOrderWriteGuard,
  isOrderChannelEnabled,
} from "../../supabase/functions/_shared/erp/order-write-guard";

describe("ERP Order Command lifecycle", () => {
  it("mantém produção bloqueada mesmo com flag global ligada", () => {
    expect(evaluateOrderWriteGuard({
      supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      enabled: true,
      environment: "staging",
    })).toEqual({ allowed: false, reason: "production_blocked" });
  });

  it("exige allowlist explícita de canal", () => {
    expect(isOrderChannelEnabled("site", "")).toBe(false);
    expect(isOrderChannelEnabled("site", "pdv,whatsapp_ia")).toBe(false);
    expect(isOrderChannelEnabled("site", "site,pdv")).toBe(true);
  });

  it("precifica no servidor e não confia em unit_price enviado pelo cliente", () => {
    const code = readFileSync("supabase/functions/erp-order-command-staging/index.ts", "utf8");
    expect(code).toContain("buildProductReadModel");
    expect(code).toContain("normalizeOrderCommandPayload");
    expect(code).toContain("server_priced: true");
    expect(code).toContain("unit_price: unitPrice");
    expect(code).not.toContain("const unitPrice = Number(item?.unit_price)");
  });

  it("mantém ciclo reserva -> commit/release/expiração sem Cielo ou Trier", () => {
    const code = readFileSync("supabase/functions/erp-order-command-staging/index.ts", "utf8");
    expect(code).toContain('admin.rpc("erp_create_order_with_reservation"');
    expect(code).toContain('admin.rpc("commit_order_inventory_internal"');
    expect(code).toContain('admin.rpc("release_order_inventory_internal"');
    expect(code).toContain('admin.rpc("erp_expire_due_reservations"');
    expect(code).not.toContain("send-order-to-trier");
    expect(code).not.toContain("create-cielo");
  });

  it("usa política de fulfillment para expiração e rejeita produto duplicado", () => {
    const sql = readFileSync("docs/erp/sql/erp_create_order_with_reservation.sql", "utf8");
    expect(sql).toContain("public.fulfillment_policies");
    expect(sql).toContain("reservation_minutes");
    expect(sql).not.toContain("interval '15 minutes'");
    expect(sql).toContain("duplicate_item");
    expect(sql).toContain("erp_expire_due_reservations");
    expect(sql).toContain("release_order_inventory_internal");
  });
});
