const OFFICIAL_SUPABASE_URL = "https://jzltdocmvvdlyaukwzix.supabase.co";
const OFFICIAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_geFYMQbAFOJ3d3qazu0RYA_Xa1pBcxL";

type QueryValue = string | number | boolean;

function getSupabaseConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    OFFICIAL_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    OFFICIAL_SUPABASE_PUBLISHABLE_KEY;

  return { url: url.replace(/\/$/, ""), publishableKey };
}

async function fetchPublicRows<T>(
  table: string,
  query: Record<string, QueryValue>,
  signal: AbortSignal,
): Promise<T[]> {
  const { url: supabaseUrl, publishableKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/${table}`);

  Object.entries(query).forEach(([key, value]) => {
    endpoint.searchParams.set(key, String(value));
  });

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} respondeu ${response.status}`);
  }

  return (await response.json()) as T[];
}

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { Allow: "GET, HEAD, OPTIONS" },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(
        { error: "method_not_allowed" },
        {
          status: 405,
          headers: {
            Allow: "GET, HEAD, OPTIONS",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const startedAt = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    try {
      const [settingsRows, menuItems, categories, departments, subcategories] =
        await Promise.all([
          fetchPublicRows<Record<string, unknown>>(
            "store_settings_public",
            { select: "*", id: "eq.1", limit: 1 },
            controller.signal,
          ),
          fetchPublicRows<Record<string, unknown>>(
            "menu_items",
            { select: "*", active: "eq.true", order: "position.asc" },
            controller.signal,
          ),
          fetchPublicRows<Record<string, unknown>>(
            "categories",
            {
              select:
                "id,name,slug,macro_group,show_in_menu,department_id,position",
              active: "eq.true",
              order: "position.asc",
            },
            controller.signal,
          ),
          fetchPublicRows<Record<string, unknown>>(
            "departments",
            {
              select: "id,name,slug,position,show_in_menu",
              active: "eq.true",
              order: "position.asc",
            },
            controller.signal,
          ),
          fetchPublicRows<Record<string, unknown>>(
            "subcategories",
            {
              select: "id,name,slug,category_id,position,show_in_menu",
              active: "eq.true",
              order: "position.asc",
            },
            controller.signal,
          ),
        ]);

      const body = {
        version: 1,
        generatedAt: new Date().toISOString(),
        settings: settingsRows[0] ?? null,
        menuItems,
        categories,
        departments,
        subcategories,
      };

      const headers = new Headers({
        "Cache-Control":
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        "Server-Timing": `supabase;dur=${Math.round(performance.now() - startedAt)}`,
        "X-Public-Bootstrap-Version": "1",
      });

      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }

      return json(body, { status: 200, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "upstream_error";
      return json(
        { error: "public_bootstrap_unavailable", message },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  },
};
