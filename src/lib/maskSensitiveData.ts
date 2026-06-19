// Helpers para mascarar dados sensíveis antes de logar/exibir em telas administrativas.
// NUNCA logar dados brutos de clientes, tokens, paths privados ou Authorization.

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
  return `${d.slice(0,3)}.***.***-${d.slice(9)}`;
}

export function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `${d.slice(0,2)}*****${d.slice(-2)}`;
}

export function maskEmail(email?: string | null): string {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const u = user.length <= 2 ? user[0] + "*" : `${user[0]}${"*".repeat(Math.max(1, user.length - 2))}${user.slice(-1)}`;
  return `${u}@${domain}`;
}

export function maskToken(token?: string | null): string {
  if (!token) return "";
  if (token.length <= 8) return "***";
  return `${token.slice(0,4)}…${token.slice(-4)}`;
}

export function maskPath(path?: string | null): string {
  if (!path) return "";
  // mantém só o nome final e mascara o resto
  const parts = path.split("/");
  if (parts.length <= 1) return "***";
  return `***/${parts[parts.length - 1].replace(/^(.{2}).+(\..+)$/, "$1***$2")}`;
}

export function maskAddress(addr?: string | null): string {
  if (!addr) return "";
  // preserva só primeira palavra (rua/avenida) e bairro/cidade ao final
  const trimmed = addr.trim();
  if (trimmed.length <= 12) return "***";
  return `${trimmed.slice(0, 8)}… (oculto)`;
}

/**
 * Mascara recursivamente qualquer objeto antes de console.log/log remoto.
 * Substitui valores de chaves sensíveis e aplica heurística em CPF/email/phone.
 */
export function maskSensitiveData(input: unknown, depth = 0): unknown {
  if (depth > 6 || input == null) return input;
  if (typeof input === "string") {
    let s = input;
    s = s.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (m) => maskCpf(m));
    s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => maskEmail(m));
    s = s.replace(/\b(?:\+?55)?\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, (m) => maskPhone(m));
    s = s.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***");
    return s;
  }
  if (Array.isArray(input)) {
    return input.map((v) => maskSensitiveData(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (KEYS_TO_REDACT.has(lower)) {
        out[k] = typeof v === "string" ? maskToken(v) : "***";
      } else if (lower === "cpf") out[k] = maskCpf(v as string);
      else if (lower === "phone" || lower === "whatsapp" || lower === "telefone") out[k] = maskPhone(v as string);
      else if (lower === "email" || lower === "e-mail" || lower === "customer_email") out[k] = maskEmail(v as string);
      else if (lower === "file_url" || lower === "prescription_path" || lower === "path") out[k] = maskPath(v as string);
      else if (lower === "address" || lower === "endereco" || lower === "endereço") out[k] = maskAddress(v as string);
      else out[k] = maskSensitiveData(v, depth + 1);
    }
    return out;
  }
  return input;
}

/** Log seguro: aplica maskSensitiveData antes de imprimir. */
export function safeLog(...args: unknown[]) {
  if (typeof console === "undefined") return;
  // eslint-disable-next-line no-console
  console.log(...args.map((a) => maskSensitiveData(a)));
}
export function safeError(...args: unknown[]) {
  if (typeof console === "undefined") return;
  // eslint-disable-next-line no-console
  console.error(...args.map((a) => maskSensitiveData(a)));
}
