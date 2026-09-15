import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const APP_URL = "https://www.atacadaodosmedicamentos.com.br";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicAuth = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") || "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const allowed = new Set([
    "https://atacadaodosmedicamentos.com.br",
    "https://www.atacadaodosmedicamentos.com.br",
    "http://localhost:5173",
    "http://localhost:8080",
    ...configured,
  ]);
  return allowed.has(origin) ? origin : APP_URL;
}

function headers(req: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

async function passwordPwned(password: string): Promise<boolean> {
  const raw = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
  const sha1 = Array.from(new Uint8Array(raw))
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "AtacadaoMedicamentos-AdminAuth/1.0" },
    });
    if (!response.ok) return false;
    const text = await response.text();
    return text.split(/\r?\n/).some((line) => line.split(":")[0] === suffix);
  } catch {
    return false;
  }
}

function passwordReason(password: string, email: string) {
  if (password.length < 8) return "too_short";
  if (password.length > 128) return "too_long";
  if (/^\s+$/.test(password)) return "invalid";
  const normalized = password.toLowerCase();
  const common = new Set([
    "12345678", "123456789", "1234567890", "password", "senha123",
    "qwerty123", "11111111", "00000000", "atacadao", "farmacia123",
  ]);
  if (common.has(normalized)) return "common";
  const local = email.split("@")[0]?.toLowerCase() || "";
  if (local.length >= 5 && normalized.includes(local)) return "personal";
  return null;
}

function smtpConfig() {
  const username = (Deno.env.get("SMTP_USERNAME") || "").trim();
  const password = Deno.env.get("SMTP_PASSWORD") || "";
  const from = (Deno.env.get("SMTP_FROM") || username).trim();
  const host = (Deno.env.get("SMTP_HOSTNAME") || "smtp.hostinger.com").trim();
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  return { username, password, from, host, port, ready: !!username && !!password && !!from };
}

async function sendRecoveryEmail(email: string, actionLink: string) {
  const cfg = smtpConfig();
  if (!cfg.ready) return false;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.username, pass: cfg.password },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
  await transport.sendMail({
    from: `"Atacadão dos Medicamentos" <${cfg.from}>`,
    to: email,
    subject: "Redefina sua senha | Atacadão dos Medicamentos",
    text: `A administração solicitou a redefinição da senha da sua conta no Atacadão dos Medicamentos. Abra este link para criar uma nova senha: ${actionLink}\n\nSe você não esperava esta mensagem, entre em contato com a loja.`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#202124"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px"><h2 style="margin:0 0 12px">Redefinição de senha</h2><p style="line-height:1.6">A administração do <strong>Atacadão dos Medicamentos</strong> solicitou a redefinição da senha da sua conta.</p><p style="margin:28px 0"><a href="${actionLink}" style="display:inline-block;background:#0f6b3e;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Criar nova senha</a></p><p style="font-size:13px;line-height:1.6;color:#6b7280">Por segurança, não compartilhe este link.</p></div></body></html>`,
  });
  return true;
}

async function audit(actorId: string, targetId: string, action: "set_password" | "send_reset_link") {
  const { error } = await admin.from("admin_user_security_audit").insert({
    admin_user_id: actorId,
    target_user_id: targetId,
    action,
  });
  if (error) console.error("security audit insert failed", { code: (error as any)?.code || "db_error" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(req, { error: "unauthorized" }, 401);

    const { data: actorData, error: actorError } = await admin.auth.getUser(token);
    const actor = actorData?.user;
    if (actorError || !actor) return json(req, { error: "unauthorized" }, 401);

    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", actor.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json(req, { error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const targetUserId = String(body?.user_id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(targetUserId)) {
      return json(req, { error: "invalid_user" }, 400);
    }
    if (targetUserId === actor.id && action === "set-password") {
      return json(req, { error: "self_reset_not_allowed" }, 400);
    }

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
    const target = targetData?.user;
    if (targetError || !target) return json(req, { error: "user_not_found" }, 404);
    const email = String(target.email || "").trim().toLowerCase();

    if (action === "set-password") {
      const password = String(body?.password || "");
      const reason = passwordReason(password, email);
      if (reason) return json(req, { error: "weak_password", reason }, 400);
      if (await passwordPwned(password)) return json(req, { error: "pwned_password" }, 400);

      const { error } = await admin.auth.admin.updateUserById(targetUserId, { password });
      if (error) {
        console.error("admin password update failed", { code: (error as any)?.code || "auth_error" });
        return json(req, { error: "update_failed" }, 400);
      }
      await audit(actor.id, targetUserId, "set_password");
      return json(req, { ok: true });
    }

    if (action === "send-reset-link") {
      if (!email || !email.includes("@")) return json(req, { error: "user_without_email" }, 400);

      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await admin
        .from("admin_user_security_audit")
        .select("id", { count: "exact", head: true })
        .eq("admin_user_id", actor.id)
        .eq("target_user_id", targetUserId)
        .eq("action", "send_reset_link")
        .gte("created_at", since);
      if ((count || 0) > 0) return json(req, { error: "too_many_attempts" }, 429);

      let sent = false;
      const cfg = smtpConfig();
      if (cfg.ready) {
        try {
          const { data, error } = await admin.auth.admin.generateLink({
            type: "recovery",
            email,
            options: { redirectTo: `${APP_URL}/redefinir-senha` },
          });
          const actionLink = data?.properties?.action_link;
          if (!error && actionLink) sent = await sendRecoveryEmail(email, actionLink);
        } catch (e) {
          console.error("custom recovery email failed", e instanceof Error ? e.message : "smtp_error");
        }
      }
      if (!sent) {
        const { error } = await publicAuth.auth.resetPasswordForEmail(email, {
          redirectTo: `${APP_URL}/redefinir-senha`,
        });
        if (error) {
          console.error("password reset delivery failed", { code: (error as any)?.code || "auth_error" });
          return json(req, { error: "send_failed" }, 400);
        }
      }
      await audit(actor.id, targetUserId, "send_reset_link");
      return json(req, { ok: true });
    }

    return json(req, { error: "invalid_action" }, 400);
  } catch (e) {
    console.error("admin-user-security error", e instanceof Error ? e.message : String(e));
    return json(req, { error: "internal_error" }, 500);
  }
});
