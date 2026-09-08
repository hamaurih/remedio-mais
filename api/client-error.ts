function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { Allow: "POST, OPTIONS" },
      });
    }

    if (request.method !== "POST") {
      return json(
        { error: "method_not_allowed" },
        { status: 405, headers: { Allow: "POST, OPTIONS" } },
      );
    }

    try {
      const raw = await request.text();
      if (raw.length > 12_000) {
        return json({ error: "payload_too_large" }, { status: 413 });
      }

      const input = raw ? JSON.parse(raw) : {};
      const event = {
        type: text(input?.type, 80) || "client_error",
        message: text(input?.message, 700),
        stack: text(input?.stack, 2500),
        path: text(input?.path, 300),
        userAgent: text(input?.userAgent, 350),
        online: typeof input?.online === "boolean" ? input.online : null,
        visibility: text(input?.visibility, 40),
        timestamp: text(input?.timestamp, 80),
      };

      // Sem cookies, usuário, e-mail, query string ou conteúdo de formulários.
      // A saída fica nos logs de runtime da Vercel para diagnóstico do incidente.
      console.error(`[client-error] ${JSON.stringify(event)}`);

      return json({ ok: true }, { status: 202 });
    } catch {
      return json({ error: "invalid_payload" }, { status: 400 });
    }
  },
};
