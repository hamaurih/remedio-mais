import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type CieloCredentialEnvironment = "sandbox" | "production";

export function cieloCredentialNames(environment: CieloCredentialEnvironment) {
  return environment === "sandbox"
    ? {
        idEnv: "CIELO_SANDBOX_MERCHANT_ID",
        keyEnv: "CIELO_SANDBOX_MERCHANT_KEY",
        idVault: "CIELO_SANDBOX_MERCHANT_ID",
        keyVault: "CIELO_SANDBOX_MERCHANT_KEY",
      }
    : {
        idEnv: "CIELO_MERCHANT_ID",
        keyEnv: "CIELO_MERCHANT_KEY",
        idVault: "CIELO_MERCHANT_ID",
        keyVault: "CIELO_MERCHANT_KEY",
      };
}

export async function getCieloEnvironment(admin: SupabaseClient): Promise<CieloCredentialEnvironment> {
  const { data } = await admin
    .from("payment_settings")
    .select("environment")
    .eq("id", 1)
    .maybeSingle();

  return (data as any)?.environment === "sandbox" ? "sandbox" : "production";
}

export async function getCieloCredentials(admin: SupabaseClient) {
  const environment = await getCieloEnvironment(admin);
  const names = cieloCredentialNames(environment);

  const envMerchantId = (Deno.env.get(names.idEnv) || "").trim();
  const envMerchantKey = (Deno.env.get(names.keyEnv) || "").trim();

  const [idRes, keyRes] = await Promise.all([
    envMerchantId
      ? Promise.resolve({ data: envMerchantId, error: null })
      : admin.rpc("get_private_payment_secret", { p_name: names.idVault }),
    envMerchantKey
      ? Promise.resolve({ data: envMerchantKey, error: null })
      : admin.rpc("get_private_payment_secret", { p_name: names.keyVault }),
  ]);

  const merchantId = envMerchantId || String(idRes.data || "").trim();
  const merchantKey = envMerchantKey || String(keyRes.data || "").trim();

  return {
    merchantId,
    merchantKey,
    environment,
    source: (envMerchantId && envMerchantKey ? "env" : "vault") as "env" | "vault",
  };
}
