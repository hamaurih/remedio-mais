// Cria um pedido pendente + preference no Mercado Pago e devolve a URL de checkout.
// Requer usuário autenticado. Token do MP é lido de Deno.env (Secrets).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type CartItem = { id: string; variant_id?: string | null; quantity: number };
type CheckoutBody = {
  items: CartItem[];
  payment_method: "pix" | "credit_card";
  delivery_type: "pickup" | "delivery";
  customer: { name: string; email: string; phone: string; cpf?: string };
  delivery?: {
    cep?: string; street?: string; number?: string; complement?: string;
    neighborhood?: string; city?: string; state?: string; reference?: string;
  };
  return_origin: string; // ex.: https://meusite.com
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!MP_TOKEN) return json({ error: "Mercado Pago não configurado" }, 500);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;
    const userEmail = (claims.claims.email as string | undefined) ?? "";

    const body = (await req.json()) as CheckoutBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return json({ error: "Carrinho vazio" }, 400);
    }
    if (!["pix", "credit_card"].includes(body.payment_method)) {
      return json({ error: "Método inválido" }, 400);
    }
    if (!["pickup", "delivery"].includes(body.delivery_type)) {
      return json({ error: "Tipo de entrega inválido" }, 400);
    }
    if (body.delivery_type === "delivery") {
      const d = body.delivery ?? {};
      if (!d.cep || !d.street || !d.number || !d.neighborhood || !d.city || !d.state) {
        return json({ error: "Endereço de entrega incompleto" }, 400);
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Carrega produtos + valida estoque/receita
    const ids = body.items.map((i) => i.id);
    const variantIds = body.items.map((i) => i.variant_id).filter(Boolean) as string[];
    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id,name,slug,price,promo_price,image_url,stock,active,controlled,requires_prescription,cart_quantity_limit,has_variants")
      .in("id", ids);
    if (prodErr) return json({ error: prodErr.message }, 500);

    let variantsById = new Map<string, any>();
    if (variantIds.length) {
      const { data: variants, error: varErr } = await admin
        .from("product_variants")
        .select("id,parent_product_id,trier_product_id,barcode,variation_type,variation_value,name,price,promo_price,stock,image_url,active")
        .in("id", variantIds);
      if (varErr) return json({ error: varErr.message }, 500);
      variantsById = new Map((variants || []).map((v: any) => [v.id, v]));
    }

    const byId = new Map(products!.map((p: any) => [p.id, p]));
    const orderItems: any[] = [];
    let subtotal = 0;
    for (const ci of body.items) {
      const p: any = byId.get(ci.id);
      if (!p || !p.active) return json({ error: `Produto indisponível: ${ci.id}` }, 400);

      let variant: any = null;
      if (ci.variant_id) {
        variant = variantsById.get(ci.variant_id);
        if (!variant || !variant.active || variant.parent_product_id !== p.id) {
          return json({ error: `Variação inválida: ${p.name}` }, 400);
        }
      } else if (p.has_variants) {
        return json({ error: `Selecione uma opção para: ${p.name}` }, 400);
      }

      const stock = variant ? (variant.stock ?? 0) : (p.stock ?? 0);
      if (stock <= 0) return json({ error: `Sem estoque: ${p.name}` }, 400);

      if (p.controlled || p.requires_prescription) {
        const { data: rx } = await admin
          .from("prescriptions")
          .select("id")
          .eq("user_id", userId).eq("product_id", p.id).eq("status", "aprovada")
          .limit(1).maybeSingle();
        if (!rx) return json({ error: `Receita necessária aprovada: ${p.name}` }, 400);
      }
      const qty = Math.max(1, Math.min(ci.quantity | 0, p.cart_quantity_limit ?? 99, stock));
      const unit = variant
        ? Number(variant.promo_price ?? variant.price ?? p.promo_price ?? p.price)
        : Number(p.promo_price ?? p.price);
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

    // Frete (fixo das configurações)
    const { data: settings } = await admin.from("store_settings").select("delivery_fee").eq("id", 1).maybeSingle();
    const deliveryFee = body.delivery_type === "delivery" ? Number(settings?.delivery_fee ?? 0) : 0;
    const total = subtotal + deliveryFee;

    // Cria pedido pendente
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
    if (orderErr) return json({ error: orderErr.message }, 500);

    const orderItemsRows = orderItems.map((it) => ({ ...it, order_id: order.id }));
    const { error: itErr } = await admin.from("order_items").insert(orderItemsRows);
    if (itErr) return json({ error: itErr.message }, 500);

    // Cria preference no Mercado Pago
    const origin = body.return_origin.replace(/\/$/, "");
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
          ...(body.payment_method === "pix" ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }] : []),
          ...(body.payment_method === "credit_card" ? [{ id: "ticket" }] : []),
        ],
      },
      statement_descriptor: "Atacadao Medicamentos",
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_TOKEN}` },
      body: JSON.stringify(preference),
    });
    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      await admin.from("orders").update({ payment_status: "rejected", cancelled_at: new Date().toISOString() }).eq("id", order.id);
      return json({ error: "Erro Mercado Pago", details: mpData }, 502);
    }

    const checkoutUrl = mpData.init_point || mpData.sandbox_init_point;
    await admin.from("orders").update({
      mercado_pago_preference_id: mpData.id,
      mercado_pago_checkout_url: checkoutUrl,
      external_reference: order.id,
    }).eq("id", order.id);

    return json({ order_id: order.id, checkout_url: checkoutUrl, preference_id: mpData.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
