// Geocoda o endereço da loja e salva store_lat/store_lng. Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

// Traduz 403 do Google em mensagem administrativa clara (sem expor chave/headers).
function describeKeyError(details: Array<{ reason?: string }>): string {
  const reason = details.find((d) => d.reason)?.reason;
  if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
    return "A chave do Google Maps usada no servidor está com restrição de site (HTTP referrer) e por isso é recusada em chamadas server-side. Cadastre uma chave de servidor sem restrição de aplicativo (ou restrita por endereço IP).";
  }
  if (reason === "API_KEY_SERVICE_BLOCKED") {
    return "A chave do Google Maps não permite esta API. Habilite/permita a Geocoding API na lista de APIs da chave de servidor.";
  }
  return "O Google recusou a requisição (403). Verifique as restrições da chave de servidor no Google Cloud Console.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { address } = (await req.json().catch(() => ({}))) as { address?: string };
    let target = address?.trim();
    if (!target) {
      const { data: s } = await admin.from("store_settings").select("address").eq("id", 1).maybeSingle();
      target = (s?.address || "").trim();
    }
    if (!target) {
      return new Response(JSON.stringify({ error: "address_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY_1") || Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!mapsKey) {
      return new Response(JSON.stringify({ error: "maps_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(
      `${GEOCODING_URL}?address=${encodeURIComponent(target)}&region=br&key=${encodeURIComponent(mapsKey)}`
    );
    if (r.status === 403) {
      const body = await r.json().catch(() => ({}));
      const msg = describeKeyError(body?.error?.details ?? []);
      console.error("Geocode 403:", msg);
      return new Response(
        JSON.stringify({ error: "maps_key_denied", message: msg }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!r.ok) {
      const text = await r.text();
      console.error(`Geocode falhou [${r.status}]: ${text}`);
      return new Response(
        JSON.stringify({ error: "geocode_request_failed", status: r.status, message: "O Google recusou a requisição de geocodificação." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const j = await r.json();
    const loc = j?.results?.[0]?.geometry?.location;
    const formatted = j?.results?.[0]?.formatted_address;
    if (!loc) {
      return new Response(
        JSON.stringify({ error: "geocode_failed", details: j?.status, message: j?.error_message }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await admin
      .from("store_settings")
      .update({
        store_lat: loc.lat,
        store_lng: loc.lng,
        store_geocoded_at: new Date().toISOString(),
      })
      .eq("id", 1);

    return new Response(
      JSON.stringify({ ok: true, lat: loc.lat, lng: loc.lng, formatted_address: formatted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
