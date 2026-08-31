import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://atacadaodosmedicamentos.com.br";
const WINDOW_MS = 30 * 60 * 1000;
const LOCK_MS = 30 * 60 * 1000;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).filter(Boolean);
  const allowed = new Set([APP_URL, "https://www.atacadaodosmedicamentos.com.br", "http://localhost:5173", "http://localhost:8080", ...configured]);
  return allowed.has(origin) ? origin : APP_URL;
}
function headers(req: Request) { return {
  "Access-Control-Allow-Origin": allowedOrigin(req),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json",
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin",
}; }
function json(req: Request, body: unknown, status=200) { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function ip(req: Request) { return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"; }
async function digest(value: string) {
  const data = new TextEncoder().encode(`${SERVICE_KEY}:${value}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function getAttempt(key:string) {
  const { data } = await admin.from("auth_login_attempts").select("key_hash,failures,window_started_at,locked_until").eq("key_hash",key).maybeSingle();
  return data as any;
}
function blocked(a:any, now:number) { if(!a?.locked_until) return 0; const t=new Date(a.locked_until).getTime(); return t>now?Math.ceil((t-now)/1000):0; }
async function hit(key:string, limit:number, now:number) {
  const cur:any=await getAttempt(key); const start=cur?new Date(cur.window_started_at).getTime():0; const within=cur&&now-start<WINDOW_MS;
  const failures=within?Math.min(1000,Number(cur.failures||0)+1):1; const lockedUntil=failures>=limit?new Date(now+LOCK_MS).toISOString():null;
  await admin.from("auth_login_attempts").upsert({key_hash:key,failures,window_started_at:within?cur.window_started_at:new Date(now).toISOString(),last_failed_at:new Date(now).toISOString(),locked_until:lockedUntil,updated_at:new Date(now).toISOString()},{onConflict:"key_hash"});
  return lockedUntil;
}
async function passwordPwned(password:string):Promise<boolean> {
  const bytes = new TextEncoder().encode(password);
  const raw = await crypto.subtle.digest("SHA-1", bytes);
  const sha1 = Array.from(new Uint8Array(raw)).map(b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
  const prefix=sha1.slice(0,5), suffix=sha1.slice(5);
  try {
    const r=await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {headers:{"Add-Padding":"true","User-Agent":"AtacadaoMedicamentos-Auth/1.0"}});
    if(!r.ok) return false;
    const text=await r.text();
    return text.split(/\r?\n/).some(line=>line.split(":")[0]===suffix);
  } catch { return false; }
}
function passwordReason(password:string,email:string) {
  if(password.length<8) return "too_short";
  if(password.length>128) return "too_long";
  if(/^\s+$/.test(password)) return "invalid";
  const normalized=password.toLowerCase();
  const common=new Set(["12345678","123456789","1234567890","password","senha123","qwerty123","11111111","00000000","atacadao","farmacia123"]);
  if(common.has(normalized)) return "common";
  const local=email.split("@")[0]?.toLowerCase() || "";
  if(local.length>=5 && normalized.includes(local)) return "personal";
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

async function sendRecoveryEmail(email:string, actionLink:string) {
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
    text: `Recebemos uma solicitação para redefinir a senha da sua conta no Atacadão dos Medicamentos. Abra este link para criar uma nova senha: ${actionLink}\n\nSe você não solicitou esta alteração, ignore este e-mail.`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#202124"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px"><h2 style="margin:0 0 12px">Redefinição de senha</h2><p style="line-height:1.6">Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Atacadão dos Medicamentos</strong>.</p><p style="margin:28px 0"><a href="${actionLink}" style="display:inline-block;background:#0f6b3e;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Redefinir minha senha</a></p><p style="font-size:13px;line-height:1.6;color:#6b7280">Se você não solicitou esta alteração, ignore este e-mail. Por segurança, não compartilhe este link.</p></div></body></html>`,
  });
  return true;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:headers(req)});
  if(req.method!=="POST") return json(req,{error:"method_not_allowed"},405);
  if(!ANON_KEY) return json(req,{error:"auth_unavailable"},503);
  try {
    const body=await req.json().catch(()=>({})); const action=String(body?.action||"");
    const email=String(body?.email||"").trim().toLowerCase();
    if(!email || email.length>254 || !email.includes("@")) return json(req,{error:"invalid_email"},400);
    const now=Date.now(); const emailKey=`${action}:email:${await digest(email)}`; const ipKey=`${action}:ip:${await digest(ip(req))}`;
    const [ea,ia]=await Promise.all([getAttempt(emailKey),getAttempt(ipKey)]); const retry=Math.max(blocked(ea,now),blocked(ia,now));
    if(retry>0) return json(req,{error:"too_many_attempts",retry_after:retry},429);

    if(action==="request-reset") {
      await Promise.all([hit(emailKey,3,now),hit(ipKey,15,now)]);
      const cfg = smtpConfig();
      if (cfg.ready) {
        try {
          const { data, error } = await admin.auth.admin.generateLink({
            type: "recovery",
            email,
            options: { redirectTo: `${APP_URL}/redefinir-senha` },
          });
          const actionLink = data?.properties?.action_link;
          if (!error && actionLink) await sendRecoveryEmail(email, actionLink);
          else if (error) console.error("recovery link generation rejected", { code:(error as any)?.code || "auth_error" });
        } catch (mailError) {
          console.error("custom recovery email failed", mailError instanceof Error ? mailError.message : "smtp_error");
          const { error } = await authClient.auth.resetPasswordForEmail(email,{redirectTo:`${APP_URL}/redefinir-senha`});
          if(error) console.error("password reset fallback rejected", { code:(error as any)?.code || "auth_error" });
        }
      } else {
        const { error } = await authClient.auth.resetPasswordForEmail(email,{redirectTo:`${APP_URL}/redefinir-senha`});
        if(error) console.error("password reset delivery rejected", { code:(error as any)?.code || "auth_error" });
      }
      return json(req,{ok:true,message:"Se o e-mail estiver cadastrado, enviaremos as instruções."});
    }

    if(action==="signup") {
      const password=String(body?.password||""); const name=String(body?.name||"").trim().replace(/[\u0000-\u001F\u007F]/g,"").slice(0,120);
      const reason=passwordReason(password,email); if(reason) return json(req,{error:"weak_password",reason},400);
      if(await passwordPwned(password)) return json(req,{error:"pwned_password"},400);
      const locked=await Promise.all([hit(emailKey,5,now),hit(ipKey,20,now)]);
      if(locked.some(Boolean)) return json(req,{error:"too_many_attempts",retry_after:Math.ceil(LOCK_MS/1000)},429);
      const { data,error }=await authClient.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:APP_URL}});
      if(error) {
        const msg=String(error.message||"");
        if(/already|registered|exists/i.test(msg)) return json(req,{error:"account_exists"},409);
        if(/weak|password/i.test(msg)) return json(req,{error:"weak_password"},400);
        console.error("signup failed",{code:(error as any)?.code || "auth_error"});
        return json(req,{error:"signup_failed"},400);
      }
      if(data.user?.id) {
        const { error: profileError } = await admin.from("profiles").upsert({
          id:data.user.id,
          email:data.user.email || email,
          full_name:name || null,
        },{onConflict:"id"});
        if(profileError) console.error("signup profile upsert failed", { code:(profileError as any)?.code || "db_error" });
      }
      await admin.from("auth_login_attempts").delete().eq("key_hash",emailKey);
      return json(req,{ok:true,session:data.session?{access_token:data.session.access_token,refresh_token:data.session.refresh_token}:null,needs_email_confirmation:!data.session});
    }

    return json(req,{error:"invalid_action"},400);
  } catch(e){ console.error("secure-account-auth error",e instanceof Error?e.message:String(e)); return json(req,{error:"auth_unavailable"},503); }
});
