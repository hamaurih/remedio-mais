import { createClient } from "npm:@supabase/supabase-js@2";
import { compareProductShadow } from "../_shared/erp/shadow-mode.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const S = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const { data: actorData, error: actorError } = await admin.auth.getUser(token);
  const actor = actorData?.user;
  if (actorError || !actor) return json({ error: "unauthorized" }, 401);

  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", actor.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body?.limit) || 500, 1000));
  const offset = Math.max(0, Number(body?.offset) || 0);
  const now = Date.now();

  const fields = [
    "id","name","price","price_base","promo_price",
    "site_price","site_promo_price","whatsapp_price","whatsapp_promo_price",
    "pdv_price","pdv_promo_price","promotion_start","promotion_end",
    "stock","stock_quantity","trier_stock_quantity","trier_active",
    "manual_disabled","archived_at","force_active",
  ].join(",");

  const { data, error, count } = await admin
    .from("products")
    .select(fields, { count: "exact" })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return json({ error: "shadow_query_failed" }, 500);

  const rows = data || [];
  const comparisons = rows.map((row: any) => compareProductShadow(row, now));
  const divergent = comparisons.filter((r) => !r.ok);
  const byField: Record<string, number> = {};
  for (const row of divergent) {
    for (const mismatch of row.mismatches) {
      byField[mismatch.field] = (byField[mismatch.field] || 0) + 1;
    }
  }

  return json({
    ok: divergent.length === 0,
    mode: "read_only_shadow",
    writes: 0,
    offset,
    limit,
    total_products: count ?? null,
    checked: comparisons.length,
    matched: comparisons.length - divergent.length,
    divergent: divergent.length,
    divergence_rate: comparisons.length ? divergent.length / comparisons.length : 0,
    by_field: byField,
    examples: divergent.slice(0, 50),
    checked_at: new Date(now).toISOString(),
  });
});
