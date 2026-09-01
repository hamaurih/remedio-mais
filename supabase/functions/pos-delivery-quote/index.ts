import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_ORIGINS = new Set([
  "https://atacadaodosmedicamentos.com.br",
  "https://www.atacadaodosmedicamentos.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://atacadaodosmedicamentos.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

function clean(value: unknown, max = 120) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function onlyDigits(value: unknown, max = 20) {
  return String(value ?? "").replace(/\D/g, "").slice(0, max);
}

type AddressInput = {
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  reference?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  if (!ANON_KEY || !SERVICE_KEY) return json(req, { error: "server_config_error" }, 503);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(authHeader.slice(7));
  const userId = userData?.user?.id;
  if (userError || !userId) return json(req, { error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const storeId = clean(body?.store_id, 64);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)) {
      return json(req, { error: "invalid_store", message: "Loja inválida." }, 400);
    }

    const address = (body?.address || {}) as AddressInput;
    const cep = onlyDigits(address.cep, 8);
    const street = clean(address.street, 120);
    const number = clean(address.number, 20);
    const complement = clean(address.complement, 80);
    const neighborhood = clean(address.neighborhood, 80);
    const city = clean(address.city || "Campina Grande", 80);
    const state = clean(address.state || "PB", 2).toUpperCase();
    const reference = clean(address.reference, 120);

    if (!street || !number || !neighborhood || !city || state.length !== 2) {
      return json(req, {
        error: "invalid_address",
        message: "Informe rua, número, bairro, cidade e UF para calcular a entrega.",
      }, 400);
    }

    const { data: isOperator, error: permissionError } = await admin.rpc("pos_is_operator", {
      _user_id: userId,
      _store_id: storeId,
    });
    if (permissionError || isOperator !== true) return json(req, { error: "forbidden" }, 403);

    const fullAddress = [
      `${street}, ${number}`,
      complement,
      neighborhood,
      city,
      state,
      cep ? `CEP ${cep}` : "",
      "Brasil",
    ].filter(Boolean).join(", ");

    const calcResponse = await fetch(`${SUPABASE_URL}/functions/v1/calculate-delivery-fee`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
      },
      body: JSON.stringify({ address: fullAddress }),
    });
    const calc = await calcResponse.json().catch(() => null);

    if (!calcResponse.ok || !calc) {
      console.error("pos-delivery-quote calculate failed", calcResponse.status);
      return json(req, { error: "delivery_calculation_failed", message: "Não foi possível calcular o frete agora." }, 502);
    }
    if (calc.ok !== true) return json(req, calc, 200);

    if (calc.allowed !== true) {
      return json(req, {
        ...calc,
        quote_id: null,
        address: fullAddress,
      });
    }

    const fee = Number(calc.fee);
    if (!Number.isFinite(fee) || fee < 0) {
      return json(req, { error: "invalid_delivery_fee", message: "A regra de frete retornou um valor inválido." }, 500);
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: quote, error: quoteError } = await admin
      .from("pos_delivery_quotes")
      .insert({
        store_id: storeId,
        user_id: userId,
        address: fullAddress,
        cep: cep || null,
        street,
        number,
        complement: complement || null,
        neighborhood,
        city,
        state,
        reference: reference || null,
        lat: typeof calc.lat === "number" ? calc.lat : null,
        lng: typeof calc.lng === "number" ? calc.lng : null,
        distance_km: typeof calc.distance_km === "number" ? calc.distance_km : null,
        distance_source: clean(calc.distance_source, 40) || null,
        fee,
        zone_label: clean(calc.zone_label, 80) || null,
        allowed: true,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (quoteError || !quote?.id) {
      console.error("pos-delivery-quote persist failed", quoteError?.code || "unknown");
      return json(req, { error: "quote_persist_failed", message: "Não foi possível registrar a cotação de frete." }, 500);
    }

    return json(req, {
      ...calc,
      quote_id: quote.id,
      expires_at: expiresAt,
      address: fullAddress,
      address_fields: { cep, street, number, complement, neighborhood, city, state, reference },
    });
  } catch (error) {
    console.error("pos-delivery-quote unexpected", error instanceof Error ? error.message : "unknown");
    return json(req, { error: "internal_error", message: "Falha inesperada ao calcular o frete." }, 500);
  }
});
