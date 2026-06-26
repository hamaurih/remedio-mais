// Cria um pedido pendente + preference no Mercado Pago e devolve a URL de checkout.
// Requer usuário autenticado. Token do MP é lido de Deno.env (Secrets).
// Logs e diagnóstico estruturados (gravados em public.payment_errors).
import { createClient } from "npm:@supabase/supabase-js@2";
import { safeLog as maskedLog, safeError, maskId, maskEmail, maskSensitiveData } from "../_shared/mask.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CartItem = { id: string; variant_id?: string | null; quantity: number };
type CheckoutBody = {
  items: CartItem[];
  payment_method: "pix" | "credit_card";
  delivery_type: "pickup" | "delivery";
  customer: { name: string; email: string; phone: string; cpf?: string };
  delivery?: {
    cep?: string; street?: string; number?: string; complement?: string;
    neighborhood?: string; city?: string; state?: string; reference?: string;
    lat?: number; lng?: number; place_id?: string;
  };
  return_origin: string;
};

// ---------- helpers ----------
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function maskToken(t?: string) {
  if (!t) return "missing";
  if (t.length < 10) return "present(short)";
  return `present(len=${t.length},prefix=${t.slice(0, 6)}…)`;
}
function safeLog(label: string, data: Record<string, unknown>) {
  maskedLog(`[mp-checkout] ${label}`, data);
}

async function recordError(adminClient: any, payload: {
  stage: string; error_code: string; message: string;
  mp_error?: unknown; supabase_error?: unknown; payload_summary?: unknown;
  http_status?: number; order_id?: string | null; user_id?: string | null; user_email?: string | null;
}) {
  try {
    await adminClient.from("payment_errors").insert(payload);
  } catch (e) {
    safeError("[mp-checkout] failed to insert payment_errors", { message: (e as Error).message });
  }
}

