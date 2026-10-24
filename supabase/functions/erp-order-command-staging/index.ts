import { createClient } from "npm:@supabase/supabase-js@2";
import { validateOrderDryRun } from "../_shared/erp/order-command.ts";
import { buildProductReadModel } from "../_shared/erp/product-service.ts";
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
  "active","requires_prescription","controlled",
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
const RELEASE_REASONS = new Set(["cancelled", "payment_failed", "expired", "manual_test"]);

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
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!idempotencyKey || idempotencyKey.length > 200) return "idempotency_key_required";
  if (!SUPPORTED_CHANNELS.has(channel)) return "invalid_channel";
  if (!isOrderChannelEnabled(channel, ALLOWED_CHANNELS)) return "channel_disabled";
  if (!UUID_RE.test(tenantId) || !UUID_RE.test(storeId)) return "tenant_store_required";
  if (!customerName || !customerPhone) return "customer_required";
  if (!items.length) return "items_required";
  if (items.length > 100) return "too_many_items";

  const seen = new Set<string>();
  for (const item of items) {
    const productId = String(item?.product_id || "").trim();
    const quantity = Number(item?.quantity);
    const expectedUnitPrice = item?.expected_unit_price;

    if (!UUID_RE.test(productId) || !Number.isInteger(quantity) || quantity <= 0) return "invalid_item";
    if (seen.has(productId)) return "duplicate_product";
    seen.add(productId);

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

async function resolveCreatePayload(body: any, actorId: string) {
  const channel = String(body.channel).trim().toLowerCase();
  const requested = body.items.map((item: any) => ({
    product_id: String(item.product_id).trim(),
    quantity: Number(item.quantity),
    expected_unit_price: item?.expected_unit_price == null ? null : Number(item.expected_unit_price),
  }));

  const productIds = requested.map((item: any) => item.product_id);
  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_FIELDS)
    .in("id", productIds);

  if (error) {
    return { error: "product_query_failed", status: 500, detail: error.message };
  }

  const resolved = new Map<string, any>();
  for (const row of data || []) {
    const model = buildProductReadModel(row as any, channel);
    resolved.set((row as any).id, {
      product_id: (row as any).id,
      name: (row as any).name,
      unit_price: Number(model.price.final_price || 0),
      available: Number(model.inventory.available || 0),
      sellable: Boolean(model.inventory.sellable),
      source: String(model.price.source || "unknown"),
    });
  }

  const validation = validateOrderDryRun({
    channel: channel as any,
    requested,
    resolved,
    delivery_fee: Number(body?.delivery_fee || 0),
    discount: Number(body?.discount || 0),
  });

  if (!validation.accepted) {
    return {
      error: "order_validation_failed",
      status: 409,
      validation,
    };
  }

  return {
    payload: {
      idempotency_key: String(body.idempotency_key).trim(),
      channel,
      tenant_id: String(body.tenant_id).trim(),
      store_id: String(body.store_id).trim(),
      customer: {
        name: String(body.customer.name).trim(),
        phone: String(body.customer.phone).trim(),
        email: body?.customer?.email ? String(body.customer.email).trim() : null,
        cpf: body?.customer?.cpf ? String(body.customer.cpf).trim() : null,
      },
      items: validation.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
      delivery_fee: validation.totals.delivery_fee,
      discount: validation.totals.discount,
      created_by: actorId,
    },
    validation,
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
    return json({
      error: "erp_order_write_disabled",
      reason: guard.reason,
      writes: 0,
    }, 503);
  }

  const actor = await requireAdmin(req);
  if (!actor) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "create").trim().toLowerCase();

  if (action === "create") {
    const payloadError = validateCreatePayload(body);
    if (payloadError) return json({ error: payloadError, writes: 0 }, 400);

    const resolved = await resolveCreatePayload(body, actor.id);
    if ("error" in resolved) {
      return json(resolved, Number(resolved.status || 409));
    }

    const { data, error } = await admin.rpc("erp_create_order_with_reservation", {
      _payload: resolved.payload,
    });

    if (error) {
      return json({
        error: "erp_order_command_failed",
        detail: error.message,
      }, 409);
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
      const { data, error } = await admin.rpc("commit_order_inventory_internal", {
        _order_id: orderId,
      });
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
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(200, Math.max(1, requestedLimit))
      : 100;

    const { data, error } = await admin.rpc("erp_expire_due_reservations", {
      _limit: limit,
    });
    if (error) return json({ error: "reservation_expiry_failed", detail: error.message }, 409);
    return json({ ok: true, action, environment: "staging", result: data });
  }

  return json({ error: "invalid_action", writes: 0 }, 400);
});
