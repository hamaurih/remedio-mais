import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { safeLog, safeError, maskId, maskPath, maskPhone } from "../_shared/mask.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PRODUCTS = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function parseProductIds(raw: FormDataEntryValue | null): string[] | null {
  if (raw == null || raw === "") return [];
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > MAX_PRODUCTS) return null;
    const ids = Array.from(new Set(value.map(String)));
    return ids.every((id) => UUID_RE.test(id)) ? ids : null;
  } catch {
    return null;
  }
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
    const productIds = parseProductIds(form.get("product_ids"));

    if (!name || !phone) return json({ error: "Nome e telefone são obrigatórios." }, 400);
    if (notesRaw && notes === null) return json({ error: "Observação inválida." }, 400);
    if (productIds === null) return json({ error: "Lista de produtos inválida." }, 400);
    if (productIds.length > 0 && !(file instanceof File && file.size > 0)) {
      return json({ error: "Anexe a imagem ou o PDF da receita." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const auth = req.headers.get("authorization") || "";
    let user_id: string | null = null;
    if (auth.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(auth.slice(7));
      user_id = data.user?.id ?? null;
    }
    if (productIds.length > 0 && !user_id) {
      return json({ error: "Faça login para vincular a receita aos produtos do carrinho." }, 401);
    }

    if (productIds.length > 0) {
      const { data: products, error: productError } = await admin
        .from("products")
        .select("id,active,controlled,requires_prescription")
        .in("id", productIds);
      if (productError || !products || products.length !== productIds.length) {
        return json({ error: "Não foi possível validar os medicamentos da receita." }, 400);
      }
      const invalid = products.some((product) =>
        !product.active || (!product.controlled && !product.requires_prescription)
      );
      if (invalid) return json({ error: "A receita contém um produto que não exige análise." }, 400);
    }

    let file_url: string | null = null;
    if (file && file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return json({ error: "Arquivo até 10 MB." }, 400);
      const mime = (file.type || "").toLowerCase();
      if (!ALLOWED_MIME.has(mime)) return json({ error: "Tipo de arquivo não permitido." }, 400);
      const ext = EXT_BY_MIME[mime];
      const rand = crypto.randomUUID();
      const path = `submissions/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${rand}.${ext}`;

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

    const { data: prescription, error: insErr } = await admin
      .from("prescriptions")
      .insert({
        customer_name: name,
        customer_phone: phone,
        notes,
        file_url,
        status: "recebida",
        user_id,
        product_id: productIds[0] ?? null,
        product_ids: productIds,
      })
      .select("id,status,product_id,product_ids")
      .single();

    if (insErr || !prescription) {
      safeError("[submit-prescription] insert error", { message: insErr?.message, user_id: maskId(user_id ?? "") });
      return json({ error: "Falha ao registrar a receita." }, 500);
    }

    safeLog("[submit-prescription] saved", {
      prescription_id: maskId(prescription.id),
      user_id: maskId(user_id ?? ""),
      phone: maskPhone(phone),
      has_file: !!file_url,
      products: productIds.length,
    });
    return json({ ok: true, prescription });
  } catch (e) {
    safeError("[submit-prescription] unexpected", { message: (e as Error)?.message });
    return json({ error: "Erro inesperado." }, 500);
  }
});
