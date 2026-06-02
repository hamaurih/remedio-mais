// Webhook do Mercado Pago: idempotente, valida external_reference e atualiza o pedido.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!MP_TOKEN) return ok();
    const admin = createClient(SUPABASE_URL, SERVICE);

    const url = new URL(req.url);
    const payload = req.method === "POST" ? await safeJson(req) : {};
    const topic = (payload?.type || payload?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "").toString();
    const dataId = (payload?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "").toString();

    if (!dataId) return ok();

    // Idempotência
    const externalId = `${topic || "unknown"}:${dataId}`;
    const { error: insErr } = await admin.from("payment_events").insert({
      gateway: "mercado_pago", event_type: topic, external_id: externalId, payload,
    });
    if (insErr && !insErr.message.includes("duplicate")) {
      console.error("event insert error", insErr);
    }
    if (insErr?.message.includes("duplicate")) return ok();

    if (topic !== "payment" && topic !== "merchant_order") return ok();

    // Busca payment no MP
    let paymentId = dataId;
    let merchantOrderId: string | null = null;
    if (topic === "merchant_order") {
      const moRes = await fetch(`https://api.mercadopago.com/merchant_orders/${dataId}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` },
      });
      const mo = await moRes.json();
      merchantOrderId = String(mo.id);
      paymentId = mo.payments?.[0]?.id ? String(mo.payments[0].id) : "";
      if (!paymentId) return ok();
    }

    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    const pay = await payRes.json();
    if (!payRes.ok) {
      console.error("MP payment fetch error", pay);
      return ok();
    }

    const externalReference = pay.external_reference as string | undefined;
    if (!externalReference) return ok();

    const { data: order } = await admin.from("orders").select("*").eq("id", externalReference).maybeSingle();
    if (!order) return ok();

    // Mapeia status do MP -> nosso enum
    const map: Record<string, string> = {
      approved: "approved", authorized: "approved",
      pending: "pending", in_process: "pending", in_mediation: "pending",
      rejected: "rejected", cancelled: "cancelled", refunded: "refunded", charged_back: "refunded",
    };
    const newPaymentStatus = map[pay.status] ?? "pending";
    const valid = Number(pay.transaction_amount ?? 0);
    if (newPaymentStatus === "approved" && Math.abs(valid - Number(order.total)) > 0.5) {
      console.warn("valor divergente", { paid: valid, expected: order.total });
    }

    const update: Record<string, unknown> = {
      payment_status: newPaymentStatus,
      mercado_pago_payment_id: String(paymentId),
      mercado_pago_order_id: merchantOrderId ?? order.mercado_pago_order_id,
    };
    if (newPaymentStatus === "approved" && order.payment_status !== "approved") {
      update.order_status = "pago";
      update.status = "em_atendimento";
      update.paid_at = new Date().toISOString();
    }
    if (newPaymentStatus === "cancelled" || newPaymentStatus === "rejected") {
      update.cancelled_at = new Date().toISOString();
    }
    await admin.from("orders").update(update).eq("id", order.id);
    await admin.from("payment_events").update({ processed: true, order_id: order.id }).eq("external_id", externalId);

    // Notificação no admin
    if (newPaymentStatus === "approved" && order.payment_status !== "approved") {
      await admin.from("admin_notifications").insert({
        type: "order_paid",
        title: "Produto vendido",
        message: `Pedido #${String(order.id).slice(0, 6)} pago com sucesso. Cliente: ${order.customer_name}. Total: R$ ${Number(order.total).toFixed(2)}.`,
        order_id: order.id,
      });
    }
    return ok();
  } catch (e) {
    console.error("webhook error", e);
    return ok();
  }
});

function ok() { return new Response("ok", { status: 200, headers: corsHeaders }); }
async function safeJson(req: Request) { try { return await req.json(); } catch { return {}; } }
