import { createClient } from "npm:@supabase/supabase-js@2";
import { buildProductReadModel } from "../_shared/erp/product-service.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const S = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(U, S, { auth: { persistSession: false, autoRefreshToken: false } });

const SELECT = [
  "id","name","slug","sku","barcode","trier_product_id","manufacturer","laboratory",
  "active","requires_prescription","controlled",
  "price","price_base","ecommerce_price","promo_price",
  "site_price","site_promo_price","whatsapp_price","whatsapp_promo_price",
  "pdv_price","pdv_promo_price","promotion_start","promotion_end",
  "stock","stock_quantity","trier_stock_quantity","last_stock_sync_at",
  "trier_active","manual_disabled","archived_at","force_active",
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
  const action = String(body?.action || "get");
  const channel = String(body?.channel || "site");
  const limit = Math.max(1, Math.min(Number(body?.limit) || 20, 50));

  if (action === "get") {
    const id = String(body?.id || "").trim();
    const code = String(body?.code || "").trim();
    if (!id && !code) return json({ error: "id_or_code_required" }, 400);

    let query = admin.from("products").select(SELECT);
    if (id) query = query.eq("id", id);
    else query = query.or([
      `trier_product_id.eq.${code}`,
      `sku.eq.${code}`,
      `barcode.eq.${code}`,
      `trier_barcode.eq.${code}`,
    ].join(","));

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) return json({ error: "product_query_failed" }, 500);
    if (!data) return json({ error: "not_found" }, 404);
    return json({ ok: true, mode: "read_only", product: buildProductReadModel(data as any, channel) });
  }

  if (action === "search") {
    const term = String(body?.query || "").trim().slice(0, 100);
    if (!term) return json({ ok: true, mode: "read_only", products: [] });

    const safe = term.replace(/[%_]/g, "");
    const { data, error } = await admin
      .from("products")
      .select(SELECT)
      .or(`name.ilike.%${safe}%,manufacturer.ilike.%${safe}%,barcode.eq.${safe},trier_product_id.eq.${safe},sku.eq.${safe}`)
      .limit(limit);
    if (error) return json({ error: "product_search_failed" }, 500);

    return json({
      ok: true,
      mode: "read_only",
      products: (data || []).map((row: any) => buildProductReadModel(row, channel)),
    });
  }

  return json({ error: "invalid_action" }, 400);
});
