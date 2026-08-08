// Mascaramento de PII/tokens para edge functions.
// Mantido em paralelo com src/lib/maskSensitiveData.ts (edges não importam src/).

const KEYS_TO_REDACT = new Set([
  "authorization", "auth", "token", "access_token", "refresh_token",
  "api_key", "apikey", "secret", "password", "service_role", "service_role_key",
  "mp_token", "mercado_pago_access_token", "mercado_pago_webhook_secret",
  "trier_token", "trier_api_token", "x-signature",
]);

export function maskCpf(cpf?: string | null): string {
  if (!cpf) return "";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return "***";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}
export function maskPhone(p?: string | null): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `${d.slice(0, 2)}*****${d.slice(-2)}`;
}
export function maskEmail(e?: string | null): string {
  if (!e) return "";
  const [u, dom] = e.split("@");
  if (!dom) return "***";
  const um = u.length <= 2 ? u[0] + "*" : `${u[0]}${"*".repeat(Math.max(1, u.length - 2))}${u.slice(-1)}`;
  return `${um}@${dom}`;
}
export function maskToken(t?: string | null): string {
  if (!t) return "";
  if (t.length <= 8) return "***";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}
export function maskId(id?: string | null): string {
  if (!id) return "";
  if (id.length <= 8) return "***";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
export function maskPath(p?: string | null): string {
  if (!p) return "";
  const parts = p.split("/");
  if (parts.length <= 1) return "***";
  const tail = parts[parts.length - 1].replace(/^(.{2}).+(\..+)?$/, "$1***$2");
  return `***/${tail}`;
}
export function maskAddress(a?: string | null): string {
  if (!a) return "";
  const t = a.trim();
  if (t.length <= 12) return "***";
  return `${t.slice(0, 8)}… (oculto)`;
}

export function maskSensitiveData(input: unknown, depth = 0): unknown {
  if (depth > 6 || input == null) return input;
  if (typeof input === "string") {
    let s = input;
    s = s.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (m) => maskCpf(m));
    s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => maskEmail(m));
    s = s.replace(/\b(?:\+?55)?\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, (m) => maskPhone(m));
    s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***");
    return s;
  }
  if (Array.isArray(input)) return input.map((v) => maskSensitiveData(v, depth + 1));
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (KEYS_TO_REDACT.has(lk)) out[k] = typeof v === "string" ? maskToken(v) : "***";
      else if (lk === "cpf") out[k] = maskCpf(v as string);
      else if (lk === "phone" || lk === "whatsapp" || lk === "telefone" || lk === "customer_phone") out[k] = maskPhone(v as string);
      else if (lk === "email" || lk === "e-mail" || lk === "customer_email" || lk === "payer_email") out[k] = maskEmail(v as string);
      else if (lk === "file_url" || lk === "prescription_path" || lk === "path") out[k] = maskPath(v as string);
      else if (lk === "address" || lk === "customer_address" || lk === "endereco" || lk === "endereço") out[k] = maskAddress(v as string);
      else if (lk === "user_id" || lk === "actor_id") out[k] = maskId(v as string);
      else out[k] = maskSensitiveData(v, depth + 1);
    }
    return out;
  }
  return input;
}

export function safeLog(label: string, data?: unknown) {
  try { console.log(label, data === undefined ? "" : JSON.stringify(maskSensitiveData(data))); }
  catch { console.log(label, maskSensitiveData(data)); }
}
export function safeError(label: string, data?: unknown) {
  try { console.error(label, data === undefined ? "" : JSON.stringify(maskSensitiveData(data))); }
  catch { console.error(label, maskSensitiveData(data)); }
}
