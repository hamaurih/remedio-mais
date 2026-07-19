// Consulta status atualizado do pedido no Mercado Pago.
// Requer JWT válido. Acesso liberado para: dono do pedido (auth.uid() = order.user_id) ou admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveOrderTenant, TenantResolutionError, withTenant } from "../_shared/tenant.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!MP_TOKEN) return json({ error: "Mercado Pago não configurado" }, 500);

    // Authn
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id obrigatório" }, 400);

    const { tenant, order } = await resolveOrderTenant(admin, order_id);

    // Authz: dono do pedido ou membro administrativo da organização.
    const { data: membership } = await admin
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    const isAdmin = ["owner", "admin", "manager"].includes(membership?.role ?? "");
    if (!isAdmin && order.user_id !== userId) {
      return json({ error: "Forbidden" }, 403);
    }

    let status = order.payment_status as string;
    let paymentId = order.mercado_pago_payment_id as string | null;

    if (!paymentId && order.mercado_pago_preference_id) {
      const searchRes = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${order.id}`,
        { headers: { Authorization: `Bearer ${MP_TOKEN}` } },
      );
      const search = await searchRes.json();
      const first = search.results?.[0];
      if (first) paymentId = String(first.id);
    }

    if (paymentId) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` },
      });
      const pay = await r.json();
      if (r.ok) {
        const map: Record<string, string> = {
          approved: "approved", authorized: "approved",
          pending: "pending", in_process: "pending",
          rejected: "rejected", cancelled: "cancelled", refunded: "refunded",
        };
        status = map[pay.status] ?? status;
        const update: Record<string, unknown> = {
          payment_status: status, mercado_pago_payment_id: String(paymentId),
        };
        if (status === "approved" && order.payment_status !== "approved") {
          update.order_status = "pago";
          update.status = "em_atendimento";
          update.paid_at = new Date().toISOString();
          await admin.from("admin_notifications").insert(withTenant({
            type: "order_paid",
            title: "Produto vendido",
            message: `Pedido #${String(order.id).slice(0, 6)} pago. Cliente: ${order.customer_name}.`,
            order_id: order.id,
          }, tenant));
        }
        await admin.from("orders").update(update)
          .eq("id", order.id)
          .eq("organization_id", tenant.organizationId)
          .eq("store_id", tenant.storeId);
      }
    }

    return json({ order_id: order.id, payment_status: status });
  } catch (e) {
    const status = e instanceof TenantResolutionError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
