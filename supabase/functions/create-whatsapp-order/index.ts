import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-whatsapp-order-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const configuredToken = Deno.env.get("WHATSAPP_ORDER_INGEST_TOKEN");
  if (!configuredToken || req.headers.get("x-whatsapp-order-token") !== configuredToken) return response({ error: "unauthorized" }, 401);
  let payload: any;
  try { payload = await req.json(); } catch { return response({ error: "invalid_json" }, 400); }
  const customerName = String(payload.customer_name ?? "").trim();
  const customerPhone = String(payload.customer_phone ?? "").trim();
  const idempotencyKey = String(payload.external_idempotency_key ?? "").trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!customerName || !customerPhone || !idempotencyKey || !items.length) return response({ error: "missing_required_fields" }, 422);
  const normalizedItems = items.map((item: any) => ({ product_id: String(item.product_id ?? "").trim(), quantity: Math.max(1, Math.floor(Number(item.quantity))), unit_price: Number(item.unit_price) }));
  if (normalizedItems.some((item: any) => !item.product_id || !Number.isFinite(item.unit_price) || item.unit_price < 0 || !Number.isInteger(item.quantity))) return response({ error: "invalid_items" }, 422);
  const subtotal = normalizedItems.reduce((sum: number, item: any) => sum + item.quantity * item.unit_price, 0);
  const deliveryFee = Number(payload.delivery_fee ?? 0);
  const total = Number(payload.total ?? subtotal + deliveryFee);
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || !Number.isFinite(total) || Math.abs(total - subtotal - deliveryFee) > 0.01) return response({ error: "invalid_total" }, 422);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json", Prefer: "return=representation" };
  const lookup = await fetch(supabaseUrl + "/rest/v1/orders?external_idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&select=id,order_code,status,total", { headers });
  if (!lookup.ok) return response({ error: "erp_lookup_failed" }, 502);
  const existing = await lookup.json();
  if (existing.length) return response({ ok: true, duplicate: true, order: existing[0] });
  const orderPayload = { customer_name: customerName, customer_phone: customerPhone, customer_address: String(payload.customer_address ?? "").trim() || null, delivery_method: String(payload.delivery_method ?? "pickup"), total, subtotal, delivery_fee: deliveryFee, payment_method: String(payload.payment_method ?? "").trim() || null, payment_status: "pending", order_status: "novo", status: "novo", sales_channel: "whatsapp", notes: String(payload.notes ?? "").trim() || null, external_idempotency_key: idempotencyKey, source_conversation_id: String(payload.source_conversation_id ?? "").trim() || null };
  const orderRequest = await fetch(supabaseUrl + "/rest/v1/orders", { method: "POST", headers, body: JSON.stringify(orderPayload) });
  const orderRows = await orderRequest.json();
  if (!orderRequest.ok || !orderRows?.[0]) return response({ error: "erp_order_creation_failed" }, 502);
  const order = orderRows[0];
  const itemRequest = await fetch(supabaseUrl + "/rest/v1/order_items", { method: "POST", headers, body: JSON.stringify(normalizedItems.map((item: any) => ({ order_id: order.id, product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price }))) });
  if (!itemRequest.ok) return response({ error: "erp_items_creation_failed" }, 502);
  return response({ ok: true, duplicate: false, order: { id: order.id, order_code: order.order_code, status: order.status, total: order.total } }, 201);
});
