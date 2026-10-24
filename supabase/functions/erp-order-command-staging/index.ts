import { createClient } from "npm:@supabase/supabase-js@2";
import { buildProductReadModel } from "../_shared/erp/product-service.ts";
import { normalizeOrderCommandPayload } from "../_shared/erp/order-command-contract.ts";
import {
  evaluateOrderWriteGuard,
  isOrderChannelEnabled,
} from "../_shared/erp/order-write-guard.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const S = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENABLED = String(Deno.env.get("ERP_ORDER_COMMAND_ENABLED") || "").toLowerCase() === "true";
const ENVIRONMENT = String(Deno.env.get("ERP_ORDER_COMMAND_ENV") || "");
const ALLOWED_CHANNELS = String(Deno.env.get("ERP_ORDER_COMMAND_ALLOWED_CHANNELS") || "");

const admin = createClient(U, S, { auth: { persistSession: false, autoRefreshToken: false } });

const PRODUCT_FIELDS = [
  "id","name","slug","sku","barcode","trier_product_id","manufacturer","laboratory",
  "active","requires_prescription","controlled","has_variants",
  "price","price_base","ecommerce_price","promo_price",
  "site_price","site_promo_price","whatsapp_price","whatsapp_promo_price",
  "pdv_price","pdv_promo_price","promotion_start","promotion_end",
  "stock","stock_quantity","trier_stock_quantity","last_stock_sync_at",
  "trier_active","manual_disabled","archived_at","force_active",
].join(",");

