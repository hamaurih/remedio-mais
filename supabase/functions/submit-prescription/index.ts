import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { safeLog, safeError, maskId, maskPath, maskPhone } from "../_shared/mask.ts";
import { resolveRequestTenant, TenantResolutionError, withTenant } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validStr(v: unknown, min: number, max: number) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length < min || t.length > max) return null;
  return t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const form = await req.formData();
    const name = validStr(form.get("name"), 2, 120);
    const phone = validStr(form.get("phone"), 8, 20);
    const notesRaw = form.get("notes");
    const notes = notesRaw ? validStr(notesRaw, 0, 500) : null;
    const file = form.get("file");

    if (!name || !phone) return json({ error: "Nome e telefone são obrigatórios." }, 400);
    if (notesRaw && notes === null) return json({ error: "Observação inválida." }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    let tenant;
    try {
      tenant = await resolveRequestTenant(admin, {
        organization_id: form.get("organization_id"),
        store_id: form.get("store_id"),
      });
    } catch (error) {
      return json({
        error: error instanceof TenantResolutionError
          ? error.message
          : "Não foi possível identificar a loja.",
      }, 400);
    }

    let file_url: string | null = null;

    if (file && file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return json({ error: "Arquivo até 10 MB." }, 400);
      const mime = (file.type || "").toLowerCase();
      if (!ALLOWED_MIME.has(mime)) return json({ error: "Tipo de arquivo não permitido." }, 400);
      const ext = EXT_BY_MIME[mime];
      const rand = crypto.randomUUID();
      const path = `${tenant.organizationId}/${tenant.storeId}/submissions/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${rand}.${ext}`;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from("prescriptions")
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (upErr) {
        safeError("[submit-prescription] upload error", { message: upErr.message, mime, size: file.size, path: maskPath(path) });
        return json({ error: "Falha ao salvar o arquivo." }, 500);
      }
      file_url = path;
      safeLog("[submit-prescription] upload ok", { path: maskPath(path), mime, size: file.size });
    }

    const auth = req.headers.get("authorization") || "";
    let user_id: string | null = null;
    if (auth.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(auth.slice(7));
      user_id = data.user?.id ?? null;
    }

    const { error: insErr } = await admin.from("prescriptions").insert(withTenant({
      customer_name: name,
      customer_phone: phone,
      notes,
      file_url,
      status: "recebida",
      user_id,
    }, tenant));
    if (insErr) {
      safeError("[submit-prescription] insert error", { message: insErr.message, user_id: maskId(user_id ?? "") });
      return json({ error: "Falha ao registrar a receita." }, 500);
    }

    safeLog("[submit-prescription] saved", { user_id: maskId(user_id ?? ""), phone: maskPhone(phone), has_file: !!file_url });
    return json({ ok: true });
  } catch (e) {
    safeError("[submit-prescription] unexpected", { message: (e as Error)?.message });
    return json({ error: "Erro inesperado." }, 500);
  }
});
