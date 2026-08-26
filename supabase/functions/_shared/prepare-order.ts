// Helper compartilhado: valida sessão + carrinho + endereço, calcula frete
// e cria o pedido pendente. Reutilizado por create-cielo-pix e create-cielo-card.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { safeError } from "./mask.ts";
import { isValidCpf, normalizeCpf } from "./cpf.ts";

export type CartItem = {
  id: string;
  variant_id?: string | null;
  quantity: number;
  expected_unit_price?: number;
  prescription_id?: string | null;
};
export type OrderBody = {
  items: CartItem[];
  delivery_type: "pickup" | "delivery";
  customer: { name: string; email: string; phone: string; cpf?: string };
  delivery?: {
    cep?: string; street?: string; number?: string; complement?: string;
    neighborhood?: string; city?: string; state?: string; reference?: string;
    lat?: number; lng?: number; place_id?: string;
  };
  // Identificadores Meta (não sensíveis) para deduplicação do Purchase na CAPI.
  meta?: { fbp?: string | null; fbc?: string | null };
};

export type PrepareResult =
  | { ok: true; admin: SupabaseClient; userId: string; userEmail: string; order: any; total: number; subtotal: number; deliveryFee: number }
  | { ok: false; status: number; body: unknown };

export async function prepareOrder(
  req: Request,
  paymentMethod: "pix" | "credit_card",
): Promise<PrepareResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SUPABASE_URL || !ANON || !SERVICE) {
    return { ok: false, status: 500, body: { success: false, error: "Configuração incompleta no servidor." } };
  }
  const admin = createClient(SUPABASE_URL, SERVICE);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, body: { success: false, error: "Faça login para continuar." } };
  }
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { ok: false, status: 401, body: { success: false, error: "Sessão inválida ou expirada." } };
  }
  const userId = claimsData.claims.sub as string;
  const userEmail = (claimsData.claims.email as string | undefined) ?? "";

  let body: OrderBody;
  try { body = await req.json() as OrderBody; }
  catch { return { ok: false, status: 400, body: { success: false, error: "Corpo inválido." } }; }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, status: 400, body: { success: false, error: "Carrinho vazio." } };
  }
  if (!["pickup", "delivery"].includes(body.delivery_type)) {
    return { ok: false, status: 400, body: { success: false, error: "Tipo de entrega inválido." } };
  }
  if (body.delivery_type === "delivery") {
    const d = body.delivery ?? {};
    if (!d.cep || !d.street || !d.number || !d.neighborhood || !d.city || !d.state) {
      return { ok: false, status: 400, body: { success: false, error: "Endereço de entrega incompleto." } };
    }
  }
  const cpfDigits = normalizeCpf(body.customer?.cpf || "");
  if (paymentMethod === "pix" && !cpfDigits) {
    return { ok: false, status: 400, body: { success: false, error: "CPF é obrigatório para pagamento via Pix." } };
  }
  if (cpfDigits && !isValidCpf(cpfDigits)) {
    return { ok: false, status: 400, body: { success: false, error: "CPF inválido. Confira os números informados." } };
  }

  // Produtos + variações
  const ids = body.items.map((i) => i.id);
  const variantIds = body.items.map((i) => i.variant_id).filter(Boolean) as string[];
  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id,name,slug,price,promo_price,image_url,stock,active,controlled,requires_prescription,cart_quantity_limit,has_variants")
    .in("id", ids);
  if (prodErr) return { ok: false, status: 500, body: { success: false, error: "Falha ao carregar produtos." } };

  let variantsById = new Map<string, any>();
  if (variantIds.length) {
    const { data: variants } = await admin
      .from("product_variants")
      .select("id,parent_product_id,variation_type,variation_value,price,promo_price,stock,image_url,active")
      .in("id", variantIds);
    variantsById = new Map((variants || []).map((v: any) => [v.id, v]));
  }
  const byId = new Map((products || []).map((p: any) => [p.id, p]));
  const orderItems: any[] = [];
  let subtotal = 0;

  for (const ci of body.items) {
    const p: any = byId.get(ci.id);
    if (!p || !p.active) return { ok: false, status: 400, body: { success: false, error: `Produto indisponível.` } };
    let variant: any = null;
    if (ci.variant_id) {
      variant = variantsById.get(ci.variant_id);
      if (!variant || !variant.active || variant.parent_product_id !== p.id) {
        return { ok: false, status: 400, body: { success: false, error: `Variação inválida para ${p.name}.` } };
      }
    } else if (p.has_variants) {
      return { ok: false, status: 400, body: { success: false, error: `Selecione uma opção para: ${p.name}.` } };
    }
    const stock = variant ? (variant.stock ?? 0) : (p.stock ?? 0);
    if (stock <= 0) return { ok: false, status: 400, body: { success: false, error: `Sem estoque: ${p.name}.` } };
    if (p.controlled || p.requires_prescription) {
      // A liberação exige receita aprovada DO PRÓPRIO usuário e aplicável a este
      // produto. O prescription_id enviado pelo cliente é apenas uma dica: se
      // estiver ausente/desatualizado, buscamos a receita aprovada do dono para
      // o produto, sem nunca dispensar a exigência.
      let query = admin.from("prescriptions")
        .select("id,product_id,product_ids,status")
        .eq("user_id", userId)
        .in("status", ["aprovada", "approved"]);
      if (ci.prescription_id) query = query.eq("id", ci.prescription_id);
      const { data: rxList } = await query.order("approved_at", { ascending: false }).limit(20);
      const covering = (rxList || []).find((rx: any) => {
        const covered = Array.isArray(rx?.product_ids) ? rx.product_ids : [];
        return rx?.product_id === p.id || covered.includes(p.id);
      });
      if (!covering && ci.prescription_id) {
        const { data: fallback } = await admin.from("prescriptions")
          .select("id,product_id,product_ids,status")
          .eq("user_id", userId)
          .in("status", ["aprovada", "approved"])
          .order("approved_at", { ascending: false })
          .limit(20);
        const alt = (fallback || []).find((rx: any) => {
          const covered = Array.isArray(rx?.product_ids) ? rx.product_ids : [];
          return rx?.product_id === p.id || covered.includes(p.id);
        });
        if (alt) { ci.prescription_id = alt.id; }
        else {
          return { ok: false, status: 400, body: { success: false, error: `A receita aprovada não corresponde a: ${p.name}.` } };
        }
      } else if (!covering) {
        return { ok: false, status: 400, body: { success: false, error: `Receita aprovada necessária: ${p.name}.` } };
      } else {
        ci.prescription_id = covering.id;
      }
    }
    const qty = Math.max(1, Math.min(ci.quantity | 0, p.cart_quantity_limit ?? 99, stock));
    const unit = Number(variant ? (variant.promo_price ?? variant.price ?? p.promo_price ?? p.price) : (p.promo_price ?? p.price));
    if (!Number.isFinite(unit) || unit <= 0) return { ok: false, status: 400, body: { success: false, error: `Preço inválido: ${p.name}.` } };
    const expectedUnit = Number(ci.expected_unit_price);
    if (Number.isFinite(expectedUnit) && Math.abs(expectedUnit - unit) > 0.009) {
      return {
        ok: false,
        status: 409,
        body: {
          success: false,
          error_code: "price_changed",
          error: `O preço de ${p.name} mudou de R$ ${expectedUnit.toFixed(2)} para R$ ${unit.toFixed(2)}. Volte ao carrinho para revisar antes de pagar.`,
        },
      };
    }
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
    .eq("id", 1).maybeSingle();
  let deliveryFee = 0;
  if (body.delivery_type === "delivery") {
    const mode = (settings as any)?.delivery_mode || "flat";
    if (mode === "distance" && (settings as any)?.store_lat != null && (settings as any)?.store_lng != null) {
      const cLat = body.delivery?.lat, cLng = body.delivery?.lng;
      if (typeof cLat !== "number" || typeof cLng !== "number") {
        return { ok: false, status: 400, body: { success: false, error: "Endereço sem coordenadas. Selecione novamente." } };
      }
      const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
      const sLat = Number((settings as any).store_lat), sLng = Number((settings as any).store_lng);
      const dLat = toRad(cLat - sLat), dLng = toRad(cLng - sLng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(sLat)) * Math.cos(toRad(cLat)) * Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const maxKm = Number((settings as any).delivery_max_km || 0);
      if (maxKm > 0 && dist > maxKm) return { ok: false, status: 400, body: { success: false, error: `Fora da área de entrega (${dist.toFixed(1)} km).` } };
      const zones = ((settings as any).delivery_fee_zones || []) as Array<{ min_km: number; max_km: number; fee: number }>;
      const zone = zones.find((z) => dist >= Number(z.min_km) && dist <= Number(z.max_km));
      if (!zone) return { ok: false, status: 400, body: { success: false, error: `Sem faixa de frete para ${dist.toFixed(1)} km.` } };
      deliveryFee = Number(zone.fee);
    } else {
      deliveryFee = Number((settings as any)?.delivery_fee ?? 0);
    }
  }
  const total = Number((subtotal + deliveryFee).toFixed(2));
  if (!Number.isFinite(total) || total <= 0) return { ok: false, status: 400, body: { success: false, error: "Total inválido." } };

  // Rate limit: evita que um mesmo usuário abra dezenas de cobranças em sequência
  // (retentativa nervosa no checkout ou abuso). Janela curta, limite generoso.
  {
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= 8) {
      safeError("[prepare-order] rate limited", { userId, count });
      return {
        ok: false,
        status: 429,
        body: { success: false, error: "Muitas tentativas de pagamento em sequência. Aguarde um minuto e tente novamente." },
      };
    }
  }

  // Cria pedido pendente

  const { data: order, error: orderErr } = await admin.from("orders").insert({
    user_id: userId,
    customer_name: body.customer.name,
    customer_email: body.customer.email || userEmail,
    customer_phone: body.customer.phone,
    customer_cpf: cpfDigits || null,
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
    status: "novo", payment_gateway: "cielo", payment_method: paymentMethod,
    payment_status: "pending", order_status: "aguardando_pagamento", trier_sent: false,
    external_reference: null,
    meta_fbp: typeof body.meta?.fbp === "string" ? body.meta.fbp.slice(0, 128) : null,
    meta_fbc: typeof body.meta?.fbc === "string" ? body.meta.fbc.slice(0, 256) : null,
  }).select().single();
  if (orderErr || !order) {
    safeError("[prepareOrder] order insert failed", { msg: orderErr?.message });
    return { ok: false, status: 500, body: { success: false, error: "Não foi possível criar o pedido." } };
  }

  const itemsRows = orderItems.map((it) => ({ ...it, order_id: order.id }));
  const { error: itErr } = await admin.from("order_items").insert(itemsRows);
  if (itErr) {
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, status: 500, body: { success: false, error: "Não foi possível gravar os itens." } };
  }

  return { ok: true, admin, userId, userEmail, order, total, subtotal, deliveryFee };
}

export function jsonResp(body: unknown, status = 200, extraCors?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
      ...(extraCors || {}),
    },
  });
}
