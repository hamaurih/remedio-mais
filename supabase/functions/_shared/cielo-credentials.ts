import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function getCieloCredentials(admin: SupabaseClient) {
  const envMerchantId = (Deno.env.get("CIELO_MERCHANT_ID") || "").trim();
  const envMerchantKey = (Deno.env.get("CIELO_MERCHANT_KEY") || "").trim();
  if (envMerchantId && envMerchantKey) {
    return { merchantId: envMerchantId, merchantKey: envMerchantKey, source: "env" as const };
  }

  const [idRes, keyRes] = await Promise.all([
    admin.rpc("get_private_payment_secret", { p_name: "CIELO_MERCHANT_ID" }),
    admin.rpc("get_private_payment_secret", { p_name: "CIELO_MERCHANT_KEY" }),
  ]);

  const merchantId = envMerchantId || String(idRes.data || "").trim();
  const merchantKey = envMerchantKey || String(keyRes.data || "").trim();
  return { merchantId, merchantKey, source: "vault" as const };
}
