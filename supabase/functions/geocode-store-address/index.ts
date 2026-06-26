// Geocoda o endereço da loja e salva store_lat/store_lng. Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

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

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!lovableKey || !mapsKey) {
      return new Response(JSON.stringify({ error: "maps_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(
      `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(target)}&region=br`,
      {
        headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapsKey },
      }
    );
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
