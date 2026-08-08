// Reembolso/estorno via Cielo API 3.0 (void) — total ou parcial.
// - Exige JWT válido
// - Apenas admin OU vendedor com can_execute_refund pode executar
// - Vendedor com can_request_refund (sem execute) apenas REGISTRA solicitação (status=pending)
// - Registra tudo em refund_requests + order_events
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { CIELO_BASES, toCents, type CieloEnv } from "../_shared/cielo.ts";
import { safeError } from "../_shared/mask.ts";

type Body = {
  order_id: string;
  amount?: number;
  reason?: string;
  idempotency_key?: string;
  mode?: "execute" | "request";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    let body: Body;
    try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
    if (!body?.order_id) return json({ error: "order_id obrigatório" }, 400);
    if (body.amount !== undefined && (typeof body.amount !== "number" || body.amount <= 0)) {
      return json({ error: "amount deve ser > 0" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    const isSeller = (roles || []).some((r: any) => r.role === "seller");
    if (!isAdmin && !isSeller) return json({ error: "Sem permissão" }, 403);

    let canExecute = isAdmin;
    let canRequest = isAdmin;
    if (!isAdmin) {
      const { data: perm } = await admin.from("seller_permissions").select("*").eq("user_id", userId).maybeSingle();
      canRequest = !!perm?.can_request_refund;
      canExecute = !!perm?.can_execute_refund;
    }

    const { data: order, error: oErr } = await admin.from("orders").select("*").eq("id", body.order_id).maybeSingle();
    if (oErr || !order) return json({ error: "Pedido não encontrado" }, 404);

    const paymentId = order.cielo_payment_id;
    if (!paymentId) return json({ error: "Pedido sem ID de pagamento Cielo" }, 400);
    if (!["approved", "partially_refunded"].includes(order.payment_status)) {
      return json({ error: `Pedido não pode ser reembolsado (payment_status=${order.payment_status})` }, 400);
    }

    const amount = body.amount;
    const isTotal = amount === undefined;
    const reqType = isTotal ? "total" : "partial";
    const idemKey = body.idempotency_key || `${body.order_id}:${reqType}:${amount ?? "all"}:${Date.now()}`;
    const wantsExecute = (body.mode || "execute") === "execute";

    const { data: rr, error: rrErr } = await admin.from("refund_requests").insert({
      order_id: order.id,
      payment_id: String(paymentId),
      requested_by: userId,
      reason: body.reason || null,
      type: reqType,
      amount: amount ?? order.total,
      status: "pending",
      idempotency_key: idemKey,
    }).select().maybeSingle();
    if (rrErr) {
      if (rrErr.code === "23505") return json({ error: "Solicitação duplicada (idempotency_key)" }, 409);
      return json({ error: rrErr.message }, 500);
    }

    if (!wantsExecute || !canExecute) {
      if (!canRequest && !canExecute) {
        await admin.from("refund_requests").update({ status: "denied", error_message: "Sem permissão" }).eq("id", rr!.id);
        return json({ error: "Sem permissão para solicitar reembolso" }, 403);
      }
      await admin.from("orders").update({ status: "reembolso_pendente" }).eq("id", order.id);
      await admin.from("order_events").insert({
        order_id: order.id, type: "refund_requested", message: `Reembolso ${reqType} solicitado`,
        created_by: userId, metadata: { refund_request_id: rr!.id, amount: amount ?? order.total },
      });
      await admin.from("admin_notifications").insert({
        type: "refund_requested", title: "Solicitação de reembolso",
        message: `Pedido ${order.id.slice(0, 8)} — ${reqType} ${amount ? "R$ " + amount.toFixed(2) : "total"}`,
        order_id: order.id, role_target: "admin", priority: "high",
        metadata: { refund_request_id: rr!.id },
      });
      return json({ ok: true, status: "pending", refund_request: rr });
    }

    await admin.from("refund_requests").update({ status: "processing" }).eq("id", rr!.id);

    const { data: pset } = await admin.from("payment_settings").select("environment").eq("id", 1).maybeSingle();
    const env: CieloEnv = ((pset as any)?.environment === "sandbox" ? "sandbox" : "production");
    const base = CIELO_BASES[env].transaction;

    const url = isTotal
      ? `${base}/1/sales/${paymentId}/void`
      : `${base}/1/sales/${paymentId}/void?amount=${toCents(amount!)}`;

    const resp = await fetch(url, {
      method: "PUT",
      headers: { "MerchantId": MERCHANT_ID, "MerchantKey": MERCHANT_KEY, "Content-Type": "application/json" },
    });
    const respJson = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg = Array.isArray(respJson)
        ? respJson.map((e: any) => `${e.Code}: ${e.Message}`).join("; ")
        : (respJson?.Message || `HTTP ${resp.status}`);
      safeError("[refund-cielo] void failed", { status: resp.status });
      await admin.from("refund_requests").update({
        status: "failed", error_message: String(msg),
        processed_by: userId, processed_at: new Date().toISOString(),
      }).eq("id", rr!.id);
      await admin.from("order_events").insert({
        order_id: order.id, type: "refund_failed",
        message: `Falha no reembolso Cielo: ${msg}`, created_by: userId,
        metadata: { refund_request_id: rr!.id },
      });
      return json({ error: "Falha na Cielo", detail: msg }, 502);
    }

    const cieloRefundId = respJson?.ReasonCode !== undefined
      ? (respJson?.Tid ? String(respJson.Tid) : String(paymentId))
      : String(paymentId);

    await admin.from("refund_requests").update({
      status: "completed",
      cielo_refund_id: cieloRefundId,
      processed_by: userId,
      processed_at: new Date().toISOString(),
    }).eq("id", rr!.id);

    const newPaymentStatus = isTotal ? "refunded" : "partially_refunded";
    const newOrderStatus = isTotal ? "reembolsado" : order.status;
    await admin.from("orders").update({
      payment_status: newPaymentStatus,
      status: newOrderStatus,
      cielo_status: respJson?.Status ?? order.cielo_status,
    }).eq("id", order.id);

    await admin.from("order_events").insert({
      order_id: order.id, type: "refund_completed",
      message: `Reembolso ${reqType} concluído na Cielo${amount ? ` (R$ ${amount.toFixed(2)})` : ""}`,
      created_by: userId,
      metadata: { refund_request_id: rr!.id, cielo_refund_id: cieloRefundId, amount: amount ?? order.total },
    });
    await admin.from("admin_notifications").insert({
      type: "refund_completed", title: "Reembolso concluído",
      message: `Pedido ${order.id.slice(0, 8)} — ${reqType} ${amount ? "R$ " + amount.toFixed(2) : "total"}`,
      order_id: order.id, role_target: "admin", priority: "normal",
      metadata: { refund_request_id: rr!.id, cielo_refund_id: cieloRefundId },
    });

    return json({ ok: true, status: "completed", refund_request_id: rr!.id, cielo_refund_id: cieloRefundId });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
