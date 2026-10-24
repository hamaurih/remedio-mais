import { createClient } from "npm:@supabase/supabase-js@2";
import { evaluateOrderWriteGuard } from "../_shared/erp/order-write-guard.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const S = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENABLED = String(Deno.env.get("ERP_ORDER_COMMAND_ENABLED") || "").toLowerCase() === "true";
const ENVIRONMENT = String(Deno.env.get("ERP_ORDER_COMMAND_ENV") || "");

const admin = createClient(U, S, { auth: { persistSession: false, autoRefreshToken: false } });

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

function validatePayload(body: any) {
  const idempotencyKey = String(body?.idempotency_key || "").trim();
  const channel = String(body?.channel || "").trim().toLowerCase();
  const customerName = String(body?.customer?.name || "").trim();
  const customerPhone = String(body?.customer?.phone || "").trim();
  const tenantId = String(body?.tenant_id || "").trim();
  const storeId = String(body?.store_id || "").trim();
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!idempotencyKey) return "idempotency_key_required";
  if (!["site", "pdv", "whatsapp_ia", "whatsapp_humano", "telefone"].includes(channel)) {
    return "invalid_channel";
  }
  if (!tenantId || !storeId) return "tenant_store_required";
  if (!customerName || !customerPhone) return "customer_required";
  if (!items.length) return "items_required";

  for (const item of items) {
    const productId = String(item?.product_id || "").trim();
    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unit_price);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) return "invalid_item";
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return "invalid_item_price";
  }

  return null;
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
  const payloadError = validatePayload(body);
  if (payloadError) return json({ error: payloadError }, 400);

  // Único ponto de escrita: RPC transacional criada exclusivamente na homologação.
  // A Edge Function não faz INSERT/UPDATE/DELETE diretamente.
  const { data, error } = await admin.rpc("erp_create_order_with_reservation", {
    _payload: {
      ...body,
      created_by: actor.id,
    },
  });

  if (error) {
    return json({
      error: "erp_order_command_failed",
      detail: error.message,
    }, 409);
  }

  return json({
    ok: true,
    environment: "staging",
    project_ref: guard.projectRef,
    result: data,
  });
});
