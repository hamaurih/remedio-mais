// Calcula taxa de entrega por distância usando Google Maps diretamente.
// A chave privada é lida primeiro do Supabase Vault por loja/configuração e nunca
// é enviada ao navegador. Há fallback para secrets de ambiente durante a transição.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Zone = { min_km: number; max_km: number; fee: number; label?: string };
type GeocodeResult = {
  ok: boolean;
  lat?: number;
  lng?: number;
  formatted_address?: string;
  partial_match?: boolean;
  error?: string;
};

function envMapsKey(): string {
  return String(
    Deno.env.get("GOOGLE_MAPS_SERVER_API_KEY") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY_1") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY") ||
    ""
  ).trim();
}

async function mapsKey(storeSettingsId: number): Promise<{ key: string; source: string }> {
  try {
    const { data, error } = await admin.rpc("get_private_store_integration_secret", {
      p_store_settings_id: storeSettingsId,
      p_provider: "google_maps",
      p_key: "server_api_key",
    });
    if (!error && data) return { key: String(data).trim(), source: "store_vault" };
  } catch (error) {
    console.error("maps vault lookup failed", error instanceof Error ? error.message : "unknown");
  }

  const fallback = envMapsKey();
  return { key: fallback, source: fallback ? "environment" : "none" };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function routeDistanceKm(
  key: string,
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ km: number | null; error?: string }> {
  if (!key) return { km: null, error: "maps_credentials_missing" };

  try {
    const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        languageCode: "pt-BR",
        regionCode: "BR",
      }),
    });

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const apiStatus = body?.error?.status || `HTTP_${r.status}`;
      console.error("Routes API recusou a rota", { status: r.status, apiStatus });
      return { km: null, error: `routes_${String(apiStatus).toLowerCase()}` };
    }

    const j = await r.json();
    const meters = j?.routes?.[0]?.distanceMeters;
    if (typeof meters !== "number") return { km: null, error: "no_route" };
    return { km: meters / 1000 };
  } catch (e: any) {
    console.error("Routes API erro", e?.message || "routes_error");
    return { km: null, error: "routes_error" };
  }
}

function addressCandidates(raw: string): string[] {
  const base = raw.replace(/\s+/g, " ").trim();
  const candidates = [base];

  if (!/campina\s+grande/i.test(base)) {
    candidates.push(`${base}, Campina Grande, PB, Brasil`);
  }

  if (/bodocongo/i.test(base) && !/bodocongó/i.test(base)) {
    candidates.push(base.replace(/bodocongo/gi, "Bodocongó"));
  }

  return [...new Set(candidates)];
}

