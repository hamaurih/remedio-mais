import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PaymentRoutingError,
  resolvePaymentAdapter,
} from "../_shared/paymentProvider.ts";
import {
  resolveRequestTenant,
  TenantResolutionError,
} from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "Configuração interna incompleta." }, 500);
    }

    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "Sessão não encontrada." }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Body inválido." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const tenant = await resolveRequestTenant(admin, body);
    const resolved = await resolvePaymentAdapter(
      admin,
      tenant,
      body.payment_method,
      "BRL",
    );

    const targetUrl =
      `${supabaseUrl}/functions/v1/${resolved.functionName}`;
    const providerResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        apikey: anonKey,
        "Content-Type": "application/json",
        "x-payment-provider": resolved.providerKey,
      },
      body: JSON.stringify({
        ...body,
        organization_id: tenant.organizationId,
        store_id: tenant.storeId,
      }),
    });

    const providerBody = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      return json(
        {
          ...providerBody,
          provider: resolved.providerKey,
        },
        providerResponse.status,
      );
    }

    if (providerBody.qr_code_base64 || providerBody.qr_code) {
      return json({
        success: true,
        provider: resolved.providerKey,
        kind: "pix",
        order_id: providerBody.order_id,
        total: providerBody.total,
        pix: {
          qr_code: providerBody.qr_code,
          qr_code_base64: providerBody.qr_code_base64,
          ticket_url: providerBody.ticket_url,
          expires_at: providerBody.expires_at,
        },
      });
    }

    const redirectUrl =
      providerBody.redirect_url ?? providerBody.checkout_url;
    if (redirectUrl) {
      return json({
        success: true,
        provider: resolved.providerKey,
        kind: "redirect",
        order_id: providerBody.order_id ?? null,
        redirect_url: redirectUrl,
      });
    }

    return json({
      success: true,
      provider: resolved.providerKey,
      kind: "provider_response",
      order_id: providerBody.order_id ?? null,
      data: providerBody,
    });
  } catch (error) {
    const status =
      error instanceof TenantResolutionError ||
        error instanceof PaymentRoutingError
        ? error.status
        : 500;
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar o pagamento.",
      },
      status,
    );
  }
});
