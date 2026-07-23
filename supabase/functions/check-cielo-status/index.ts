// Consulta status atualizado do pedido diretamente na Cielo (query API).
// Requer JWT válido. Acesso: dono do pedido ou admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { CIELO_BASES, mapCieloStatus, type CieloEnv } from "../_shared/cielo.ts";
import { safeError } from "../_shared/mask.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MERCHANT_ID = Deno.env.get("CIELO_MERCHANT_ID");
    const MERCHANT_KEY = Deno.env.get("CIELO_MERCHANT_KEY");
    if (!MERCHANT_ID || !MERCHANT_KEY) return json({ error: "Cielo não configurada" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id obrigatório" }, 400);

    const { data: order } = await admin.from("orders").select("*").eq("id", order_id).maybeSingle();
    if (!order) return json({ error: "Pedido não encontrado" }, 404);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin && order.user_id !== userId) return json({ error: "Forbidden" }, 403);

    const paymentId = order.cielo_payment_id as string | null;
    if (!paymentId) return json({ order_id: order.id, payment_status: order.payment_status });

    const { data: pset } = await admin.from("payment_settings").select("environment").eq("id", 1).maybeSingle();
    const env: CieloEnv = ((pset as any)?.environment === "sandbox" ? "sandbox" : "production");
    const base = CIELO_BASES[env].query;

    const r = await fetch(`${base}/1/sales/${paymentId}`, {
      headers: { "MerchantId": MERCHANT_ID, "MerchantKey": MERCHANT_KEY, "Content-Type": "application/json" },
    });
    if (!r.ok) {
      safeError("[check-cielo] query failed", { status: r.status });
      return json({ order_id: order.id, payment_status: order.payment_status });
    }
    const data = await r.json();
    const statusCode = Number(data?.Payment?.Status ?? order.cielo_status ?? 0);
    const status = mapCieloStatus(statusCode);

    const update: Record<string, unknown> = { payment_status: status, cielo_status: statusCode };
    if (status === "approved" && order.payment_status !== "approved") {
      update.order_status = "pago";
      update.status = "em_atendimento";
      update.paid_at = new Date().toISOString();
      await admin.from("admin_notifications").insert({
        type: "order_paid",
        title: "Produto vendido",
        message: `Pedido #${String(order.id).slice(0, 6)} pago. Cliente: ${order.customer_name}.`,
        order_id: order.id,
      });
      // Dispara Trier
      try {
        const { data: tset } = await admin.from("trier_settings").select("auto_send_orders_enabled").eq("id", 1).maybeSingle();
        if ((tset as any)?.auto_send_orders_enabled) {
          fetch(`${SUPABASE_URL}/functions/v1/send-order-to-trier`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE}`, "x-internal-source": "check-cielo-status" },
            body: JSON.stringify({ order_id: order.id }),
          }).catch(() => {});
        }
      } catch { /* ignore */ }
    }
    if ((status === "cancelled" || status === "rejected") && !order.cancelled_at) {
      update.cancelled_at = new Date().toISOString();
    }
    await admin.from("orders").update(update).eq("id", order.id);

    return json({ order_id: order.id, payment_status: status });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
