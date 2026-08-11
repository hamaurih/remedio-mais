// Meta Conversions API (server-side). Central única de envio de eventos.
// O token vive apenas no secret META_CAPI_ACCESS_TOKEN e nunca chega ao navegador.
//
// Ações:
//  - track     : espelho de eventos do browser (allowlist, nunca Purchase)
//  - purchase  : Purchase real, idempotente por pedido (webhook/polling/admin)
//  - test      : Meta Test Events a partir do Admin (admin_test)
//  - status    : diagnóstico para o Admin (nunca expõe o token)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildUserData, loadMetaSettings, logEvent, sendToMeta, CURRENCY, type MetaEvent } from "../_shared/meta.ts";
import { safeError, safeLog } from "../_shared/mask.ts";

const BROWSER_ALLOWED = new Set([
  "PageView", "ViewContent", "Search", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Lead", "CompleteRegistration",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TOKEN = Deno.env.get("META_CAPI_ACCESS_TOKEN") || "";
  const admin = createClient(SUPABASE_URL, SERVICE);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as Record<string, unknown>).action || "track");

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isInternal = bearer === SERVICE;

    let isAdmin = false;
    let userId: string | null = null;
    let userEmail: string | null = null;
    if (!isInternal && bearer) {
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: claims } = await userClient.auth.getClaims(bearer);
      userId = (claims?.claims?.sub as string | undefined) ?? null;
      userEmail = (claims?.claims?.email as string | undefined) ?? null;
      if (userId) {
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
        isAdmin = (roles || []).some((r: Record<string, unknown>) => r.role === "admin");
      }
    }

    if (action === "status") {
      if (!isAdmin && !isInternal) return json({ error: "Forbidden" }, 403);
      const settings = await loadMetaSettings(admin);
      return json({
        token_configured: !!TOKEN,
        pixel_configured: !!settings?.pixel_id,
        meta_enabled: !!settings?.enabled,
        capi_enabled: !!settings?.capi_enabled,
        test_event_code_configured: !!settings?.test_event_code,
      });
    }

    const settings = await loadMetaSettings(admin);
    if (!settings || !settings.enabled) return json({ skipped: "meta_disabled" });
    if (!settings.capi_enabled) return json({ skipped: "capi_disabled" });
    if (!TOKEN) {
      safeError("[meta-capi] token ausente");
      return json({ error: "META_CAPI_ACCESS_TOKEN não configurado" }, 400);
    }

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const ua = req.headers.get("user-agent") || null;
    const now = Math.floor(Date.now() / 1000);

    // ------------------------------------------------------------------ track
    if (action === "track") {
      const eventName = String((body as Record<string, unknown>).event_name || "");
      const eventId = String((body as Record<string, unknown>).event_id || "");
      if (!BROWSER_ALLOWED.has(eventName) || !eventId) return json({ error: "Evento inválido" }, 400);

      const custom = sanitizeCustomData((body as Record<string, unknown>).custom_data);
      const userData = await buildUserData({
        email: userEmail,
        external_id: userId,
        fbp: (body as Record<string, unknown>).fbp as string | null,
        fbc: (body as Record<string, unknown>).fbc as string | null,
        client_ip_address: ip,
        client_user_agent: ua,
      });

      const event: MetaEvent = {
        event_name: eventName,
        event_time: now,
        event_id: eventId,
        event_source_url: safeUrl((body as Record<string, unknown>).event_source_url),
        action_source: "website",
        user_data: userData,
        custom_data: custom,
      };
      const r = await sendToMeta(settings, TOKEN, [event], true);
      await logEvent(admin, {
        event_name: eventName, event_id: eventId, source: "browser",
        value: typeof custom.value === "number" ? custom.value : null,
        test_mode: !!settings.test_event_code,
        status: r.ok ? "sent" : "error", http_status: r.http_status, response_masked: r.response,
      });
      return json({ ok: r.ok, http_status: r.http_status, event_id: eventId });
    }

    // --------------------------------------------------------------- purchase
    if (action === "purchase") {
      if (!isInternal && !isAdmin) return json({ error: "Forbidden" }, 403);
      const orderId = String((body as Record<string, unknown>).order_id || "");
      if (!orderId) return json({ error: "order_id obrigatório" }, 400);

      const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json({ error: "Pedido não encontrado" }, 404);
      if (order.payment_status !== "approved") return json({ skipped: "not_approved" });

      const eventId = `purchase:${orderId}`;
      // Idempotência: trava atômica pelo event_id único em meta_event_logs.
      const { error: lockErr } = await admin.from("meta_event_logs").insert({
        event_name: "Purchase", event_id: eventId, order_id: orderId, source: "server",
        status: "pending", value: Number(order.total ?? 0),
      });
      if (lockErr) {
        if (String(lockErr.message || "").includes("duplicate")) return json({ skipped: "already_sent", event_id: eventId });
        safeError("[meta-capi] lock falhou", { message: lockErr.message });
        return json({ error: "lock_failed" }, 500);
      }

      const { data: items } = await admin.from("order_items")
        .select("product_id, quantity, unit_price").eq("order_id", orderId);
      const contents = (items || []).map((i: Record<string, unknown>) => ({
        id: String(i.product_id), quantity: Number(i.quantity) || 1, item_price: Number(i.unit_price) || 0,
      }));

      const nameParts = String(order.customer_name || "").trim().split(/\s+/);
      const userData = await buildUserData({
        email: order.customer_email,
        phone: order.customer_phone,
        first_name: nameParts[0] || null,
        last_name: nameParts.length > 1 ? nameParts[nameParts.length - 1] : null,
        city: order.delivery_city,
        state: order.delivery_state,
        zip: order.delivery_cep,
        external_id: order.user_id,
        fbp: order.meta_fbp,
        fbc: order.meta_fbc,
        client_ip_address: ip,
        client_user_agent: ua,
      });

      const event: MetaEvent = {
        event_name: "Purchase",
        event_time: Math.floor(new Date(order.paid_at || order.created_at || Date.now()).getTime() / 1000),
        event_id: eventId,
        event_source_url: "https://atacadaodosmedicamentos.com.br/pedido/sucesso",
        action_source: "website",
        user_data: userData,
        // Somente dados comerciais: IDs, quantidades e valores. Nada clínico.
        custom_data: {
          currency: CURRENCY,
          value: Number(order.total ?? 0),
          order_id: orderId,
          content_type: "product",
          content_ids: contents.map((c) => c.id),
          contents,
          num_items: contents.reduce((s, c) => s + c.quantity, 0),
        },
      };

      const r = await sendToMeta(settings, TOKEN, [event], true);
      await admin.from("meta_event_logs").update({
        status: r.ok ? "sent" : "error", http_status: r.http_status,
        response_masked: r.response, sent_at: r.ok ? new Date().toISOString() : null,
      }).eq("event_id", eventId);
      if (r.ok) {
        await admin.from("orders").update({
          meta_purchase_event_id: eventId, meta_purchase_sent_at: new Date().toISOString(),
        }).eq("id", orderId);
      }
      safeLog("[meta-capi] purchase", { order_id: orderId, ok: r.ok, http_status: r.http_status });
      return json({ ok: r.ok, http_status: r.http_status, event_id: eventId, response: r.response });
    }

    // ------------------------------------------------------------------- test
    if (action === "test") {
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
      const eventName = String((body as Record<string, unknown>).event_name || "PageView");
      if (!["PageView", "ViewContent", "Purchase"].includes(eventName)) return json({ error: "Evento de teste inválido" }, 400);
      const eventId = `admintest:${eventName}:${crypto.randomUUID()}`;
      const userData = await buildUserData({ client_ip_address: ip, client_user_agent: ua });

      const custom: Record<string, unknown> = { currency: CURRENCY };
      if (eventName === "ViewContent") {
        Object.assign(custom, { content_type: "product", content_ids: ["TEST-PRODUCT"], content_name: "Produto de teste", value: 1 });
      }
      if (eventName === "Purchase") {
        // Valor fictício explícito — não altera nenhum pedido real.
        Object.assign(custom, {
          content_type: "product", content_ids: ["TEST-PRODUCT"],
          contents: [{ id: "TEST-PRODUCT", quantity: 1, item_price: 1.99 }],
          num_items: 1, value: 1.99, order_id: `TEST-${Date.now()}`,
        });
      }

      const event: MetaEvent = {
        event_name: eventName, event_time: now, event_id: eventId,
        event_source_url: "https://atacadaodosmedicamentos.com.br/admin/meta-ads",
        action_source: "website", user_data: userData, custom_data: custom,
      };
      const r = await sendToMeta(settings, TOKEN, [event], true);
      await logEvent(admin, {
        event_name: eventName, event_id: eventId, source: "admin_test",
        value: typeof custom.value === "number" ? custom.value : null,
        test_mode: !!settings.test_event_code,
        status: r.ok ? "sent" : "error", http_status: r.http_status, response_masked: r.response,
      });
      return json({
        ok: r.ok, http_status: r.http_status, event_id: eventId,
        response: r.response, test_event_code_used: !!settings.test_event_code, timestamp: new Date().toISOString(),
      });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    safeError("[meta-capi] unexpected", { message: (e as Error).message });
    return json({ error: "Erro interno" }, 500);
  }
});

/** Mantém só campos comerciais permitidos — bloqueia qualquer dado sensível/saúde. */
function sanitizeCustomData(input: unknown): Record<string, unknown> {
  const allowed = new Set([
    "currency", "value", "content_type", "content_ids", "contents", "content_name",
    "num_items", "search_string", "order_id", "payment_method",
  ]);
  const out: Record<string, unknown> = { currency: CURRENCY };
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

function safeUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  try {
    const u = new URL(v);
    return `${u.origin}${u.pathname}`; // sem query string (pode conter dados pessoais)
  } catch { return undefined; }
}
