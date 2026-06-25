// Consulta status de venda e-commerce no Trier
// GET /rest/integracao/venda/ecommerce/consultar-venda-v1
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { safeError, maskSensitiveData } from "../_shared/mask.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TRIER_TOKEN = Deno.env.get("TRIER_API_TOKEN");
const CONSULT_PATH = "/rest/integracao/venda/ecommerce/consultar-venda-v1";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supaUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await supaUser.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims) return json({ error: "Unauthorized" }, 401);
    const actorId = claimsRes.claims.sub as string;
    const { data: hasAdmin } = await admin.rpc("has_role", { _user_id: actorId, _role: "admin" });
    if (!hasAdmin) return json({ error: "Forbidden" }, 403);

    if (!TRIER_TOKEN) return json({ error: "TRIER_API_TOKEN ausente" }, 500);

    const body = await req.json().catch(() => ({}));
    const orderId = body?.order_id ? String(body.order_id) : null;
    let numeroPedido = body?.numeroPedido ? String(body.numeroPedido) : null;
    const numerosPedidos = body?.numerosPedidos as string[] | undefined;
    const numeroNota = body?.numeroNota ? String(body.numeroNota) : null;
    const limiteMensal = body?.limiteMensal ? Number(body.limiteMensal) : null;

    if (orderId && !numeroPedido) {
      const { data: o } = await admin.from("orders")
        .select("trier_order_id,id,trier_numero_nota").eq("id", orderId).maybeSingle();
      if (o) {
        numeroPedido = o.trier_order_id || String(o.id).replace(/-/g, "").slice(0, 20);
      }
    }

    const { data: settings } = await admin.from("trier_settings").select("base_url").eq("id", 1).maybeSingle();
    if (!settings) return json({ error: "trier_settings ausente" }, 500);

    const params = new URLSearchParams();
    if (numeroPedido) params.set("numeroPedido", numeroPedido);
    if (numerosPedidos?.length) params.set("numerosPedidos", numerosPedidos.join(","));
    if (numeroNota) params.set("numeroNota", numeroNota);
    if (limiteMensal) params.set("limiteMensal", String(limiteMensal));

    const url = `${settings.base_url.replace(/\/$/, "")}${CONSULT_PATH}?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Bearer ${TRIER_TOKEN}`, "Accept": "application/json" },
    });
    const text = await res.text();
    let resp: any = null;
    try { resp = text ? JSON.parse(text) : null; } catch { resp = { raw: text }; }

    if (orderId) {
      await admin.from("trier_order_logs").insert({
        order_id: orderId,
        action: "consult_sale",
        endpoint: CONSULT_PATH,
        http_status: res.status,
        status: res.ok ? "ok" : "error",
        request_payload_masked: maskSensitiveData({ numeroPedido, numerosPedidos, numeroNota, limiteMensal }) as any,
        response_payload_masked: maskSensitiveData(resp) as any,
        created_by: actorId,
      });
      await admin.from("orders").update({
        trier_last_status_check_at: new Date().toISOString(),
      }).eq("id", orderId);
    }

    return json({ ok: res.ok, http_status: res.status, response: resp });
  } catch (e) {
    safeError("[consult-trier-ecommerce-sale] error", { message: (e as Error)?.message });
    return json({ error: (e as Error)?.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
