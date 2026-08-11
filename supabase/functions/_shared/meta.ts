// Helper compartilhado da Meta Conversions API (server-side).
// O access token vive SOMENTE no secret META_CAPI_ACCESS_TOKEN.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const GRAPH_VERSION = "v21.0";
export const CURRENCY = "BRL";

export type MetaUserDataInput = {
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  client_ip_address?: string | null;
  client_user_agent?: string | null;
  external_id?: string | null;
};

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const clean = (v?: string | null) => (typeof v === "string" ? v.trim().toLowerCase() : "");

function normalizePhone(v?: string | null): string {
  const d = (v || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("55") ? d : `55${d}`;
}

/** user_data com hash SHA-256 nos campos exigidos pela Meta. */
export async function buildUserData(input: MetaUserDataInput): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const hashIf = async (key: string, raw: string) => { if (raw) out[key] = [await sha256(raw)]; };

  await hashIf("em", clean(input.email));
  await hashIf("ph", normalizePhone(input.phone));
  await hashIf("fn", clean(input.first_name).replace(/[^a-zà-ú\s-]/gi, ""));
  await hashIf("ln", clean(input.last_name).replace(/[^a-zà-ú\s-]/gi, ""));
  await hashIf("ct", clean(input.city).replace(/[^a-zà-ú]/gi, ""));
  await hashIf("st", clean(input.state).replace(/[^a-z]/gi, ""));
  await hashIf("zp", (input.zip || "").replace(/\D/g, ""));
  await hashIf("country", "br");
  if (input.external_id) out.external_id = [await sha256(clean(input.external_id))];

  // Identificadores não sensíveis: enviados sem hash (regra da Meta).
  if (input.fbp) out.fbp = input.fbp;
  if (input.fbc) out.fbc = input.fbc;
  if (input.client_ip_address) out.client_ip_address = input.client_ip_address;
  if (input.client_user_agent) out.client_user_agent = input.client_user_agent;
  return out;
}

export type MetaEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  event_source_url?: string;
  action_source: "website";
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
};

export type MetaSettings = { pixel_id: string; test_event_code: string | null; capi_enabled: boolean; enabled: boolean };

export async function loadMetaSettings(admin: SupabaseClient): Promise<MetaSettings | null> {
  const { data } = await admin.from("marketing_settings")
    .select("meta_enabled, meta_pixel_id, meta_test_event_code, meta_capi_enabled")
    .eq("id", 1).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row?.meta_pixel_id) return null;
  return {
    pixel_id: String(row.meta_pixel_id),
    test_event_code: (row.meta_test_event_code as string | null) || null,
    capi_enabled: !!row.meta_capi_enabled,
    enabled: !!row.meta_enabled,
  };
}

/** Nunca devolvemos token/PII: só um resumo curto e mascarado da resposta. */
export function maskResponse(text: string): string {
  return text
    .replace(/EAA[A-Za-z0-9_-]{10,}/g, "***token***")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "***@***")
    .slice(0, 500);
}

export type SendResult = { ok: boolean; http_status: number; response: string };

export async function sendToMeta(
  settings: MetaSettings,
  token: string,
  events: MetaEvent[],
  useTestCode: boolean,
): Promise<SendResult> {
  const payload: Record<string, unknown> = { data: events };
  if (useTestCode && settings.test_event_code) payload.test_event_code = settings.test_event_code;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${settings.pixel_id}/events?access_token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  );
  const text = await res.text();
  return { ok: res.ok, http_status: res.status, response: maskResponse(text) };
}

export async function logEvent(
  admin: SupabaseClient,
  row: {
    event_name: string; event_id: string; source: "browser" | "server" | "admin_test";
    order_id?: string | null; product_id?: string | null; value?: number | null;
    test_mode?: boolean; status: "pending" | "sent" | "error" | "skipped";
    http_status?: number | null; response_masked?: string | null;
  },
) {
  await admin.from("meta_event_logs").upsert({
    ...row,
    sent_at: row.status === "sent" ? new Date().toISOString() : null,
  }, { onConflict: "event_id" });
}