async function geocodeAddress(address: string, key: string): Promise<GeocodeResult> {
  if (!key) return { ok: false, error: "maps_credentials_missing" };

  let lastStatus = "ZERO_RESULTS";
  for (const candidate of addressCandidates(address)) {
    try {
      const params = new URLSearchParams({
        address: candidate,
        region: "br",
        language: "pt-BR",
        components: "country:BR",
        key,
      });
      const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
      if (!r.ok) {
        lastStatus = `HTTP_${r.status}`;
        continue;
      }

      const j = await r.json();
      const status = String(j?.status || "UNKNOWN_ERROR");
      lastStatus = status;

      if (status === "OK" && j?.results?.[0]?.geometry?.location) {
        const first = j.results[0];
        return {
          ok: true,
          lat: Number(first.geometry.location.lat),
          lng: Number(first.geometry.location.lng),
          formatted_address: first.formatted_address || candidate,
          partial_match: Boolean(first.partial_match),
        };
      }

      if (status === "REQUEST_DENIED" || status === "OVER_DAILY_LIMIT") {
        return { ok: false, error: "maps_configuration_error" };
      }
    } catch (e: any) {
      console.error("Geocoding API erro", e?.message || "geocode_error");
      lastStatus = "NETWORK_ERROR";
    }
  }

  return {
    ok: false,
    error: lastStatus === "ZERO_RESULTS" ? "geocode_zero_results" : "geocode_failed",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const storeSettingsIdRaw = Number(body?.store_settings_id ?? 1);
    const storeSettingsId = Number.isInteger(storeSettingsIdRaw) && storeSettingsIdRaw > 0 ? storeSettingsIdRaw : 1;
    let { lat, lng } = body as { lat?: number; lng?: number };
    const { address } = body as { address?: string };

    const { data: s, error } = await admin
      .from("store_settings")
      .select("store_lat, store_lng, delivery_max_km, delivery_fee_zones, delivery_mode, delivery_fee")
      .eq("id", storeSettingsId)
      .maybeSingle();

    if (error || !s) return json({ ok: false, error: "settings_unavailable" }, 500);

    if (s.delivery_mode !== "distance") {
      return json({
        ok: true,
        mode: "flat",
        allowed: true,
        distance_km: null,
        fee: Number(s.delivery_fee || 0),
        zone_label: "Taxa fixa",
      });
    }

    const keyInfo = await mapsKey(storeSettingsId);
    let resolvedAddress: string | undefined;
    let partialMatch = false;

    if ((typeof lat !== "number" || typeof lng !== "number") && typeof address === "string" && address.trim()) {
      const geo = await geocodeAddress(address, keyInfo.key);
      if (!geo.ok || typeof geo.lat !== "number" || typeof geo.lng !== "number") {
        const configurationProblem = geo.error === "maps_credentials_missing" || geo.error === "maps_configuration_error";
        return json({
          ok: false,
          allowed: false,
          reason: geo.error || "geocode_failed",
          error: configurationProblem
            ? "Serviço de localização do Google não está configurado corretamente."
            : "Não foi possível localizar esse endereço. Confira rua, número, bairro, cidade e CEP.",
        });
      }
      lat = geo.lat;
      lng = geo.lng;
      resolvedAddress = geo.formatted_address;
      partialMatch = Boolean(geo.partial_match);
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
      return json({ ok: false, allowed: false, reason: "missing_coords", error: "Coordenadas ou endereço são obrigatórios." }, 400);
    }

    if (s.store_lat == null || s.store_lng == null) {
      return json({ ok: false, error: "store_origin_not_configured" }, 500);
    }

    const route = await routeDistanceKm(
      keyInfo.key,
      Number(s.store_lat),
      Number(s.store_lng),
      lat,
      lng,
    );
    const distanceSource = route.km != null ? "route" : "haversine";
    const distance = route.km ?? haversineKm(Number(s.store_lat), Number(s.store_lng), lat, lng);
    const maxKm = Number(s.delivery_max_km || 0);
    const distanceRounded = Math.round(distance * 10) / 10;

    const distanceMeta = {
      distance_km: distanceRounded,
      distance_source: distanceSource,
      distance_warning: route.km == null ? route.error : undefined,
      resolved_address: resolvedAddress,
      partial_match: partialMatch,
      maps_key_source: keyInfo.source,
    };

    if (maxKm > 0 && distance > maxKm) {
      return json({
        ok: true,
        mode: "distance",
        allowed: false,
        ...distanceMeta,
        fee: null,
        reason: "out_of_range",
        message: `Endereço a ${distanceRounded} km da loja — fora da área de entrega (máx. ${maxKm} km).`,
        lat,
        lng,
      });
    }

    const zones = (s.delivery_fee_zones as Zone[]) || [];
    const zone = zones.find((z) => distance >= Number(z.min_km) && distance <= Number(z.max_km));

    if (!zone) {
      return json({
        ok: true,
        mode: "distance",
        allowed: false,
        ...distanceMeta,
        fee: null,
        reason: "no_zone_match",
        message: `Nenhuma faixa de frete cobre ${distanceRounded} km.`,
        lat,
        lng,
      });
    }

    return json({
      ok: true,
      mode: "distance",
      allowed: true,
      ...distanceMeta,
      fee: Number(zone.fee),
      zone_label: zone.label || `${zone.min_km}–${zone.max_km} km`,
      lat,
      lng,
    });
  } catch (e: any) {
    console.error("calculate-delivery-fee erro", e?.message || "internal_error");
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
