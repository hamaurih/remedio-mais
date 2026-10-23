import { createClient } from "npm:@supabase/supabase-js@2";
import { buildProductReadModel } from "../_shared/erp/product-service.ts";
import { validateOrderDryRun } from "../_shared/erp/order-command.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const S = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

const ALLOWED_CHANNELS = new Set([
  "site","pdv","whatsapp_ia","whatsapp_humano","telefone","b2b","marketplace",
]);

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
  const channel = String(body?.channel || "site").trim().toLowerCase();
  if (!ALLOWED_CHANNELS.has(channel)) return json({ error: "invalid_channel" }, 400);

  const requested = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];
  if (!requested.length) return json({ error: "items_required" }, 400);

  const productIds = Array.from(new Set(
    requested.map((item: any) => String(item?.product_id || "").trim()).filter(Boolean),
  ));
  if (!productIds.length) return json({ error: "valid_product_ids_required" }, 400);

  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_FIELDS)
    .in("id", productIds);
  if (error) return json({ error: "product_query_failed" }, 500);

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

  const result = validateOrderDryRun({
    channel: channel as any,
    requested: requested.map((item: any) => ({
      product_id: String(item?.product_id || "").trim(),
      quantity: Number(item?.quantity),
      expected_unit_price: item?.expected_unit_price == null ? null : Number(item.expected_unit_price),
    })),
    resolved,
    delivery_fee: Number(body?.delivery_fee || 0),
    discount: Number(body?.discount || 0),
  });

  return json({
    ok: true,
    mode: "dry_run_read_only",
    would_create_order: result.accepted,
    result,
    notes: [
      "Nenhum pedido foi criado.",
      "Nenhum estoque foi baixado ou reservado.",
      "Nenhum pagamento foi iniciado.",
      "Nenhuma venda foi enviada ao Trier.",
    ],
  });
});
