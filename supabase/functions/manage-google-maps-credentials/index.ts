import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED = new Set([
  "https://atacadaodosmedicamentos.com.br",
  "https://www.atacadaodosmedicamentos.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.has(origin) ? origin : "https://atacadaodosmedicamentos.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(auth.slice(7));
  const userId = data?.user?.id;
  if (error || !userId) return null;

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  return (roles || []).some((r: any) => String(r.role) === "admin") ? userId : null;
}

function parseStoreSettingsId(value: unknown) {
  const n = Number(value ?? 1);
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

async function vaultStatus(storeSettingsId: number) {
  const { data, error } = await admin.rpc("store_integration_secret_status", {
    p_store_settings_id: storeSettingsId,
    p_provider: "google_maps",
  });
  if (error) throw error;
  return (data || { configured: false, updated_at: null }) as any;
}

async function vaultKey(storeSettingsId: number) {
  const { data, error } = await admin.rpc("get_private_store_integration_secret", {
    p_store_settings_id: storeSettingsId,
    p_provider: "google_maps",
    p_key: "server_api_key",
  });
  if (error) throw error;
  return String(data || "").trim();
}

function envKey() {
  return String(
    Deno.env.get("GOOGLE_MAPS_SERVER_API_KEY") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY_1") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY") ||
    ""
  ).trim();
}

async function effectiveKey(storeSettingsId: number) {
  const stored = await vaultKey(storeSettingsId);
  if (stored) return { key: stored, source: "store_vault" };
  const fallback = envKey();
  return { key: fallback, source: fallback ? "environment" : "none" };
}

async function status(storeSettingsId: number) {
  const stored = await vaultStatus(storeSettingsId);
  const envConfigured = !!envKey();
  return {
    configured: !!stored.configured || envConfigured,
    stored_configured: !!stored.configured,
    source: stored.configured ? "store_vault" : envConfigured ? "environment" : "none",
    updated_at: stored.updated_at || null,
  };
}

async function testKey(storeSettingsId: number) {
  const { key, source } = await effectiveKey(storeSettingsId);
  if (!key) return { ok: false, status: "missing", source, geocoding_ok: false, routes_ok: false };

  let geocodingOk = false;
  let routesOk = false;
  let geocodingStatus = "unknown";
  let routesStatus = "unknown";

  try {
    const params = new URLSearchParams({
      address: "Campina Grande, PB, Brasil",
      region: "br",
      language: "pt-BR",
      components: "country:BR",
      key,
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
    const body = await response.json().catch(() => ({}));
    geocodingStatus = String(body?.status || `HTTP_${response.status}`);
    geocodingOk = response.ok && geocodingStatus === "OK" && !!body?.results?.[0]?.geometry?.location;
  } catch {
    geocodingStatus = "NETWORK_ERROR";
  }

  try {
    const { data: store } = await admin
      .from("store_settings")
      .select("store_lat,store_lng")
      .eq("id", storeSettingsId)
      .maybeSingle();

    const originLat = Number(store?.store_lat ?? -7.236629);
    const originLng = Number(store?.store_lng ?? -35.922702);
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: originLat + 0.008, longitude: originLng + 0.008 } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        languageCode: "pt-BR",
        regionCode: "BR",
      }),
    });
    const body = await response.json().catch(() => ({}));
    routesStatus = response.ok ? "OK" : String(body?.error?.status || `HTTP_${response.status}`);
    routesOk = response.ok && typeof body?.routes?.[0]?.distanceMeters === "number";
  } catch {
    routesStatus = "NETWORK_ERROR";
  }

  return {
    ok: geocodingOk && routesOk,
    status: geocodingOk && routesOk ? "connected" : "configuration_error",
    source,
    geocoding_ok: geocodingOk,
    routes_ok: routesOk,
    geocoding_status: geocodingStatus,
    routes_status: routesStatus,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  if (!ANON_KEY || !SERVICE_KEY) return json(req, { error: "server_config_error" }, 503);
  if (!await requireAdmin(req)) return json(req, { error: "forbidden" }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "status");
    const storeSettingsId = parseStoreSettingsId(body?.store_settings_id);
    if (!storeSettingsId) return json(req, { error: "invalid_store_settings_id" }, 400);

    if (action === "status") {
      return json(req, { ok: true, ...(await status(storeSettingsId)) });
    }

    if (action === "save") {
      const key = typeof body?.server_api_key === "string" ? body.server_api_key.trim() : "";
      if (key.length < 20 || key.length > 512) return json(req, { error: "invalid_api_key" }, 400);

      const { error } = await admin.rpc("upsert_private_store_integration_secret", {
        p_store_settings_id: storeSettingsId,
        p_provider: "google_maps",
        p_key: "server_api_key",
        p_value: key,
      });
      if (error) throw error;

      return json(req, { ok: true, ...(await status(storeSettingsId)) });
    }

    if (action === "test") {
      return json(req, await testKey(storeSettingsId));
    }

    return json(req, { error: "invalid_action" }, 400);
  } catch (error) {
    console.error("manage-google-maps-credentials", error instanceof Error ? error.message : "unexpected");
    return json(req, { error: "internal_error" }, 500);
  }
});
