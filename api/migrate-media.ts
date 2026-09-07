const OFFICIAL_SUPABASE_URL = "https://jzltdocmvvdlyaukwzix.supabase.co";
const OLD_HOST = "rwzzhsrcvpcciuatudru.supabase.co";
const PURPOSE = "migrate_legacy_media";
const BANNER_FIELDS = [
  "image_url",
  "desktop_image_url",
  "tablet_image_url",
  "mobile_image_url",
  "product_image_url",
  "background_image_url",
] as const;

export const config = { maxDuration: 300 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function serverConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || OFFICIAL_SUPABASE_URL).replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { supabaseUrl, serviceKey };
}

function authHeaders(serviceKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extra,
  };
}

async function verifyToken(token: string, signal: AbortSignal) {
  const { supabaseUrl, serviceKey } = serverConfig();
  if (!serviceKey) throw new Error("service_role_not_configured");
  const endpoint = new URL(`${supabaseUrl}/rest/v1/_maintenance_tokens`);
  endpoint.searchParams.set("select", "id,purpose,expires_at");
  endpoint.searchParams.set("purpose", `eq.${PURPOSE}`);
  endpoint.searchParams.set("token_hash", `eq.${token}`);
  endpoint.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);
  endpoint.searchParams.set("limit", "1");
  const response = await fetch(endpoint, {
    headers: authHeaders(serviceKey, { Accept: "application/json" }),
    signal,
  });
  if (!response.ok) throw new Error(`token_lookup_${response.status}`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.length === 1;
}

function sanitizeName(source: string) {
  try {
    const pathname = new URL(source).pathname;
    const raw = decodeURIComponent(pathname.split("/").pop() || "image");
    return raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "image";
  } catch {
    return `image-${crypto.randomUUID()}`;
  }
}

async function uploadRemote(source: string, bucket: "products" | "banners", path: string, signal: AbortSignal) {
  const { supabaseUrl, serviceKey } = serverConfig();
  const origin = await fetch(source, { redirect: "follow", signal });
  if (!origin.ok) throw new Error(`origin_${origin.status}`);
  const bytes = await origin.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("origin_empty");
  const contentType = origin.headers.get("content-type") || "application/octet-stream";
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`;
  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: authHeaders(serviceKey, {
      "Content-Type": contentType,
      "x-upsert": "true",
      "Cache-Control": "31536000",
    }),
    body: bytes,
    signal,
  });
  if (!uploaded.ok) {
    const detail = await uploaded.text().catch(() => "");
    throw new Error(`upload_${uploaded.status}:${detail.slice(0, 120)}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

async function patchRow(table: string, id: string, patch: Record<string, string>, signal: AbortSignal) {
  const { supabaseUrl, serviceKey } = serverConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/${table}`);
  endpoint.searchParams.set("id", `eq.${id}`);
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: authHeaders(serviceKey, {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(patch),
    signal,
  });
  if (!response.ok) throw new Error(`patch_${table}_${response.status}`);
}

async function getRows(table: string, params: Record<string, string>, signal: AbortSignal) {
  const { supabaseUrl, serviceKey } = serverConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value);
  const response = await fetch(endpoint, {
    headers: authHeaders(serviceKey, { Accept: "application/json" }),
    signal,
  });
  if (!response.ok) throw new Error(`select_${table}_${response.status}`);
  return (await response.json()) as Array<Record<string, any>>;
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

async function migrateProducts(limit: number, signal: AbortSignal) {
  const rows = await getRows("products", {
    select: "id,image_url",
    active: "eq.true",
    stock: "gt.0",
    image_url: `like.*${OLD_HOST}*`,
    order: "id.asc",
    limit: String(limit),
  }, signal);

  let success = 0;
  const failures: Array<{ id: string; error: string }> = [];
  await runPool(rows, 20, async (row) => {
    try {
      const source = String(row.image_url || "");
      if (!source.includes(OLD_HOST)) return;
      const path = `legacy/${row.id}-${sanitizeName(source)}`;
      const publicUrl = await uploadRemote(source, "products", path, signal);
      await patchRow("products", String(row.id), { image_url: publicUrl }, signal);
      success += 1;
    } catch (error) {
      failures.push({ id: String(row.id), error: error instanceof Error ? error.message : String(error) });
    }
  });

  return { selected: rows.length, success, failed: failures.length, failures: failures.slice(0, 30) };
}

async function migrateBanners(signal: AbortSignal) {
  const rows = await getRows("banners", {
    select: "id,image_url,desktop_image_url,tablet_image_url,mobile_image_url,product_image_url,background_image_url",
    active: "eq.true",
    order: "position.asc",
  }, signal);
  let copied = 0;
  const failures: Array<{ id: string; field: string; error: string }> = [];

  for (const row of rows) {
    const patch: Record<string, string> = {};
    for (const field of BANNER_FIELDS) {
      const source = row[field] ? String(row[field]) : "";
      if (!source.includes(OLD_HOST)) continue;
      try {
        const path = `legacy/${row.id}-${field}-${sanitizeName(source)}`;
        patch[field] = await uploadRemote(source, "banners", path, signal);
        copied += 1;
      } catch (error) {
        failures.push({ id: String(row.id), field, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (Object.keys(patch).length > 0) await patchRow("banners", String(row.id), patch, signal);
  }

  return { banners: rows.length, copied, failed: failures.length, failures };
}

export default {
  async fetch(request: Request) {
    if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method_not_allowed" }, 405);
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    if (!token) return json({ error: "unauthorized" }, 401);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 285_000);
    try {
      const allowed = await verifyToken(token, controller.signal);
      if (!allowed) return json({ error: "unauthorized" }, 401);
      if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });

      const kind = url.searchParams.get("kind") === "banners" ? "banners" : "products";
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
      const result = kind === "banners"
        ? await migrateBanners(controller.signal)
        : await migrateProducts(limit, controller.signal);
      return json({ ok: true, kind, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: message }, message === "service_role_not_configured" ? 503 : 500);
    } finally {
      clearTimeout(timeout);
    }
  },
};
