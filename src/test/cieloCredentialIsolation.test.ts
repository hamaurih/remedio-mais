import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Cielo credential isolation", () => {
  it("uses dedicated sandbox secret names without production fallback", () => {
    const helper = readFileSync("supabase/functions/_shared/cielo-credentials.ts", "utf8");
    expect(helper).toContain("CIELO_SANDBOX_MERCHANT_ID");
    expect(helper).toContain("CIELO_SANDBOX_MERCHANT_KEY");
    expect(helper).toContain('environment === "sandbox"');
    expect(helper).toContain("idVault: \"CIELO_SANDBOX_MERCHANT_ID\"");
    expect(helper).toContain("keyVault: \"CIELO_SANDBOX_MERCHANT_KEY\"");
    expect(helper).toContain("idVault: \"CIELO_MERCHANT_ID\"");
    expect(helper).toContain("keyVault: \"CIELO_MERCHANT_KEY\"");
    expect(helper).toContain('p_name: names.idVault');
    expect(helper).toContain('p_name: names.keyVault');
  });

  it("admin saves credentials into the currently selected environment", () => {
    const code = readFileSync("supabase/functions/manage-cielo-credentials/index.ts", "utf8");
    expect(code).toContain("cieloCredentialNames(environment)");
    expect(code).toContain("p_name:names.idVault");
    expect(code).toContain("p_name:names.keyVault");
    expect(code).toContain("production");
    expect(code).toContain("sandbox");
  });

  it("Vault allowlist includes sandbox keys but remains service-role only", () => {
    const sql = readFileSync(
      "supabase/migrations/20261024025000_erp_order_command_guarded_foundation.sql",
      "utf8",
    );
    expect(sql).toContain("CIELO_SANDBOX_MERCHANT_ID");
    expect(sql).toContain("CIELO_SANDBOX_MERCHANT_KEY");
    expect(sql).toContain("revoke all on function public.get_private_payment_secret(text) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.get_private_payment_secret(text) to service_role");
  });
});
