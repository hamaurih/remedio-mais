const OFFICIAL_SUPABASE_URL = "https://jzltdocmvvdlyaukwzix.supabase.co";
// Chave anon legada é pública e de baixo privilégio; serve apenas para passar pela
// validação JWT do gateway. A autorização real da migração é feita pelo token
// temporário validado server-side dentro da Edge Function.
const OFFICIAL_LEGACY_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6bHRkb2NtdnZkbHlhdWt3eml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNTUwOTQsImV4cCI6MjA5NTYzMTA5NH0.9nPn2NduNzxi2jMnNp_Vqo9CT_ye-YWRIqWNgnKkDi8";

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

export default {
  async fetch(request: Request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    if (!token) return json({ error: "unauthorized" }, 401);
    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const kind = url.searchParams.get("kind") === "banners" ? "banners" : "products";
    const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit")) || 100));
    const supabaseUrl = (process.env.SUPABASE_URL || OFFICIAL_SUPABASE_URL).replace(/\/$/, "");
    const anonKey = process.env.SUPABASE_ANON_KEY || OFFICIAL_LEGACY_ANON_KEY;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 285_000);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/migrate-legacy-media`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          "x-migration-token": token,
        },
        body: JSON.stringify({ kind, limit }),
        signal: controller.signal,
      });
      const text = await response.text();
      return new Response(text, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502);
    } finally {
      clearTimeout(timeout);
    }
  },
};
