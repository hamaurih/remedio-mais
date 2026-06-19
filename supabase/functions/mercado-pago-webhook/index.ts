// Webhook do Mercado Pago: idempotente, valida HMAC x-signature, bloqueia divergência de valor.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { safeLog, safeError, maskId } from "../_shared/mask.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const MP_WEBHOOK_SECRET = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");
  const admin = createClient(SUPABASE_URL, SERVICE);

  try {
    if (!MP_TOKEN) return ok();

    const url = new URL(req.url);
    const payload = req.method === "POST" ? await safeJson(req) : {};
    const topic = (payload?.type || payload?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "").toString();
    const dataId = (payload?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "").toString();
    const xSignature = req.headers.get("x-signature") || "";
    const xRequestId = req.headers.get("x-request-id") || "";

    // ===== Validação de assinatura HMAC =====
    if (!MP_WEBHOOK_SECRET) {
      await logError(admin, "webhook_signature", "missing_webhook_secret", "MERCADO_PAGO_WEBHOOK_SECRET não configurado");
      return unauthorized();
    }
    if (!xSignature || !dataId) {
      await logError(admin, "webhook_signature", "invalid_webhook_signature", "x-signature ou data.id ausente");
      return unauthorized();
    }
    const parts = Object.fromEntries(
      xSignature.split(",").map((p) => {
        const [k, ...v] = p.trim().split("=");
        return [k, v.join("=")];
      }),
    );
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) {
      await logError(admin, "webhook_signature", "invalid_webhook_signature", "ts/v1 ausentes em x-signature");
      return unauthorized();
    }
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = await hmacSha256Hex(MP_WEBHOOK_SECRET, manifest);
    if (!timingSafeEqual(expected, v1)) {
      await logError(admin, "webhook_signature", "invalid_webhook_signature", "HMAC inválido", { dataId, topic });
      return unauthorized();
    }

    // Idempotência
    const externalId = `${topic || "unknown"}:${dataId}`;
    const { error: insErr } = await admin.from("payment_events").insert({
      gateway: "mercado_pago", event_type: topic, external_id: externalId, payload,
    });
    if (insErr && !insErr.message.includes("duplicate")) {
      safeError("[mp-webhook] event insert error", { code: insErr.code, message: insErr.message });
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
      safeError("[mp-webhook] MP payment fetch failed", { status: payRes.status, paymentId: maskId(String(paymentId)) });
      return ok();
    }

    safeLog("[mp-webhook] payment fetched", {
      payment_id: maskId(String(paymentId)),
      status: pay.status,
      external_reference: maskId(String(pay.external_reference ?? "")),
      transaction_amount: pay.transaction_amount,
    });

    const externalReference = pay.external_reference as string | undefined;
    if (!externalReference) return ok();

    const { data: order } = await admin.from("orders").select("*").eq("id", externalReference).maybeSingle();
    if (!order) return ok();

    const map: Record<string, string> = {
      approved: "approved", authorized: "approved",
      pending: "pending", in_process: "pending", in_mediation: "pending",
      rejected: "rejected", cancelled: "cancelled", refunded: "refunded", charged_back: "refunded",
    };
    let newPaymentStatus = map[pay.status] ?? "pending";
    const valid = Number(pay.transaction_amount ?? 0);
    const amountMismatch = newPaymentStatus === "approved" && Math.abs(valid - Number(order.total)) > 0.5;

    if (amountMismatch) {
      // Bloqueia aprovação por divergência de valor
      await logError(admin, "webhook_amount", "amount_mismatch",
        `Valor pago R$ ${valid.toFixed(2)} difere do total esperado R$ ${Number(order.total).toFixed(2)}`,
        { paymentId, orderId: order.id, paid: valid, expected: Number(order.total) }, order.id);
      await admin.from("orders").update({
        payment_status: "payment_review",
        mercado_pago_payment_id: String(paymentId),
        mercado_pago_order_id: merchantOrderId ?? order.mercado_pago_order_id,
      }).eq("id", order.id);
      await admin.from("payment_events").update({ processed: true, order_id: order.id }).eq("external_id", externalId);
      await admin.from("admin_notifications").insert({
        type: "payment_review",
        title: "Pagamento em revisão — divergência de valor",
        message: `Pedido #${String(order.id).slice(0,6)}: pago R$ ${valid.toFixed(2)} ≠ esperado R$ ${Number(order.total).toFixed(2)}`,
        order_id: order.id,
      });
      return ok();
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
    safeError("[mp-webhook] unexpected error", { message: (e as Error)?.message });
    return ok();
  }
});

function ok() { return new Response("ok", { status: 200, headers: corsHeaders }); }
function unauthorized() { return new Response("unauthorized", { status: 401, headers: corsHeaders }); }
async function safeJson(req: Request) { try { return await req.json(); } catch { return {}; } }

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function logError(
  admin: ReturnType<typeof createClient>,
  stage: string, code: string, message: string,
  summary?: Record<string, unknown>, orderId?: string,
) {
  try {
    await admin.from("payment_errors").insert({
      stage, error_code: code, message,
      payload_summary: summary ?? null,
      order_id: orderId ?? null,
    });
  } catch (e) { safeError("[mp-webhook] payment_errors log failed", { message: (e as Error)?.message }); }
}
