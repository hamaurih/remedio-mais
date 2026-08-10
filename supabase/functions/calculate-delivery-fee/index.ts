// Calcula taxa de entrega por distância. Usa a Routes API (distância real por
// rota de carro) e cai para Haversine (linha reta) se a rota não estiver disponível.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

type Zone = { min_km: number; max_km: number; fee: number; label?: string };

function mapsHeaders() {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY_1") || Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!lovableKey || !mapsKey) return null;
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": mapsKey,
  } as Record<string, string>;
}

function describeKeyError(details: Array<{ reason?: string }>): string {
  const reason = details.find((d) => d.reason)?.reason;
  if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
    return "A chave do Google Maps usada no servidor tem restrição de site (HTTP referrer). No Google Cloud Console, use uma chave sem restrição de aplicativo (ou restrita por IP) para o servidor.";
  }
  if (reason === "API_KEY_SERVICE_BLOCKED") {
    return "A chave do Google Maps não permite esta API. Adicione Geocoding API e Routes API à lista de APIs permitidas da chave de servidor.";
  }
  return "O Google recusou a requisição (403). Verifique as restrições da chave de servidor no Google Cloud Console.";
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

// Distância real por rota (carro). Retorna null se indisponível.
async function routeDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ km: number | null; error?: string }> {
  const headers = mapsHeaders();
  if (!headers) return { km: null, error: "missing_maps_credentials" };
  try {
    const r = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        regionCode: "BR",
      }),
    });
    if (r.status === 403) {
      const body = await r.json().catch(() => ({}));
      return { km: null, error: describeKeyError(body?.error?.details ?? []) };
    }
    if (!r.ok) {
      const text = await r.text();
      console.error(`Routes API falhou [${r.status}]: ${text}`);
      return { km: null, error: `routes_${r.status}` };
    }
    const j = await r.json();
    const meters = j?.routes?.[0]?.distanceMeters;
    if (typeof meters !== "number") return { km: null, error: "no_route" };
    return { km: meters / 1000 };
  } catch (e: any) {
    console.error("Routes API erro:", e?.message);
    return { km: null, error: e?.message || "routes_error" };
  }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const headers = mapsHeaders();
  if (!headers) return null;
  const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br`;
  const r = await fetch(url, { headers });
  if (r.status === 403) {
    const body = await r.json().catch(() => ({}));
    console.error("Geocode 403:", describeKeyError(body?.error?.details ?? []));
    return null;
  }
  if (!r.ok) {
    console.error(`Geocode falhou [${r.status}]: ${await r.text()}`);
    return null;
  }
  const j = await r.json();
  const loc = j?.results?.[0]?.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    let { lat, lng } = body as { lat?: number; lng?: number };
    const { address } = body as { lat?: number; lng?: number; address?: string };

    if ((typeof lat !== "number" || typeof lng !== "number") && typeof address === "string" && address.trim()) {
      const geo = await geocodeAddress(address);
      if (!geo) {
        return new Response(
          JSON.stringify({ ok: false, allowed: false, reason: "geocode_failed", error: "Não foi possível localizar o endereço." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      lat = geo.lat;
      lng = geo.lng;
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(
        JSON.stringify({ ok: false, allowed: false, reason: "missing_coords", error: "Coordenadas ou endereço são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: s, error } = await supabase
      .from("store_settings")
      .select("store_lat, store_lng, delivery_max_km, delivery_fee_zones, delivery_mode, delivery_fee")
      .eq("id", 1)
      .maybeSingle();

    if (error || !s) {
      return new Response(JSON.stringify({ ok: false, error: "settings_unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo legado: taxa fixa
    if (s.delivery_mode !== "distance") {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: "flat",
          allowed: true,
          distance_km: null,
          fee: Number(s.delivery_fee || 0),
          zone_label: "Taxa fixa",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (s.store_lat == null || s.store_lng == null) {
      return new Response(JSON.stringify({ ok: false, error: "store_origin_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prioriza distância real por rota; se indisponível, usa linha reta.
    const route = await routeDistanceKm(Number(s.store_lat), Number(s.store_lng), lat, lng);
    const distanceSource = route.km != null ? "route" : "haversine";
    const distance = route.km ?? haversineKm(Number(s.store_lat), Number(s.store_lng), lat, lng);
    const maxKm = Number(s.delivery_max_km || 0);
    const distanceRounded = Math.round(distance * 10) / 10;

    if (maxKm > 0 && distance > maxKm) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: "distance",
          allowed: false,
          distance_km: distanceRounded,
          fee: null,
          reason: "out_of_range",
          message: `Endereço a ${distanceRounded} km da loja — fora da área de entrega (máx. ${maxKm} km).`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const zones = (s.delivery_fee_zones as Zone[]) || [];
    const zone = zones.find((z) => distance >= Number(z.min_km) && distance <= Number(z.max_km));

    if (!zone) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: "distance",
          allowed: false,
          distance_km: distanceRounded,
          fee: null,
          reason: "no_zone_match",
          message: `Nenhuma faixa de frete cobre ${distanceRounded} km.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode: "distance",
        allowed: true,
        distance_km: distanceRounded,
        fee: Number(zone.fee),
        zone_label: zone.label || `${zone.min_km}–${zone.max_km} km`,
        lat,
        lng,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