const SUPPORTED_CHANNELS = new Set([
  "site","pdv","whatsapp_ia","whatsapp_humano","telefone",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELEASE_REASONS = new Set(["cancelled", "payment_failed", "expired", "manual_test", "cielo_rejected"]);
const PRESCRIPTION_STATUSES = new Set(["recebida", "em_analise", "aprovada", "approved", "finalizada"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;

  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  return role ? user : null;
}

function validateCreatePayload(body: any) {
  const idempotencyKey = String(body?.idempotency_key || "").trim();
  const channel = String(body?.channel || "").trim().toLowerCase();
  const customerName = String(body?.customer?.name || "").trim();
  const customerPhone = String(body?.customer?.phone || "").trim();
  const tenantId = String(body?.tenant_id || "").trim();
  const storeId = String(body?.store_id || "").trim();
  const userId = body?.user_id ? String(body.user_id).trim() : "";
  const deliveryType = String(body?.delivery_type || "pickup").trim().toLowerCase();
  const paymentMethod = body?.payment_method ? String(body.payment_method).trim().toLowerCase() : null;
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!idempotencyKey || idempotencyKey.length > 200) return "idempotency_key_required";
  if (!SUPPORTED_CHANNELS.has(channel)) return "invalid_channel";
  if (!isOrderChannelEnabled(channel, ALLOWED_CHANNELS)) return "channel_disabled";
  if (!UUID_RE.test(tenantId) || !UUID_RE.test(storeId)) return "tenant_store_required";
  if (userId && !UUID_RE.test(userId)) return "invalid_user_id";
  if (!customerName || !customerPhone) return "customer_required";
  if (!["pickup", "delivery"].includes(deliveryType)) return "invalid_delivery_type";
  if (paymentMethod && !["pix", "credit_card"].includes(paymentMethod)) return "invalid_payment_method";
  if (deliveryType === "delivery") {
    const d = body?.delivery || {};
    if (!d.cep || !d.street || !d.number || !d.neighborhood || !d.city || !d.state) {
      return "delivery_address_required";
    }
  }
  if (!items.length) return "items_required";
  if (items.length > 100) return "too_many_items";

  const seen = new Set<string>();
  for (const item of items) {
    const productId = String(item?.product_id || "").trim();
    const variantId = item?.variant_id ? String(item.variant_id).trim() : "";
    const prescriptionId = item?.prescription_id ? String(item.prescription_id).trim() : "";
    const quantity = Number(item?.quantity);
    const expectedUnitPrice = item?.expected_unit_price;

    if (!UUID_RE.test(productId) || !Number.isInteger(quantity) || quantity <= 0) return "invalid_item";
    if (variantId && !UUID_RE.test(variantId)) return "invalid_variant_id";
    if (prescriptionId && !UUID_RE.test(prescriptionId)) return "invalid_prescription_id";

    const itemKey = `${productId}:${variantId || "root"}`;
    if (seen.has(itemKey)) return "duplicate_item";
    seen.add(itemKey);

    if (
      expectedUnitPrice !== undefined &&
      expectedUnitPrice !== null &&
      (!Number.isFinite(Number(expectedUnitPrice)) || Number(expectedUnitPrice) <= 0)
    ) {
      return "invalid_expected_price";
    }
  }

  return null;
}

async function validatePrescription(userId: string, productId: string, prescriptionId: string) {
  const { data, error } = await admin
    .from("prescriptions")
    .select("id,user_id,product_id,status")
    .eq("id", prescriptionId)
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();

  if (error || !data) return false;
  return PRESCRIPTION_STATUSES.has(String((data as any).status || ""));
}

async function resolveCreatePayload(body: any, actorId: string) {
  const channel = String(body.channel).trim().toLowerCase();
  const deliveryType = String(body?.delivery_type || "pickup").trim().toLowerCase();
  const userId = body?.user_id ? String(body.user_id).trim() : null;
  const requested = body.items.map((item: any) => ({
    product_id: String(item.product_id).trim(),
    variant_id: item?.variant_id ? String(item.variant_id).trim() : null,
    prescription_id: item?.prescription_id ? String(item.prescription_id).trim() : null,
    quantity: Number(item.quantity),
    expected_unit_price: item?.expected_unit_price == null ? null : Number(item.expected_unit_price),
  }));

  const productIds = [...new Set(requested.map((item: any) => item.product_id))];
  const { data: products, error } = await admin
    .from("products")
    .select(PRODUCT_FIELDS)
    .in("id", productIds);

  if (error) return { error: "product_query_failed", status: 500, detail: error.message };

  const productById = new Map((products || []).map((row: any) => [row.id, row]));

  const variantIds = [...new Set(requested.map((item: any) => item.variant_id).filter(Boolean))] as string[];
  const variantById = new Map<string, any>();
  if (variantIds.length) {
    const { data: variants, error: variantError } = await admin
      .from("product_variants")
      .select("id,parent_product_id,variation_type,variation_value,price,promo_price,stock,image_url,active")
      .in("id", variantIds);
    if (variantError) return { error: "variant_query_failed", status: 500, detail: variantError.message };
    for (const variant of variants || []) variantById.set((variant as any).id, variant);
  }

  const items: any[] = [];
  let subtotal = 0;
  let prescriptionOriginalRequired = false;

  for (const request of requested) {
    const row: any = productById.get(request.product_id);
    if (!row) return { error: "product_not_found", status: 409, product_id: request.product_id };

    const productModel = buildProductReadModel(row as any, channel);
    let unitPrice = Number(productModel.price.final_price || 0);
    let available = Number(productModel.inventory.available || 0);
    let variantLabel: string | null = null;

    if (request.variant_id) {
      const variant = variantById.get(request.variant_id);
      if (!variant || !variant.active || variant.parent_product_id !== row.id) {
        return { error: "invalid_variant", status: 409, product_id: row.id, variant_id: request.variant_id };
      }
      unitPrice = Number(variant.promo_price ?? variant.price ?? unitPrice);
      available = Number(variant.stock || 0);
      variantLabel = `${String(variant.variation_type || "tamanho").replace(/^./, (c) => c.toUpperCase())}: ${variant.variation_value}`;
    } else if (row.has_variants) {
      return { error: "variant_required", status: 409, product_id: row.id };
    }

    if (!productModel.inventory.sellable || available < request.quantity) {
      return {
        error: "insufficient_stock",
        status: 409,
        product_id: row.id,
        variant_id: request.variant_id,
        available,
        requested: request.quantity,
      };
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return { error: "invalid_server_price", status: 409, product_id: row.id };
    }

    if (
      request.expected_unit_price != null &&
      Math.abs(Number(request.expected_unit_price) - unitPrice) > 0.009
    ) {
      return {
        error: "price_changed",
        status: 409,
        product_id: row.id,
        expected_unit_price: request.expected_unit_price,
        server_unit_price: unitPrice,
      };
    }

    const regulated = Boolean(row.controlled || row.requires_prescription);
    let prescriptionCondition = "none";
    if (regulated) {
      prescriptionOriginalRequired = true;
      if (!userId || !request.prescription_id) {
        return { error: "prescription_required", status: 409, product_id: row.id };
      }
      const valid = await validatePrescription(userId, row.id, request.prescription_id);
      if (!valid) return { error: "invalid_prescription", status: 409, product_id: row.id };
      prescriptionCondition = "original_on_delivery";
    }

    subtotal += Number((unitPrice * request.quantity).toFixed(2));
    items.push({
      product_id: row.id,
      variant_id: request.variant_id,
      variant_label: variantLabel,
      prescription_id: request.prescription_id,
      prescription_condition: prescriptionCondition,
      quantity: request.quantity,
      unit_price: unitPrice,
      price_source: request.variant_id ? "variant" : String(productModel.price.source || "unknown"),
    });
  }

  const deliveryFee = Math.max(0, Number(body?.delivery_fee || 0));
  const discount = Math.max(0, Number(body?.discount || 0));
  const total = Math.max(0, Number((subtotal - discount + deliveryFee).toFixed(2)));

  const payload = normalizeOrderCommandPayload({
    idempotency_key: String(body.idempotency_key).trim(),
    channel: channel as any,
    tenant_id: String(body.tenant_id).trim(),
    store_id: String(body.store_id).trim(),
    user_id: userId,
    customer: {
      name: String(body.customer.name).trim(),
      phone: String(body.customer.phone).trim(),
      email: body?.customer?.email ? String(body.customer.email).trim() : null,
      cpf: body?.customer?.cpf ? String(body.customer.cpf).trim() : null,
    },
    delivery_type: deliveryType as "pickup" | "delivery",
    delivery: body?.delivery || undefined,
    payment_method: body?.payment_method || null,
    delivery_fee: deliveryFee,
    discount,
    prescription_original_required: prescriptionOriginalRequired,
    meta: {
      fbp: body?.meta?.fbp || null,
      fbc: body?.meta?.fbc || null,
    },
    items,
    created_by: actorId,
  });

  return {
    payload,
    validation: {
      accepted: true,
      server_priced: true,
      prescription_original_required: prescriptionOriginalRequired,
      delivery_type: deliveryType,
      items,
      totals: { subtotal, discount, delivery_fee: deliveryFee, total },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const guard = evaluateOrderWriteGuard({
    supabaseUrl: U,
    enabled: ENABLED,
    environment: ENVIRONMENT,
  });

  if (!guard.allowed) {
    return json({ error: "erp_order_write_disabled", reason: guard.reason, writes: 0 }, 503);
  }

  const actor = await requireAdmin(req);
  if (!actor) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "create").trim().toLowerCase();

  if (action === "create") {
    const payloadError = validateCreatePayload(body);
    if (payloadError) return json({ error: payloadError, writes: 0 }, 400);

    const resolved = await resolveCreatePayload(body, actor.id);
    if ("error" in resolved) return json(resolved, Number(resolved.status || 409));

    const { data, error } = await admin.rpc("erp_create_order_with_reservation", {
      _payload: resolved.payload,
    });

    if (error) {
      return json({ error: "erp_order_command_failed", detail: error.message }, 409);
    }

    return json({
      ok: true,
      action,
      environment: "staging",
      project_ref: guard.projectRef,
      server_priced: true,
      validation: resolved.validation,
      result: data,
    });
  }

  if (action === "commit" || action === "release") {
    const orderId = String(body?.order_id || "").trim();
    if (!UUID_RE.test(orderId)) return json({ error: "invalid_order_id", writes: 0 }, 400);

    if (action === "commit") {
      const { data, error } = await admin.rpc("commit_order_inventory_internal", { _order_id: orderId });
      if (error) return json({ error: "inventory_commit_failed", detail: error.message }, 409);
      return json({ ok: true, action, environment: "staging", result: data });
    }

    const reason = String(body?.reason || "manual_test").trim().toLowerCase();
    if (!RELEASE_REASONS.has(reason)) return json({ error: "invalid_release_reason", writes: 0 }, 400);

    const { data, error } = await admin.rpc("release_order_inventory_internal", {
      _order_id: orderId,
      _reason: reason,
    });
    if (error) return json({ error: "inventory_release_failed", detail: error.message }, 409);
    return json({ ok: true, action, environment: "staging", result: data });
  }

  if (action === "expire_due") {
    const requestedLimit = Number(body?.limit ?? 100);
    const limit = Number.isInteger(requestedLimit) ? Math.min(200, Math.max(1, requestedLimit)) : 100;
    const { data, error } = await admin.rpc("erp_expire_due_reservations", { _limit: limit });
    if (error) return json({ error: "reservation_expiry_failed", detail: error.message }, 409);
    return json({ ok: true, action, environment: "staging", result: data });
  }

  return json({ error: "invalid_action", writes: 0 }, 400);
});
