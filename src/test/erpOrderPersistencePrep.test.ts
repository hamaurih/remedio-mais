import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PRODUCTION_PROJECT_REF,
  evaluateOrderWriteGuard,
  extractSupabaseProjectRef,
} from "../../supabase/functions/_shared/erp/order-write-guard";

describe("ERP order persistence guard", () => {
  it("extrai project ref corretamente", () => {
    expect(extractSupabaseProjectRef("https://abc123.supabase.co")).toBe("abc123");
  });

  it("bloqueia produção mesmo com flag ligada", () => {
    const out = evaluateOrderWriteGuard({
      supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      enabled: true,
      environment: "staging",
    });
    expect(out).toEqual({ allowed: false, reason: "production_blocked" });
  });

  it("bloqueia quando feature flag está desligada", () => {
    const out = evaluateOrderWriteGuard({
      supabaseUrl: "https://homologacao.supabase.co",
      enabled: false,
      environment: "staging",
    });
    expect(out).toEqual({ allowed: false, reason: "disabled" });
  });

  it("bloqueia ambiente que não seja staging", () => {
    const out = evaluateOrderWriteGuard({
      supabaseUrl: "https://homologacao.supabase.co",
      enabled: true,
      environment: "production",
    });
    expect(out).toEqual({ allowed: false, reason: "not_staging" });
  });

  it("libera somente project ref não produtivo + staging + flag", () => {
    const out = evaluateOrderWriteGuard({
      supabaseUrl: "https://homologacao.supabase.co",
      enabled: true,
      environment: "staging",
    });
    expect(out).toEqual({ allowed: true, projectRef: "homologacao" });
  });

  it("Edge Function não escreve diretamente e não chama Cielo/Trier", () => {
    const code = readFileSync("supabase/functions/erp-order-command-staging/index.ts", "utf8");
    expect(code).not.toContain(".insert(");
    expect(code).not.toContain(".update(");
    expect(code).not.toContain(".delete(");
    expect(code).not.toContain("send-order-to-trier");
    expect(code).not.toContain("create-cielo");
    expect(code).toContain('admin.rpc("erp_create_order_with_reservation"');
  });

  it("SQL candidato usa SECURITY INVOKER e revoga clientes", () => {
    const sql = readFileSync("docs/erp/sql/erp_create_order_with_reservation.sql", "utf8");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on function public.erp_create_order_with_reservation(jsonb) from anon");
    expect(sql).toContain("grant execute on function public.erp_create_order_with_reservation(jsonb) to service_role");
  });
});
