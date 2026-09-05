import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";

const APP_DOMAIN = "atacadaodosmedicamentos.com.br";
const CART_LINK = `https://${APP_DOMAIN}/carrinho`;

function allowedOrigin(req: Request) {
  const current = req.headers.get("origin") || "";
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") || "").split(",").map((v) => v.trim()).filter(Boolean);
  const allowed = new Set([
    `https://${APP_DOMAIN}`,
    `https://www.${APP_DOMAIN}`,
    "http://localhost:5173",
    "http://localhost:8080",
    ...configured,
  ]);
  return allowed.has(current) ? current : `https://${APP_DOMAIN}`;
}

function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req),
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

async function logMail(admin: any, prescriptionId: string, recipient: string, status: string, error: string | null = null) {
  await admin.from("prescription_email_log").insert({
    prescription_id: prescriptionId,
    recipient,
    status,
    error: error ? sanitizeError(error) : null,
  });
}

async function notifyCustomerApproved(admin: any, prescriptionId: string) {
  const { data: already } = await admin
    .from("prescription_email_log")
    .select("id")
    .eq("prescription_id", prescriptionId)
    .eq("status", "customer_approved_sent")
    .limit(1)
    .maybeSingle();
  if (already) return { sent: true, already_sent: true };

  const { data: prescription, error: prescriptionError } = await admin
    .from("prescriptions")
    .select("id,user_id,customer_name,status,approved_at")
    .eq("id", prescriptionId)
    .maybeSingle();
  if (prescriptionError || !prescription) return { sent: false, reason: "prescription_not_found" };
  if (String(prescription.status) !== "aprovada") return { sent: false, reason: "not_approved" };
  if (!prescription.user_id) {
    await logMail(admin, prescriptionId, "(cliente_sem_usuario)", "customer_approved_no_recipient", "receita sem usuário vinculado");
    return { sent: false, reason: "no_user" };
  }

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(String(prescription.user_id));
  const recipient = String(authUser?.user?.email || "").trim().toLowerCase();
  if (authError || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    await logMail(admin, prescriptionId, "(cliente_sem_email)", "customer_approved_no_recipient", authError?.message || "e-mail inválido");
    return { sent: false, reason: "no_email" };
  }

  const cfg = smtpConfig();
  if (!cfg.ready) {
    await logMail(admin, prescriptionId, recipient, "customer_approved_no_provider", "SMTP não configurado");
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.username, pass: cfg.password },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 20000,
    });
    const firstName = String(prescription.customer_name || "cliente").trim().split(/\s+/)[0] || "cliente";

    await transport.sendMail({
      from: `"Atacadão dos Medicamentos" <${cfg.from}>`,
      to: recipient,
      subject: "Sua receita foi aprovada | Atacadão dos Medicamentos",
      text: `Olá, ${firstName}. Sua receita foi analisada e aprovada. Os itens vinculados já estão liberados para continuar a compra no carrinho: ${CART_LINK}`,
      html: `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#202124"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px"><h2 style="margin:0 0 12px;color:#0f6b3e">Receita aprovada</h2><p style="line-height:1.6">Olá, <strong>${firstName}</strong>. Sua receita foi analisada e aprovada.</p><p style="line-height:1.6">Os itens vinculados à receita já estão liberados para você continuar a compra.</p><p style="margin:28px 0"><a href="${CART_LINK}" style="display:inline-block;background:#0f6b3e;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Continuar compra</a></p><p style="font-size:13px;line-height:1.6;color:#6b7280">Por privacidade, este e-mail não informa o medicamento nem exibe o arquivo da receita.</p></div></body></html>`,
    });
    await logMail(admin, prescriptionId, recipient, "customer_approved_sent", null);
    return { sent: true, already_sent: false };
  } catch (e) {
    await logMail(admin, prescriptionId, recipient, "customer_approved_failed", (e as Error)?.message || "smtp_error");
    return { sent: false, reason: "smtp_error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const prescriptionId = String(body?.prescription_id || "");
    const status = String(body?.status || "");
    const internalNotes = body?.internal_notes == null ? null : String(body.internal_notes).slice(0, 4000);
    if (!prescriptionId || !status) return json(req, { error: "missing_fields" }, 400);

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser(authHeader.slice(7));
    if (userError || !userData.user) return json(req, { error: "unauthorized" }, 401);

    const { data: review, error: reviewError } = await caller.rpc("seller_review_prescription", {
      _prescription_id: prescriptionId,
      _status: status,
      _internal_notes: internalNotes,
    });
    if (reviewError) return json(req, { error: reviewError.message }, 403);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let customerNotification: Record<string, unknown> | null = null;
    if (status === "aprovada") {
      customerNotification = await notifyCustomerApproved(admin, prescriptionId);
    }

    return json(req, { ok: true, review, customer_notification: customerNotification });
  } catch (e) {
    return json(req, { error: sanitizeError((e as Error)?.message || e) }, 500);
  }
});
