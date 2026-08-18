import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_BASE = "https://api-sgf-gateway.triersistemas.com.br/sgfpod1";
const RETRYABLE = new Set([429, 500, 502, 503, 504, 545, 554, 556]);
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function trierFetch(url: string, token: string) {
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    lastStatus = res.status;
    lastBody = await res.text();
    if (res.ok) return { ok: true, status: res.status, body: lastBody };
    if (!RETRYABLE.has(res.status) || attempt === 6) break;
    await sleep(Math.min(8000, 400 * attempt * attempt));
  }
  return { ok: false, status: lastStatus, body: lastBody };
}

function extractList(json: any): any[] {
  if (Array.isArray(json)) return json;
  return json?.dados || json?.produtos || json?.data || json?.items || json?.content || [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

  const supplied = req.headers.get("x-bootstrap-key") || "";
  const { data: expectedKey, error: keyError } = await supabase.rpc("get_trier_bootstrap_key_secret");
  if (keyError || !expectedKey || !supplied || supplied !== expectedKey) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const startOffset = Math.max(0, Number(body?.startOffset || 0));
  const requestedPages = Math.max(1, Number(body?.maxPages || 10));
  const maxPages = Math.min(requestedPages, 15);

  const { data: settings, error: settingsError } = await supabase
    .from("trier_settings")
    .select("base_url,branch_code,page_size,sync_mode,auto_sync_paused")
    .eq("id", 1)
    .single();
  if (settingsError) return Response.json({ error: "settings", detail: settingsError.message }, { status: 500 });

  if (settings.sync_mode !== "create_only" || settings.auto_sync_paused !== true) {
    return Response.json({ error: "unsafe_settings", sync_mode: settings.sync_mode, auto_sync_paused: settings.auto_sync_paused }, { status: 409 });
  }

  const { data: token, error: tokenError } = await supabase.rpc("get_trier_api_token_secret");
  if (tokenError || !token) return Response.json({ error: "missing_trier_token" }, { status: 500 });

  const baseUrl = String(settings.base_url || DEFAULT_BASE).replace(/\/+$/, "");
  const branchCode = String(settings.branch_code || "1");
  const pageSize = Math.min(150, Math.max(1, Number(settings.page_size || 150)));

  let offset = startOffset;
  let pagesProcessed = 0;
  let rowsSeen = 0;
  let done = false;
  const pageResults: any[] = [];

  for (let i = 0; i < maxPages; i++) {
    const qs = new URLSearchParams({
      codFilial: branchCode,
      primeiroRegistro: String(offset),
      quantidadeRegistros: String(pageSize),
      ativo: "true",
      processaCustoMedio: "false",
    });
    const url = `${baseUrl}/rest/integracao/produto/obter-todos-v1?${qs}`;
    const response = await trierFetch(url, String(token));
    if (!response.ok) {
      return Response.json({ error: "trier_http_error", status: response.status, offset, pagesProcessed, rowsSeen, nextOffset: offset }, { status: 502 });
    }

    let json: any;
    try { json = JSON.parse(response.body); }
    catch { return Response.json({ error: "invalid_json", offset, nextOffset: offset }, { status: 502 }); }

    const products = extractList(json);
    if (!Array.isArray(products) || products.length === 0) {
      done = true;
      break;
    }

    const { data: ingest, error: ingestError } = await supabase.rpc("bootstrap_ingest_trier_products", { _payload: products });
    if (ingestError) return Response.json({ error: "ingest_failed", detail: ingestError.message, offset, nextOffset: offset }, { status: 500 });

    pagesProcessed++;
    rowsSeen += products.length;
    pageResults.push({ offset, count: products.length, linked: ingest?.linked_count ?? null });
    offset += products.length;

    if (products.length < pageSize) {
      done = true;
      break;
    }
    await sleep(400);
  }

  return Response.json({ ok: true, mode: "create_only", startOffset, pagesProcessed, rowsSeen, nextOffset: offset, done, pageSize, pageResults });
});
