// Geocoda o endereço da loja e salva store_lat/store_lng. Admin-only.
// Usa a chave privada da própria loja armazenada no Supabase Vault.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function envMapsKey(): string {
  return String(
    Deno.env.get("GOOGLE_MAPS_SERVER_API_KEY") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY_1") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY") ||
    ""
  ).trim();
}

async function mapsKey(storeSettingsId: number): Promise<string> {
  const { data, error } = await admin.rpc("get_private_store_integration_secret", {
    p_store_settings_id: storeSettingsId,
    p_provider: "google_maps",
    p_key: "server_api_key",
  });
  if (!error && data) return String(data).trim();
  return envMapsKey();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) return json({ error: "unauthorized" }, 401);

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const storeSettingsIdRaw = Number(body?.store_settings_id ?? 1);
    const storeSettingsId = Number.isInteger(storeSettingsIdRaw) && storeSettingsIdRaw > 0 ? storeSettingsIdRaw : 1;
    let target = typeof body?.address === "string" ? body.address.trim() : "";

    if (!target) {
      const { data: settings } = await admin
        .from("store_settings")
        .select("address")
        .eq("id", storeSettingsId)
        .maybeSingle();
      target = String(settings?.address || "").trim();
    }
    if (!target) return json({ error: "address_required" }, 400);

    const key = await mapsKey(storeSettingsId);
    if (!key) {
      return json({
        error: "maps_not_configured",
        message: "Cadastre a chave privada do Google Maps na aba Entrega antes de recalcular as coordenadas.",
      }, 422);
    }

    const params = new URLSearchParams({
      address: target,
      region: "br",
      language: "pt-BR",
      components: "country:BR",
      key,
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
    const result = await response.json().catch(() => ({}));
    const googleStatus = String(result?.status || `HTTP_${response.status}`);

    if (!response.ok || googleStatus !== "OK") {
      const configurationProblem = googleStatus === "REQUEST_DENIED" || googleStatus === "OVER_DAILY_LIMIT";
      return json({
        error: configurationProblem ? "maps_key_denied" : "geocode_failed",
        google_status: googleStatus,
        message: configurationProblem
          ? "A chave foi recusada pelo Google. Confira faturamento, Geocoding API e as restrições da chave de servidor."
          : "Não foi possível localizar o endereço da loja.",
      }, configurationProblem ? 422 : 404);
    }

    const first = result?.results?.[0];
    const loc = first?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      return json({ error: "geocode_failed", message: "O Google não retornou coordenadas para esse endereço." }, 404);
    }

    const { error: updateError } = await admin
      .from("store_settings")
      .update({
        store_lat: loc.lat,
        store_lng: loc.lng,
        store_geocoded_at: new Date().toISOString(),
      })
      .eq("id", storeSettingsId);
    if (updateError) throw updateError;

    return json({
      ok: true,
      lat: loc.lat,
      lng: loc.lng,
      formatted_address: first?.formatted_address || target,
      partial_match: Boolean(first?.partial_match),
    });
  } catch (e: any) {
    console.error("geocode-store-address", e?.message || "internal_error");
    return json({ error: "internal_error" }, 500);
  }
});
