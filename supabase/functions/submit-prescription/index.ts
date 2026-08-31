import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PRODUCTS = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"]);
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const ADMIN_LINK = "https://atacadaodosmedicamentos.com.br/admin/receitas";

function origin(req: Request) {
  const current = req.headers.get("origin") || "";
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") || "").split(",").map((v) => v.trim()).filter(Boolean);
  const allowed = new Set([
    "https://atacadaodosmedicamentos.com.br",
    "https://www.atacadaodosmedicamentos.com.br",
    "http://localhost:5173",
    "http://localhost:8080",
    ...configured,
  ]);
  return allowed.has(current) ? current : "https://atacadaodosmedicamentos.com.br";
}

function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": origin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

function validStr(v: unknown, min: number, max: number) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}

function parseProductIds(raw: FormDataEntryValue | null): string[] | null {
  if (raw == null || raw === "") return [];
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_PRODUCTS) return null;
    const ids = Array.from(new Set(parsed.map(String)));
    return ids.every((id) => UUID_RE.test(id)) ? ids : null;
  } catch {
    return null;
  }
}

function smtpConfig() {
  const username = (Deno.env.get("SMTP_USERNAME") || "").trim();
  const password = Deno.env.get("SMTP_PASSWORD") || "";
  const from = (Deno.env.get("SMTP_FROM") || username).trim();
  const host = (Deno.env.get("SMTP_HOSTNAME") || "smtp.hostinger.com").trim();
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  return { username, password, from, host, port, ready: !!username && !!password && !!from };
}

function sanitizeError(value: unknown) {
  return String(value || "erro desconhecido")
    .replace(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/g, "[email]")
    .replace(/eyJ[A-Za-z0-9._-]{10,}/g, "[token]")
    .slice(0, 400);
}

async function emailLog(admin: any, prescriptionId: string, recipient: string, status: string, error: string | null = null) {
  await admin.from("prescription_email_log").insert({
    prescription_id: prescriptionId,
    recipient,
    status,
    error: error ? sanitizeError(error) : null,
  });
}

async function primaryAdminEmail(admin: any): Promise<string | null> {
  const { data: role } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  const userId = role?.user_id ? String(role.user_id) : "";
  if (!userId) return null;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  const email = String(data?.user?.email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function notifyAdminByEmail(admin: any, prescriptionId: string, createdAt: string) {
  try {
    const { data: already } = await admin
      .from("prescription_email_log")
      .select("id")
      .eq("prescription_id", prescriptionId)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (already) return;

    const recipient = await primaryAdminEmail(admin);
    if (!recipient) {
      await emailLog(admin, prescriptionId, "(admin_sem_email)", "invalid_recipient", "conta de administrador sem e-mail válido");
      return;
    }

    const cfg = smtpConfig();
    if (!cfg.ready) {
      await emailLog(admin, prescriptionId, recipient, "no_provider", "SMTP ainda não configurado");
      return;
    }

    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.username, pass: cfg.password },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 20000,
    });
    const when = new Date(createdAt || Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    await transport.sendMail({
      from: `"Atacadão dos Medicamentos" <${cfg.from}>`,
      to: recipient,
      subject: "Nova receita recebida | Atacadão dos Medicamentos",
      text: `Uma nova receita foi recebida pelo site em ${when} e aguarda análise. Acesse o painel administrativo: ${ADMIN_LINK}`,
      html: `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#202124"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px"><h2 style="margin:0 0 12px">Nova receita recebida</h2><p style="line-height:1.6">Uma nova receita foi enviada pelo site em <strong>${when}</strong> e está aguardando análise no painel administrativo.</p><p style="margin:28px 0"><a href="${ADMIN_LINK}" style="display:inline-block;background:#0f6b3e;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Abrir painel de receitas</a></p><p style="font-size:13px;line-height:1.6;color:#6b7280">Por privacidade e segurança, este e-mail não contém nome do paciente, telefone, medicamentos nem arquivo da receita.</p></div></body></html>`,
    });

    await emailLog(admin, prescriptionId, recipient, "sent", null);
  } catch (e) {
    try {
      await emailLog(admin, prescriptionId, "(desconhecido)", "failed", (e as Error)?.message || "smtp_error");
    } catch { /* e-mail é best effort e nunca bloqueia a receita */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const bearer = req.headers.get("authorization") || "";
    if (!bearer.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);
    const { data: authData, error: authError } = await admin.auth.getUser(bearer.slice(7));
    const userId = authData.user?.id;
    if (authError || !userId) return json(req, { error: "unauthorized" }, 401);

    const form = await req.formData();
    const name = validStr(form.get("name"), 2, 120);
    const phone = validStr(form.get("phone"), 8, 20);
    const notesRaw = form.get("notes");
    const notes = notesRaw ? validStr(notesRaw, 0, 500) : null;
    const file = form.get("file");
    const productIds = parseProductIds(form.get("product_ids"));

    if (!name || !phone) return json(req, { error: "Nome e telefone são obrigatórios." }, 400);
    if (notesRaw && notes === null) return json(req, { error: "Observação inválida." }, 400);
    if (productIds === null) return json(req, { error: "Lista de produtos inválida." }, 400);
    if (!(file instanceof File) || file.size <= 0) return json(req, { error: "Anexe a imagem ou o PDF da receita." }, 400);
    if (file.size > MAX_BYTES) return json(req, { error: "Arquivo até 10 MB." }, 400);

    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) return json(req, { error: "Tipo de arquivo não permitido." }, 400);

    if (productIds.length > 0) {
      const { data: products, error: productError } = await admin
        .from("products")
        .select("id,active,controlled,requires_prescription")
        .in("id", productIds);
      if (productError || !products || products.length !== productIds.length) {
        return json(req, { error: "Não foi possível validar os medicamentos da receita." }, 400);
      }
      if (products.some((p: any) => !p.active || (!p.controlled && !p.requires_prescription))) {
        return json(req, { error: "A receita contém um produto que não exige análise." }, 400);
      }
    }

    const ext = EXT_BY_MIME[mime];
    const path = `submissions/${userId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from("prescriptions").upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "0",
    });
    if (uploadError) return json(req, { error: "Falha ao salvar o arquivo." }, 500);

    const { data: prescription, error: insertError } = await admin
      .from("prescriptions")
      .insert({
        customer_name: name,
        customer_phone: phone,
        notes,
        file_url: path,
        status: "recebida",
        user_id: userId,
        product_id: productIds[0] ?? null,
        product_ids: productIds,
      })
      .select("id,status,product_id,product_ids,created_at")
      .single();

    if (insertError || !prescription) {
      await admin.storage.from("prescriptions").remove([path]);
      return json(req, { error: "Falha ao registrar a receita." }, 500);
    }

    const mailTask = notifyAdminByEmail(admin, prescription.id, prescription.created_at);
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(mailTask);
    else await mailTask;

    return json(req, { ok: true, prescription });
  } catch {
    return json(req, { error: "Erro inesperado." }, 500);
  }
});
