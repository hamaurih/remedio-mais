// Cria pedido pendente + pagamento Pix via Mercado Pago Payments API (/v1/payments).
// Devolve QR Code (base64 + copia e cola) para exibir no próprio site.
import { createClient } from "npm:@supabase/supabase-js@2";
import { safeLog as maskedLog, safeError } from "../_shared/mask.ts";
import { resolveRequestTenant, TenantResolutionError, withTenant } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CartItem = { id: string; variant_id?: string | null; quantity: number };
type Body = {
  organization_id?: string;
  store_id?: string;
  items: CartItem[];
  delivery_type: "pickup" | "delivery";
  customer: { name: string; email: string; phone: string; cpf: string };
  delivery?: {
    cep?: string; street?: string; number?: string; complement?: string;
    neighborhood?: string; city?: string; state?: string; reference?: string;
    lat?: number; lng?: number; place_id?: string;
  };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function safeLog(label: string, data: Record<string, unknown>) {
  maskedLog(`[mp-pix] ${label}`, data);
}
function onlyDigits(s: string) { return (s || "").replace(/\D/g, ""); }
function splitName(full: string): { first: string; last: string } {
  const parts = (full || "").trim().split(/\s+/);
  if (parts.length === 0) return { first: "Cliente", last: "Atacadao" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")!;
  if (!SUPABASE_URL || !ANON || !SERVICE || !MP_TOKEN) {
    return json({ success: false, error: "Configuração de pagamento incompleta." }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ success: false, error: "Sessão não encontrada. Faça login." }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ success: false, error: "Sessão inválida ou expirada." }, 401);
  }
  const userId = claimsData.claims.sub as string;
  const userEmail = (claimsData.claims.email as string | undefined) ?? "";

  // Body
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return json({ success: false, error: "Não foi possível ler os dados." }, 400); }

  let tenant;
  try {
    tenant = await resolveRequestTenant(admin, body);
  } catch (error) {
    const status = error instanceof TenantResolutionError ? error.status : 500;
    return json({ success: false, error: error instanceof Error ? error.message : "Loja inválida." }, status);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return json({ success: false, error: "Carrinho vazio." }, 400);
  }
  const cpf = onlyDigits(body.customer?.cpf || "");
  if (cpf.length !== 11) {
    return json({ success: false, error: "CPF é obrigatório para pagamento via Pix. Preencha o CPF na etapa Seus dados." }, 400);
  }
  if (!body.customer?.email) {
    return json({ success: false, error: "E-mail é obrigatório para Pix." }, 400);
  }
  if (!["pickup", "delivery"].includes(body.delivery_type)) {
    return json({ success: false, error: "Tipo de entrega inválido." }, 400);
  }
  if (body.delivery_type === "delivery") {
    const d = body.delivery ?? {};
    if (!d.cep || !d.street || !d.number || !d.neighborhood || !d.city || !d.state) {
      return json({ success: false, error: "Endereço de entrega incompleto." }, 400);
    }
  }

  // Produtos + variações
  const ids = body.items.map((i) => i.id);
  const variantIds = body.items.map((i) => i.variant_id).filter(Boolean) as string[];

  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id,name,slug,price,promo_price,image_url,stock,active,controlled,requires_prescription,cart_quantity_limit,has_variants")
    .eq("organization_id", tenant.organizationId)
    .eq("store_id", tenant.storeId)
    .in("id", ids);
  if (prodErr) return json({ success: false, error: "Falha ao carregar produtos." }, 500);

  let variantsById = new Map<string, any>();
  if (variantIds.length) {
    const { data: variants } = await admin
      .from("product_variants")
      .select("id,parent_product_id,variation_type,variation_value,price,promo_price,stock,image_url,active")
      .eq("organization_id", tenant.organizationId)
      .eq("store_id", tenant.storeId)
      .in("id", variantIds);
    variantsById = new Map((variants || []).map((v: any) => [v.id, v]));
  }
  const byId = new Map((products || []).map((p: any) => [p.id, p]));

  const orderItems: any[] = [];
  let subtotal = 0;
  for (const ci of body.items) {
    const p: any = byId.get(ci.id);
    if (!p || !p.active) return json({ success: false, error: `Produto indisponível.` }, 400);
    let variant: any = null;
    if (ci.variant_id) {
      variant = variantsById.get(ci.variant_id);
      if (!variant || !variant.active || variant.parent_product_id !== p.id) {
        return json({ success: false, error: `Variação inválida para ${p.name}.` }, 400);
      }
    } else if (p.has_variants) {
      return json({ success: false, error: `Selecione uma opção para: ${p.name}.` }, 400);
    }
    const stock = variant ? (variant.stock ?? 0) : (p.stock ?? 0);
    if (stock <= 0) return json({ success: false, error: `Sem estoque: ${p.name}.` }, 400);

    if (p.controlled || p.requires_prescription) {
      const { data: rx } = await admin.from("prescriptions").select("id")
        .eq("organization_id", tenant.organizationId).eq("store_id", tenant.storeId)
        .eq("user_id", userId).eq("product_id", p.id).eq("status", "aprovada")
        .limit(1).maybeSingle();
      if (!rx) return json({ success: false, error: `É necessária receita aprovada para: ${p.name}.` }, 400);
    }

    const qty = Math.max(1, Math.min(ci.quantity | 0, p.cart_quantity_limit ?? 99, stock));
    const unit = Number(variant ? (variant.promo_price ?? variant.price ?? p.promo_price ?? p.price) : (p.promo_price ?? p.price));
    if (!Number.isFinite(unit) || unit <= 0) return json({ success: false, error: `Preço inválido: ${p.name}.` }, 400);
    const line = unit * qty;
    subtotal += line;
    const variantLabel = variant ? `${(variant.variation_type || "tamanho").replace(/^./, (c: string) => c.toUpperCase())}: ${variant.variation_value}` : null;
    orderItems.push({
      product_id: p.id, variant_id: variant?.id ?? null, variant_label: variantLabel,
      product_name: variant ? `${p.name} — ${variantLabel}` : p.name,
      product_image_url: variant?.image_url || p.image_url,
      quantity: qty, unit_price: unit, total: line,
      requires_prescription: !!p.requires_prescription, controlled: !!p.controlled,
    });
  }

  // Frete
  const { data: settings } = await admin.from("store_settings")
    .select("delivery_fee, delivery_mode, delivery_max_km, delivery_fee_zones, store_lat, store_lng")
    .eq("organization_id", tenant.organizationId)
    .eq("store_id", tenant.storeId)
    .maybeSingle();
  let deliveryFee = 0;
  if (body.delivery_type === "delivery") {
    const mode = (settings as any)?.delivery_mode || "flat";
    if (mode === "distance" && (settings as any)?.store_lat != null && (settings as any)?.store_lng != null) {
      const cLat = body.delivery?.lat, cLng = body.delivery?.lng;
      if (typeof cLat !== "number" || typeof cLng !== "number") {
        return json({ success: false, error: "Endereço sem coordenadas. Volte e selecione novamente o endereço." }, 400);
      }
      const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
      const sLat = Number((settings as any).store_lat), sLng = Number((settings as any).store_lng);
      const dLat = toRad(cLat - sLat), dLng = toRad(cLng - sLng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(sLat)) * Math.cos(toRad(cLat)) * Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const maxKm = Number((settings as any).delivery_max_km || 0);
      if (maxKm > 0 && dist > maxKm) return json({ success: false, error: `Fora da área de entrega (${dist.toFixed(1)} km).` }, 400);
      const zones = ((settings as any).delivery_fee_zones || []) as Array<{ min_km: number; max_km: number; fee: number }>;
      const zone = zones.find((z) => dist >= Number(z.min_km) && dist <= Number(z.max_km));
      if (!zone) return json({ success: false, error: `Sem faixa de frete para ${dist.toFixed(1)} km.` }, 400);
      deliveryFee = Number(zone.fee);
    } else {
      deliveryFee = Number((settings as any)?.delivery_fee ?? 0);
    }
  }
  const total = Number((subtotal + deliveryFee).toFixed(2));
  if (!Number.isFinite(total) || total <= 0) return json({ success: false, error: "Total inválido." }, 400);

  // Criar pedido
  const { data: order, error: orderErr } = await admin.from("orders").insert(withTenant({
    user_id: userId,
    customer_name: body.customer.name,
    customer_email: body.customer.email || userEmail,
    customer_phone: body.customer.phone,
    customer_cpf: cpf,
    customer_address: body.delivery_type === "delivery"
      ? [body.delivery?.street, body.delivery?.number, body.delivery?.neighborhood, body.delivery?.city, body.delivery?.state].filter(Boolean).join(", ")
      : null,
    delivery_method: body.delivery_type,
    delivery_type: body.delivery_type,
    delivery_cep: body.delivery?.cep ?? null,
    delivery_street: body.delivery?.street ?? null,
    delivery_number: body.delivery?.number ?? null,
    delivery_complement: body.delivery?.complement ?? null,
    delivery_neighborhood: body.delivery?.neighborhood ?? null,
    delivery_city: body.delivery?.city ?? null,
    delivery_state: body.delivery?.state ?? null,
    delivery_reference: body.delivery?.reference ?? null,
    delivery_fee: deliveryFee, subtotal, total,
    status: "novo", payment_gateway: "mercado_pago", payment_method: "pix",
    payment_status: "pending", order_status: "aguardando_pagamento", trier_sent: false,
  }, tenant)).select().single();
  if (orderErr || !order) {
    safeError("[mp-pix] order insert failed", { msg: orderErr?.message });
    return json({ success: false, error: "Não foi possível criar o pedido." }, 500);
  }

  const itemsRows = orderItems.map((it) => withTenant({ ...it, order_id: order.id }, tenant));
  const { error: itErr } = await admin.from("order_items").insert(itemsRows);
  if (itErr) {
    await admin.from("orders").delete().eq("id", order.id)
      .eq("organization_id", tenant.organizationId)
      .eq("store_id", tenant.storeId);
    return json({ success: false, error: "Não foi possível gravar itens." }, 500);
  }

  // Chamada Pix /v1/payments
  const { first, last } = splitName(body.customer.name);
  const expiration = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  // ISO com offset (-03:00)
  const pad = (n: number) => String(n).padStart(2, "0");
  const exp = expiration;
  const dateOfExpiration =
    `${exp.getUTCFullYear()}-${pad(exp.getUTCMonth() + 1)}-${pad(exp.getUTCDate())}T${pad(exp.getUTCHours())}:${pad(exp.getUTCMinutes())}:${pad(exp.getUTCSeconds())}.000-00:00`;

  const description = orderItems.length === 1
    ? orderItems[0].product_name
    : `Pedido ${order.id.slice(0, 8)} • ${orderItems.length} itens`;

  const mpBody = {
    transaction_amount: total,
    description: description.slice(0, 120),
    payment_method_id: "pix",
    external_reference: order.id,
    notification_url: `${SUPABASE_URL}/functions/v1/mercado-pago-webhook`,
    date_of_expiration: dateOfExpiration,
    payer: {
      email: body.customer.email || userEmail,
      first_name: first.slice(0, 30),
      last_name: last.slice(0, 60),
      identification: { type: "CPF", number: cpf },
    },
  };

  safeLog("mp_request", { order_id: order.id, total, expires: dateOfExpiration });

  let mpRes: Response;
  try {
    mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_TOKEN}`,
        "X-Idempotency-Key": `order-${order.id}`,
      },
      body: JSON.stringify(mpBody),
    });
  } catch (e) {
    await admin.from("orders").update({ payment_status: "rejected", cancelled_at: new Date().toISOString() }).eq("id", order.id)
      .eq("organization_id", tenant.organizationId)
      .eq("store_id", tenant.storeId);
    return json({ success: false, error: "Falha ao contatar Mercado Pago.", details: (e as Error).message }, 502);
  }
  const text = await mpRes.text();
  let mp: any = null;
  try { mp = JSON.parse(text); } catch { mp = { raw: text }; }

  if (!mpRes.ok) {
    safeError("[mp-pix] mp rejected", { status: mpRes.status, body: mp });
    await admin.from("orders").update({ payment_status: "rejected", cancelled_at: new Date().toISOString() }).eq("id", order.id)
      .eq("organization_id", tenant.organizationId)
      .eq("store_id", tenant.storeId);
    return json({
      success: false,
      error: mp?.message ? `Mercado Pago: ${mp.message}` : "Mercado Pago rejeitou o pagamento Pix.",
      details: mp?.cause || mp,
    }, 502);
  }

  const qr = mp?.point_of_interaction?.transaction_data?.qr_code;
  const qrBase64 = mp?.point_of_interaction?.transaction_data?.qr_code_base64;
  const ticketUrl = mp?.point_of_interaction?.transaction_data?.ticket_url;

  if (!qr || !qrBase64) {
    safeError("[mp-pix] missing qr", { mp });
    return json({ success: false, error: "Mercado Pago não retornou o QR Code do Pix." }, 502);
  }

  await admin.from("orders").update({
    mercado_pago_payment_id: String(mp.id),
    external_reference: order.id,
  }).eq("id", order.id)
      .eq("organization_id", tenant.organizationId)
      .eq("store_id", tenant.storeId);

  safeLog("success", { order_id: order.id, mp_id: mp.id, status: mp.status });

  return json({
    success: true,
    order_id: order.id,
    payment_id: mp.id,
    status: mp.status,
    qr_code: qr,
    qr_code_base64: qrBase64,
    ticket_url: ticketUrl,
    expires_at: dateOfExpiration,
    total,
  });
});
