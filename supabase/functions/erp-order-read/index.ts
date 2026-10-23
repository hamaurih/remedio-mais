import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCanonicalOrder } from "../_shared/erp/order-service.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const S = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(U, S, { auth: { persistSession: false, autoRefreshToken: false } });

const ORDER_FIELDS = [
  "id","order_code","user_id","customer_name","customer_email","customer_phone","store_id",
  "sales_channel","source","created_by",
  "subtotal","discount","delivery_fee","total",
  "payment_gateway","payment_method","payment_status","paid_at",
  "status","order_status","fulfillment_status","delivery_status",
  "trier_eligible","trier_sent","trier_status","trier_sending_at","trier_sent_at",
  "trier_order_id","trier_sale_id","trier_last_error",
  "created_at","updated_at",
].join(",");

const ITEM_FIELDS = [
  "id","product_id","product_name","trier_product_id","variant_id","variant_label",
  "unit_price","quantity","total","requires_prescription","controlled",
  "prescription_id","prescription_condition","item_status",
].join(",");

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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!await requireAdmin(req)) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "list");

  if (action === "get") {
    const id = String(body?.id || "").trim();
    const code = String(body?.order_code || "").trim();
    if (!id && !code) return json({ error: "id_or_order_code_required" }, 400);

    let query = admin.from("orders").select(ORDER_FIELDS);
    query = id ? query.eq("id", id) : query.eq("order_code", code);
    const { data: order, error } = await query.maybeSingle();
    if (error) return json({ error: "order_query_failed" }, 500);
    if (!order) return json({ error: "not_found" }, 404);

    const { data: items, error: itemError } = await admin
      .from("order_items")
      .select(ITEM_FIELDS)
      .eq("order_id", (order as any).id)
      .order("id");
    if (itemError) return json({ error: "order_items_query_failed" }, 500);

    return json({
      ok: true,
      mode: "read_only",
      order: buildCanonicalOrder(order as any, (items || []) as any[]),
    });
  }

  if (action === "list") {
    const limit = Math.max(1, Math.min(Number(body?.limit) || 50, 200));
    const channel = String(body?.channel || "").trim().toLowerCase();

    let query = admin
      .from("orders")
      .select(ORDER_FIELDS)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (channel === "site") query = query.eq("sales_channel", "site");
    else if (channel === "pdv") query = query.in("sales_channel", ["pdv", "balcao"]);
    else if (channel === "whatsapp") query = query.eq("sales_channel", "whatsapp");

    const { data, error } = await query;
    if (error) return json({ error: "orders_query_failed" }, 500);

    return json({
      ok: true,
      mode: "read_only",
      orders: (data || []).map((row: any) => buildCanonicalOrder(row, [])),
    });
  }

  return json({ error: "invalid_action" }, 400);
});
