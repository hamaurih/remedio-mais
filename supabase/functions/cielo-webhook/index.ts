// Webhook (Notification) da Cielo. A Cielo POSTa:
// { "PaymentId": "uuid", "ChangeType": <int> }
// Consultamos a query API para pegar o status real. Idempotência via payment_events.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { CIELO_BASES, mapCieloStatus, type CieloEnv } from "../_shared/cielo.ts";
import { safeError, safeLog, maskId } from "../_shared/mask.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MERCHANT_ID = Deno.env.get("CIELO_MERCHANT_ID");
  const MERCHANT_KEY = Deno.env.get("CIELO_MERCHANT_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE);

  try {
    if (!MERCHANT_ID || !MERCHANT_KEY) return new Response("ok", { headers: corsHeaders });

    const payload = req.method === "POST" ? await safeJson(req) : {};
    const paymentId = String(payload?.PaymentId || payload?.paymentId || "");
    const changeType = payload?.ChangeType ?? payload?.changeType ?? null;
    if (!paymentId) return new Response("ok", { headers: corsHeaders });

    // Idempotência
    const externalId = `cielo:${paymentId}:${changeType}`;
    const { error: insErr } = await admin.from("payment_events").insert({
      gateway: "cielo", event_type: `change_${changeType}`, external_id: externalId, payload,
    });
    if (insErr?.message?.includes("duplicate")) return new Response("ok", { headers: corsHeaders });

    // Descobre ambiente
    const { data: pset } = await admin.from("payment_settings").select("environment").eq("id", 1).maybeSingle();
    const env: CieloEnv = ((pset as any)?.environment === "sandbox" ? "sandbox" : "production");
    const base = CIELO_BASES[env].query;

    const r = await fetch(`${base}/1/sales/${paymentId}`, {
      headers: { "MerchantId": MERCHANT_ID, "MerchantKey": MERCHANT_KEY, "Content-Type": "application/json" },
    });
    if (!r.ok) {
      safeError("[cielo-webhook] query failed", { status: r.status, paymentId: maskId(paymentId) });
      return new Response("ok", { headers: corsHeaders });
    }
    const data = await r.json();
    const statusCode = Number(data?.Payment?.Status ?? 0);
    const newStatus = mapCieloStatus(statusCode);
    const amount = Number(data?.Payment?.Amount ?? 0) / 100; // cents → reais
    const merchantOrderId = data?.MerchantOrderId as string | undefined;

    safeLog("[cielo-webhook] fetched", { paymentId: maskId(paymentId), statusCode, newStatus, amount });

    // Localiza o pedido pelo MerchantOrderId (uuid) ou pelo cielo_payment_id gravado
    const { data: order } = await admin.from("orders").select("*")
      .or(`id.eq.${merchantOrderId},cielo_payment_id.eq.${paymentId}`)
      .maybeSingle();
    if (!order) {
      await admin.from("payment_events").update({ processed: true }).eq("external_id", externalId);
      return new Response("ok", { headers: corsHeaders });
    }

    // Divergência de valor bloqueia aprovação
    if (newStatus === "approved" && Math.abs(amount - Number(order.total)) > 0.5) {
      await admin.from("payment_errors").insert({
        stage: "webhook_amount", error_code: "amount_mismatch",
        message: `Valor pago R$ ${amount.toFixed(2)} difere do total R$ ${Number(order.total).toFixed(2)}`,
        payload_summary: { paymentId, paid: amount, expected: Number(order.total) },
        order_id: order.id,
      });
      await admin.from("orders").update({
        payment_status: "payment_review",
        cielo_payment_id: paymentId,
        cielo_status: statusCode,
      }).eq("id", order.id);
      await admin.from("admin_notifications").insert({
        type: "payment_review",
        title: "Pagamento em revisão — divergência de valor",
        message: `Pedido #${String(order.id).slice(0,6)}: pago R$ ${amount.toFixed(2)} ≠ esperado R$ ${Number(order.total).toFixed(2)}`,
        order_id: order.id,
      });
      await admin.from("payment_events").update({ processed: true, order_id: order.id }).eq("external_id", externalId);
      return new Response("ok", { headers: corsHeaders });
    }

    const update: Record<string, unknown> = {
      payment_status: newStatus,
      cielo_payment_id: paymentId,
      cielo_status: statusCode,
    };
    if (newStatus === "approved" && order.payment_status !== "approved") {
      update.order_status = "pago";
      update.status = "em_atendimento";
      update.paid_at = new Date().toISOString();
    }
    if ((newStatus === "cancelled" || newStatus === "rejected") && !order.cancelled_at) {
      update.cancelled_at = new Date().toISOString();
    }
    await admin.from("orders").update(update).eq("id", order.id);
    await admin.from("payment_events").update({ processed: true, order_id: order.id }).eq("external_id", externalId);

    if (newStatus === "approved" && order.payment_status !== "approved") {
      await admin.from("admin_notifications").insert({
        type: "order_paid",
        title: "Produto vendido",
        message: `Pedido #${String(order.id).slice(0, 6)} pago. Cliente: ${order.customer_name}. Total: R$ ${Number(order.total).toFixed(2)}.`,
        order_id: order.id,
      });
      try {
        const { data: tset } = await admin.from("trier_settings").select("auto_send_orders_enabled").eq("id", 1).maybeSingle();
        if ((tset as any)?.auto_send_orders_enabled && order.sales_channel === "site") {
          fetch(`${SUPABASE_URL}/functions/v1/send-order-to-trier`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE}`, "x-internal-source": "cielo-webhook" },
            body: JSON.stringify({ order_id: order.id }),
          }).catch(() => {});
        }
      } catch { /* ignore */ }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    safeError("[cielo-webhook] unexpected", { message: (e as Error).message });
    return new Response("ok", { headers: corsHeaders });
  }
});

async function safeJson(req: Request) { try { return await req.json(); } catch { return {}; } }
