// Calcula taxa de entrega por distância (Haversine) baseado em store_settings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

type Zone = { min_km: number; max_km: number; fee: number; label?: string };

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

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!lovableKey || !mapsKey) return null;
  const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": mapsKey,
    },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const loc = j?.results?.[0]?.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    let { lat, lng, address } = body as { lat?: number; lng?: number; address?: string };

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

    const distance = haversineKm(Number(s.store_lat), Number(s.store_lng), lat, lng);
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