function fail(opts: {
  http: number; error_code: string; message: string;
  details?: unknown; adminClient?: any; logCtx?: Record<string, unknown>;
  stage: string; order_id?: string | null; user_id?: string | null; user_email?: string | null;
  mp_error?: unknown; supabase_error?: unknown; payload_summary?: unknown;
}) {
  safeLog(`FAIL/${opts.stage}`, { error_code: opts.error_code, message: opts.message, ...(opts.logCtx ?? {}) });
  if (opts.adminClient) {
    // fire-and-forget; tolerate failure
    recordError(opts.adminClient, {
      stage: opts.stage, error_code: opts.error_code, message: opts.message,
      mp_error: opts.mp_error ?? null, supabase_error: opts.supabase_error ?? null,
      payload_summary: opts.payload_summary ?? null,
      http_status: opts.http, order_id: opts.order_id ?? null,
      user_id: opts.user_id ?? null, user_email: opts.user_email ?? null,
    });
  }
  return json({
    success: false,
    error_code: opts.error_code,
    error: opts.message,
    details: opts.details ?? null,
    order_id: opts.order_id ?? null,
  }, opts.http);
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 1) Validar variáveis de ambiente
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");

  const missingEnv: string[] = [];
  if (!SUPABASE_URL) missingEnv.push("SUPABASE_URL");
  if (!ANON) missingEnv.push("SUPABASE_ANON_KEY");
  if (!SERVICE) missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!MP_TOKEN) missingEnv.push("MERCADO_PAGO_ACCESS_TOKEN");
  if (missingEnv.length) {
    return fail({
      http: 500, stage: "env_check", error_code: "ENV_MISSING",
      message: `Configuração de pagamento incompleta: variável ${missingEnv.join(", ")} ausente.`,
      details: { missing: missingEnv },
    });
  }

  const admin = createClient(SUPABASE_URL!, SERVICE!);
  safeLog("boot", { has_token: !!MP_TOKEN, token: maskToken(MP_TOKEN!), env_supabase_url: !!SUPABASE_URL });

  // 2) Autenticação
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return fail({
      http: 401, stage: "auth", error_code: "AUTH_MISSING",
      message: "Sessão não encontrada. Faça login e tente novamente.",
    });
  }
  const userClient = createClient(SUPABASE_URL!, ANON!, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return fail({
      http: 401, stage: "auth", error_code: "AUTH_INVALID",
      message: "Sessão inválida ou expirada. Faça login novamente.",
      details: claimsErr?.message,
    });
  }
  const userId = claimsData.claims.sub as string;
  const userEmail = (claimsData.claims.email as string | undefined) ?? "";

  // 3) Body
  let body: CheckoutBody;
  try { body = (await req.json()) as CheckoutBody; }
  catch {
    return fail({
      http: 400, stage: "parse_body", error_code: "BODY_INVALID",
      message: "Não foi possível ler os dados do pedido.",
      adminClient: admin, user_id: userId, user_email: userEmail,
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return fail({
      http: 400, stage: "cart_validation", error_code: "CART_EMPTY",
      message: "Seu carrinho está vazio.",
      adminClient: admin, user_id: userId, user_email: userEmail,
    });
  }
  for (const it of body.items) {
    if (!it?.id) {
      return fail({
        http: 400, stage: "cart_validation", error_code: "CART_ITEM_INVALID",
        message: "Item do carrinho sem identificador válido.",
        adminClient: admin, user_id: userId, user_email: userEmail,
      });
    }
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
      return fail({
        http: 400, stage: "cart_validation", error_code: "CART_QTY_INVALID",
        message: "Quantidade inválida em um dos itens do carrinho.",
        adminClient: admin, user_id: userId, user_email: userEmail,
      });
    }
  }
  if (!["pix", "credit_card"].includes(body.payment_method)) {
    return fail({
      http: 400, stage: "validation", error_code: "PAYMENT_METHOD_INVALID",
      message: "Método de pagamento inválido. Escolha Pix ou Cartão.",
      adminClient: admin, user_id: userId, user_email: userEmail,
    });
  }
  if (!["pickup", "delivery"].includes(body.delivery_type)) {
    return fail({
      http: 400, stage: "validation", error_code: "DELIVERY_TYPE_INVALID",
      message: "Tipo de entrega inválido.",
      adminClient: admin, user_id: userId, user_email: userEmail,
    });
  }
  if (body.delivery_type === "delivery") {
    const d = body.delivery ?? {};
    if (!d.cep || !d.street || !d.number || !d.neighborhood || !d.city || !d.state) {
      return fail({
        http: 400, stage: "validation", error_code: "ADDRESS_INCOMPLETE",
        message: "Endereço de entrega incompleto.",
        adminClient: admin, user_id: userId, user_email: userEmail,
      });
    }
  }

  // 4) Carregar produtos e variações
  const ids = body.items.map((i) => i.id);
  const variantIds = body.items.map((i) => i.variant_id).filter(Boolean) as string[];

  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id,name,slug,price,promo_price,image_url,stock,active,controlled,requires_prescription,cart_quantity_limit,has_variants")
    .in("id", ids);
  if (prodErr) {
    return fail({
      http: 500, stage: "load_products", error_code: "DB_LOAD_PRODUCTS",
      message: "Não foi possível carregar os produtos.",
      adminClient: admin, supabase_error: { message: prodErr.message, code: prodErr.code, hint: prodErr.hint, details: prodErr.details },
      user_id: userId, user_email: userEmail,
    });
  }

  let variantsById = new Map<string, any>();
  if (variantIds.length) {
    const { data: variants, error: varErr } = await admin
      .from("product_variants")
      .select("id,parent_product_id,trier_product_id,barcode,variation_type,variation_value,name,price,promo_price,stock,image_url,active")
      .in("id", variantIds);
    if (varErr) {
      return fail({
        http: 500, stage: "load_variants", error_code: "DB_LOAD_VARIANTS",
        message: "Não foi possível carregar as variações dos produtos.",
        adminClient: admin, supabase_error: { message: varErr.message, code: varErr.code },
        user_id: userId, user_email: userEmail,
      });
    }
    variantsById = new Map((variants || []).map((v: any) => [v.id, v]));
  }

  const byId = new Map(products!.map((p: any) => [p.id, p]));
  const orderItems: any[] = [];
  let subtotal = 0;

  for (const ci of body.items) {
    const p: any = byId.get(ci.id);
    if (!p) {
      return fail({
        http: 400, stage: "validate_item", error_code: "PRODUCT_NOT_FOUND",
        message: `Produto não encontrado.`,
        adminClient: admin, user_id: userId, user_email: userEmail,
      });
    }
    if (!p.active) {
      return fail({
        http: 400, stage: "validate_item", error_code: "PRODUCT_INACTIVE",
        message: `Produto indisponível: ${p.name}.`,
        adminClient: admin, user_id: userId, user_email: userEmail,
      });
    }

    let variant: any = null;
    if (ci.variant_id) {
      variant = variantsById.get(ci.variant_id);
      if (!variant || !variant.active || variant.parent_product_id !== p.id) {
        return fail({
          http: 400, stage: "validate_item", error_code: "VARIANT_INVALID",
          message: `Variação inválida para ${p.name}.`,
          adminClient: admin, user_id: userId, user_email: userEmail,
        });
      }
    } else if (p.has_variants) {
      return fail({
        http: 400, stage: "validate_item", error_code: "VARIANT_REQUIRED",
        message: `Selecione uma opção para: ${p.name}.`,
        adminClient: admin, user_id: userId, user_email: userEmail,
      });
    }

    const stock = variant ? (variant.stock ?? 0) : (p.stock ?? 0);
    if (stock <= 0) {
      return fail({
        http: 400, stage: "validate_item", error_code: "OUT_OF_STOCK",
        message: `Sem estoque: ${p.name}.`,
        adminClient: admin, user_id: userId, user_email: userEmail,
      });
    }

    if (p.controlled || p.requires_prescription) {
      const { data: rx } = await admin
        .from("prescriptions")
        .select("id")
        .eq("user_id", userId).eq("product_id", p.id).eq("status", "aprovada")
        .limit(1).maybeSingle();
      if (!rx) {
        return fail({
          http: 400, stage: "validate_item", error_code: "PRESCRIPTION_REQUIRED",
          message: `É necessária receita aprovada para: ${p.name}.`,
          adminClient: admin, user_id: userId, user_email: userEmail,
        });
      }
    }

    const qty = Math.max(1, Math.min(ci.quantity | 0, p.cart_quantity_limit ?? 99, stock));
    const unit = Number(
      variant
        ? (variant.promo_price ?? variant.price ?? p.promo_price ?? p.price)
        : (p.promo_price ?? p.price)
    );
    if (!Number.isFinite(unit) || unit <= 0) {
      return fail({
        http: 400, stage: "validate_item", error_code: "PRICE_INVALID",
        message: `Preço inválido para: ${p.name}.`,
        adminClient: admin, user_id: userId, user_email: userEmail,
      });
    }
    const line = unit * qty;
    subtotal += line;
    const variantLabel = variant
      ? `${(variant.variation_type || "tamanho").replace(/^./, (c: string) => c.toUpperCase())}: ${variant.variation_value}`
      : null;
    orderItems.push({
      product_id: p.id,
      variant_id: variant?.id ?? null,
      variant_label: variantLabel,
      product_name: variant ? `${p.name} — ${variantLabel}` : p.name,
      product_image_url: variant?.image_url || p.image_url,
      quantity: qty, unit_price: unit, total: line,
      requires_prescription: !!p.requires_prescription, controlled: !!p.controlled,
    });
  }

  // 5) Frete + total recalculado no backend (modo distância OU taxa fixa)
  const { data: settings } = await admin
    .from("store_settings")
    .select("delivery_fee, delivery_mode, delivery_max_km, delivery_fee_zones, store_lat, store_lng")
    .eq("id", 1)
    .maybeSingle();

  let deliveryFee = 0;
  if (body.delivery_type === "delivery") {
    const mode = (settings as any)?.delivery_mode || "flat";
    if (mode === "distance" && (settings as any)?.store_lat != null && (settings as any)?.store_lng != null) {
      const cLat = body.delivery?.lat;
      const cLng = body.delivery?.lng;
      if (typeof cLat !== "number" || typeof cLng !== "number") {
        return fail({
          http: 400, stage: "delivery_quote", error_code: "DELIVERY_COORDS_REQUIRED",
          message: "Endereço sem coordenadas. Selecione novamente o endereço de entrega.",
          adminClient: admin, user_id: userId, user_email: userEmail,
          payload_summary: { subtotal, items: orderItems.length },
        });
      }
      const R = 6371;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const sLat = Number((settings as any).store_lat);
      const sLng = Number((settings as any).store_lng);
      const dLat = toRad(cLat - sLat);
      const dLng = toRad(cLng - sLng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(sLat)) * Math.cos(toRad(cLat)) * Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const maxKm = Number((settings as any).delivery_max_km || 0);
      if (maxKm > 0 && dist > maxKm) {
        return fail({
          http: 400, stage: "delivery_quote", error_code: "OUT_OF_DELIVERY_RANGE",
          message: `Endereço a ${dist.toFixed(1)} km — fora da área de entrega (máx. ${maxKm} km).`,
          adminClient: admin, user_id: userId, user_email: userEmail,
          payload_summary: { subtotal, distance_km: dist },
        });
      }
      const zones = ((settings as any).delivery_fee_zones || []) as Array<{ min_km: number; max_km: number; fee: number }>;
      const zone = zones.find((z) => dist >= Number(z.min_km) && dist <= Number(z.max_km));
      if (!zone) {
        return fail({
          http: 400, stage: "delivery_quote", error_code: "DELIVERY_ZONE_NOT_FOUND",
          message: `Nenhuma faixa de frete cobre ${dist.toFixed(1)} km.`,
          adminClient: admin, user_id: userId, user_email: userEmail,
          payload_summary: { subtotal, distance_km: dist },
        });
      }
      deliveryFee = Number(zone.fee);
    } else {
      deliveryFee = Number((settings as any)?.delivery_fee ?? 0);
    }
  }
  const total = subtotal + deliveryFee;

  if (!Number.isFinite(total) || total <= 0) {
    return fail({
      http: 400, stage: "totals", error_code: "TOTAL_INVALID",
      message: "Total do pedido inválido. Revise seu carrinho.",
      adminClient: admin, user_id: userId, user_email: userEmail,
      payload_summary: { subtotal, deliveryFee, total, items: orderItems.length },
    });
  }

  safeLog("totals", {
    user_id: userId, items: orderItems.length, subtotal, deliveryFee, total,
    payment_method: body.payment_method, delivery_type: body.delivery_type,
  });

  // 6) Criar pedido
  const { data: order, error: orderErr } = await admin.from("orders").insert({
    user_id: userId,
    customer_name: body.customer.name,
    customer_email: body.customer.email || userEmail,
    customer_phone: body.customer.phone,
    customer_cpf: body.customer.cpf ?? null,
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
    delivery_fee: deliveryFee,
    subtotal, total,
    status: "novo",
    payment_gateway: "mercado_pago",
    payment_method: body.payment_method,
    payment_status: "pending",
    order_status: "aguardando_pagamento",
    trier_sent: false,
  }).select().single();
  if (orderErr) {
    return fail({
      http: 500, stage: "create_order", error_code: "DB_INSERT_ORDER",
      message: "Não foi possível criar o pedido.",
      adminClient: admin, user_id: userId, user_email: userEmail,
      supabase_error: { table: "orders", message: orderErr.message, code: orderErr.code, hint: orderErr.hint, details: orderErr.details },
      payload_summary: { subtotal, deliveryFee, total, items: orderItems.length },
    });
  }

  const orderItemsRows = orderItems.map((it) => ({ ...it, order_id: order.id }));
  const { error: itErr } = await admin.from("order_items").insert(orderItemsRows);
  if (itErr) {
    await admin.from("orders").delete().eq("id", order.id);
    return fail({
      http: 500, stage: "create_order_items", error_code: "DB_INSERT_ORDER_ITEMS",
      message: "Não foi possível gravar os itens do pedido.",
      adminClient: admin, user_id: userId, user_email: userEmail, order_id: order.id,
      supabase_error: { table: "order_items", message: itErr.message, code: itErr.code, hint: itErr.hint, details: itErr.details },
    });
  }

  safeLog("order_created", { order_id: order.id });

  // 7) Mercado Pago preference
  const origin = (body.return_origin || "https://atacadaodosmedicamentos.com.br").replace(/\/$/, "");
  const preference = {
    items: orderItems.map((it) => ({
      id: it.product_id, title: it.product_name, quantity: it.quantity,
      currency_id: "BRL", unit_price: Number(it.unit_price.toFixed(2)),
      picture_url: it.product_image_url ?? undefined,
    })),
    payer: {
      name: body.customer.name, email: body.customer.email || userEmail,
      phone: { number: body.customer.phone },
      identification: body.customer.cpf ? { type: "CPF", number: body.customer.cpf } : undefined,
    },
    shipments: deliveryFee > 0 ? { cost: deliveryFee, mode: "not_specified" } : undefined,
    external_reference: order.id,
    notification_url: `${SUPABASE_URL}/functions/v1/mercado-pago-webhook`,
    back_urls: {
      success: `${origin}/pedido/sucesso?order=${order.id}`,
      pending: `${origin}/pedido/pendente?order=${order.id}`,
      failure: `${origin}/pedido/falha?order=${order.id}`,
    },
    auto_return: "approved",
    payment_methods: {
      excluded_payment_types: [
        { id: "ticket" }, // sempre excluir boleto
        ...(body.payment_method === "pix" ? [{ id: "credit_card" }, { id: "debit_card" }] : []),
      ],
    },
    statement_descriptor: "Atacadao Medicamentos",
  };

  safeLog("mp_request", {
    order_id: order.id, items: preference.items.length,
    has_shipments: !!preference.shipments,
    payment_method: body.payment_method,
    payer_email: preference.payer.email,
  });

  let mpRes: Response;
  try {
    mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_TOKEN}` },
      body: JSON.stringify(preference),
    });
  } catch (e) {
    await admin.from("orders").update({ payment_status: "rejected", cancelled_at: new Date().toISOString() }).eq("id", order.id);
    return fail({
      http: 502, stage: "mp_request", error_code: "MP_NETWORK",
      message: "Não foi possível contatar o Mercado Pago. Tente novamente.",
      adminClient: admin, user_id: userId, user_email: userEmail, order_id: order.id,
      mp_error: { message: (e as Error).message },
    });
  }

  const mpDataText = await mpRes.text();
  let mpData: any = null;
  try { mpData = JSON.parse(mpDataText); } catch { mpData = { raw: mpDataText }; }

  if (!mpRes.ok) {
    await admin.from("orders").update({ payment_status: "rejected", cancelled_at: new Date().toISOString() }).eq("id", order.id);
    return fail({
      http: 502, stage: "mp_response", error_code: "MP_REJECTED",
      message: mpData?.message ? `Mercado Pago: ${mpData.message}` : "Mercado Pago rejeitou o pedido.",
      adminClient: admin, user_id: userId, user_email: userEmail, order_id: order.id,
      mp_error: mpData, details: { status: mpRes.status, cause: mpData?.cause },
    });
  }

  const checkoutUrl: string | undefined = mpData.init_point || mpData.sandbox_init_point;
  if (!checkoutUrl) {
    await admin.from("orders").update({ payment_status: "rejected", cancelled_at: new Date().toISOString() }).eq("id", order.id);
    return fail({
      http: 502, stage: "mp_response", error_code: "MP_NO_URL",
      message: "Mercado Pago não retornou URL de checkout.",
      adminClient: admin, user_id: userId, user_email: userEmail, order_id: order.id,
      mp_error: mpData,
    });
  }

  await admin.from("orders").update({
    mercado_pago_preference_id: mpData.id,
    mercado_pago_checkout_url: checkoutUrl,
    external_reference: order.id,
  }).eq("id", order.id);

  safeLog("success", { order_id: order.id, preference_id: mpData.id });

  return json({
    success: true,
    order_id: order.id,
    checkout_url: checkoutUrl,
    preference_id: mpData.id,
  });
});
