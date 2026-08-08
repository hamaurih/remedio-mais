// Envia uma venda do site ao Trier (POST /rest/integracao/venda/ecommerce/efetuar-venda-v1)
// Disparo MANUAL via admin OU automático via mercado-pago-webhook (gated por trier_settings.auto_send_orders_enabled).
// Idempotente: usa trier_payload_hash + trier_sent.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { safeLog, safeError, maskSensitiveData } from "../_shared/mask.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TRIER_TOKEN = Deno.env.get("TRIER_API_TOKEN");

const SEND_PATH = "/rest/integracao/venda/ecommerce/efetuar-venda-v1";
const PRODUCT_PATH = "/rest/integracao/produto/obter-v1";
const SELLER_PATH = "/rest/integracao/vendedor/obter-v1";
const CARD_PATH = "/rest/integracao/cartao/obter-v1";
const TRANSIENT_TRIER_STATUSES = new Set([500, 502, 503, 504, 545, 554]);

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type LogArgs = {
  order_id: string;
  action: string;
  endpoint?: string | null;
  http_status?: number | null;
  status?: string | null;
  request_payload?: unknown;
  response_payload?: unknown;
  error_message?: string | null;
  created_by?: string | null;
};

async function writeLog(a: LogArgs) {
  try {
    await admin.from("trier_order_logs").insert({
      order_id: a.order_id,
      action: a.action,
      endpoint: a.endpoint ?? null,
      http_status: a.http_status ?? null,
      status: a.status ?? null,
      request_payload_masked: a.request_payload ? (maskSensitiveData(a.request_payload) as any) : null,
      response_payload_masked: a.response_payload ? (maskSensitiveData(a.response_payload) as any) : null,
      error_message: a.error_message ?? null,
      created_by: a.created_by ?? null,
    });
  } catch (e) {
    safeError("[send-order-to-trier] log insert failed", { message: (e as Error)?.message });
  }
}

function onlyDigits(s?: string | null) {
  return (s || "").replace(/\D/g, "");
}

// Formato "YYYY-MM-DDTHH:mm:ss-0300" exigido pelo Trier.
function isoDateTimeBR(s?: string | null) {
  const d = s ? new Date(s) : new Date();
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  const brMs = base.getTime() - 3 * 60 * 60 * 1000;
  const br = new Date(brMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${br.getUTCFullYear()}-${pad(br.getUTCMonth() + 1)}-${pad(br.getUTCDate())}T${pad(br.getUTCHours())}:${pad(br.getUTCMinutes())}:${pad(br.getUTCSeconds())}-0300`;
}


// numeroPedido curto e numérico (até 10 dígitos)
function shortNumericOrderId(uuid: string): string {
  const digits = uuid.replace(/\D/g, "");
  if (digits.length >= 7) return digits.slice(0, 10);
  let h = 0;
  for (const c of uuid) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return String(Math.abs(h)).slice(0, 10);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type PaymentMode = "pix_native" | "site_pix_card" | "site_debit_card" | "site_credit_card";
type DiagnosticPreset =
  | "customer_code_zero"
  | "customer_no_code"
  | "customer_empty_code"
  | "customer_real_code"
  | "no_customer_object"
  | "seller_real"
  | "pickup_full_address"
  | "pickup_min_address"
  | "official_payload";
const DIAGNOSTIC_PRESETS: DiagnosticPreset[] = [
  "customer_code_zero",
  "customer_no_code",
  "customer_empty_code",
  "customer_real_code",
  "no_customer_object",
  "seller_real",
  "pickup_full_address",
  "pickup_min_address",
  "official_payload",
];

const FALLBACK_ADDRESS = {
  logradouro: "RETIRADA NA LOJA",
  numero: "0",
  complemento: "",
  referencia: "",
  bairro: "CENTRO",
  cidade: "CAMPINA GRANDE",
  estado: "PB",
  cep: "58400000",
};

// enderecoEntrega é sempre enviado (mesmo em retirada) — o backend Trier
// dispara NullPointerException quando o objeto está ausente.
function buildEnderecoEntrega(order: any, minimal = false): Record<string, string> {
  if (minimal) return { ...FALLBACK_ADDRESS };
  return {
    logradouro: String(order.delivery_street || FALLBACK_ADDRESS.logradouro),
    numero: String(order.delivery_number || "0"),
    complemento: String(order.delivery_complement || ""),
    referencia: String(order.delivery_reference || ""),
    bairro: String(order.delivery_neighborhood || FALLBACK_ADDRESS.bairro),
    cidade: String(order.delivery_city || FALLBACK_ADDRESS.cidade),
    estado: String(order.delivery_state || FALLBACK_ADDRESS.estado),
    cep: onlyDigits(order.delivery_cep) || FALLBACK_ADDRESS.cep,
  };
}

// Cliente no formato oficial da coleção Trier 1.5.23
function buildClienteOficial(order: any, codigo: string | number | null): Record<string, unknown> {
  const phone = onlyDigits(order.customer_phone);
  const cli: Record<string, unknown> = {
    nome: String(order.customer_name || "").slice(0, 40),
    numeroCpfCnpj: onlyDigits(order.customer_cpf),
    numeroRGIE: null,
    dataNascimento: null,
    sexo: null,
    celular: phone,
    fone: phone,
    email: order.customer_email || "",
  };
  if (codigo !== null) return { codigo, ...cli };
  return cli;
}

async function trierGet(baseUrl: string, path: string, params: Record<string, string>) {
  const url = `${baseUrl}${path}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Bearer ${TRIER_TOKEN || ""}`, "Accept": "application/json" },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: (text || "").slice(0, 500) }; }
    return { url, http_status: res.status, ok: res.ok, body, error: null as string | null };
  } catch (e) {
    return { url, http_status: 0, ok: false, body: null, error: (e as Error).message };
  }
}

function buildPagamentoMultiplo(
  mode: PaymentMode,
  codigo: number,
  valor: number,
  numeroAutorizacao: number,
  idTransacaoPIX?: string,
): Record<string, unknown> {
  if (mode === "pix_native") {
    return {
      pix: {
        pagamentoRealizado: true,
        codigo: Number(codigo),
        valor: Number(valor),
        numeroAutorizacao: Number(numeroAutorizacao),
        idTransacaoPIX: String(idTransacaoPIX || ""),
      },
    };
  }
  return {
    cartao: [
      {
        pagamentoRealizado: true,
        codigo: Number(codigo),
        valor: Number(valor),
        qtdParcela: 1,
        numeroAutorizacao: Number(numeroAutorizacao),
      },
    ],
  };
}


function resolveModeCode(settings: any, mode: PaymentMode): number | null {
  switch (mode) {
    case "pix_native": return settings.trier_pix_native_code ?? settings.pix_payment_code ?? null;
    case "site_pix_card": return settings.trier_site_pix_card_code ?? null;
    case "site_debit_card": return settings.trier_site_debit_card_code ?? null;
    case "site_credit_card": return settings.trier_site_credit_card_code ?? settings.card_payment_code ?? null;
  }
}

// Classifica a falha: conexão (SGF fora) x payload (SGF respondeu com erro interno)
function classifyTrierError(httpStatus: number, errorMessage: string | null, responseBody: any) {
  const bodyText = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody || {});
  if (httpStatus === 545 || httpStatus === 554) {
    return {
      kind: "connection",
      message: `SGF da farmácia indisponível (HTTP ${httpStatus}). Verifique servidor, serviço Trier e comunicação com o gateway.`,
    };
  }
  if (/NullPointerException/i.test(bodyText)) {
    return {
      kind: "payload",
      message: "SGF conectado, mas houve falha interna no processamento do payload (NullPointerException no Trier).",
    };
  }
  if (httpStatus === 500 && /sgf|servidor|conex/i.test(bodyText)) {
    return { kind: "connection", message: "Trier/SGF instável (HTTP 500): conexão com o servidor da farmácia falhou." };
  }
  if (httpStatus >= 500) {
    return { kind: "payload", message: `SGF conectado, mas retornou erro interno HTTP ${httpStatus}.` };
  }
  if (errorMessage) return { kind: httpStatus ? "payload" : "connection", message: errorMessage };
  if (httpStatus) return { kind: "payload", message: `Trier respondeu HTTP ${httpStatus}` };
  return { kind: "connection", message: "Falha de rede ao enviar pedido ao Trier" };
}

function friendlyOrderError(httpStatus: number, errorMessage: string | null, responseBody: any) {
  return classifyTrierError(httpStatus, errorMessage, responseBody).message;
}

function shouldNotifyFailure(isInternal: boolean, httpStatus: number, currentAttempt: number) {
  if (!isInternal) return true;
  if (!TRANSIENT_TRIER_STATUSES.has(httpStatus)) return true;
  return currentAttempt <= 1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Aceita chamada autenticada (admin) ou interna (webhook MP usando service role + header x-internal-source).
    const authHeader = req.headers.get("Authorization") || "";
    const internalSource = req.headers.get("x-internal-source");
    let actorId: string | null = null;
    let isInternal = false;

    if (internalSource === "mercado-pago-webhook" && authHeader.includes(SERVICE_KEY)) {
      isInternal = true;
    } else if (authHeader.includes(SERVICE_KEY)) {
      // Permite chamadas internas/admin feitas com a chave de serviço pela própria plataforma.
      isInternal = true;
    } else {
      // valida JWT do admin
      if (!authHeader.startsWith("Bearer ")) {
        return json({ error: "Unauthorized" }, 401);
      }
      const supaUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsRes, error: claimsErr } = await supaUser.auth.getClaims(token);
      if (claimsErr || !claimsRes?.claims) return json({ error: "Unauthorized" }, 401);
      actorId = claimsRes.claims.sub as string;
      const { data: hasAdmin } = await admin.rpc("has_role", { _user_id: actorId, _role: "admin" });
      if (!hasAdmin) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "send_order");
    const orderId = String(body?.order_id || "");
    const force = !!body?.force;
    const presetParam = String(body?.preset || "") as PaymentMode | "";

    // Resolve sales base URL (gateway or local webservice)
    const { data: settingsForBase } = await admin
      .from("trier_settings").select("*").eq("id", 1).maybeSingle();
    const salesBaseUrl: string = (settingsForBase?.trier_sales_base_url
      || settingsForBase?.base_url
      || "https://api-sgf-gateway.triersistemas.com.br/sgfpod1").replace(/\/$/, "");
    const baseMode: string = settingsForBase?.trier_sales_base_mode || "gateway";

    // Teste de conexão via GET válido (não posta venda)
    if (action === "test_connection") {
      const startedAt = Date.now();
      const sellerCode = String(body?.codigo_vendedor ?? settingsForBase?.seller_code ?? 45);
      const probe = await trierGet(salesBaseUrl, SELLER_PATH, { codigo: sellerCode });
      const bodyText = JSON.stringify(probe.body || {});
      const gatewayReached = probe.http_status > 0;
      const sgfReached = gatewayReached && probe.http_status !== 545 && probe.http_status !== 554;
      const authValid = ![401, 403].includes(probe.http_status) && gatewayReached;
      const branchValid = probe.ok || (sgfReached && authValid && probe.http_status < 500);
      return json({
        ok: probe.ok,
        reachable: gatewayReached,
        gateway_reached: gatewayReached,
        sgf_reached: sgfReached,
        auth_valid: authValid,
        branch_valid: branchValid,
        url: probe.url,
        method: "GET",
        base_mode: baseMode,
        http_status: probe.http_status,
        error: probe.error || (probe.ok ? null : classifyTrierError(probe.http_status, probe.error, probe.body).message),
        error_kind: probe.ok ? null : classifyTrierError(probe.http_status, probe.error, probe.body).kind,
        response: probe.body,
        raw_hint: bodyText.slice(0, 300),
        elapsed_ms: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
    }

    // Validação de cadastros (produto / vendedor / cartão) antes de enviar a venda
    if (action === "validate_registrations") {
      const codigoProduto = body?.codigo_produto != null ? String(body.codigo_produto) : null;
      const codigoVendedor = String(body?.codigo_vendedor ?? settingsForBase?.seller_code ?? "");
      const codigoCartao = String(
        body?.codigo_cartao ?? settingsForBase?.trier_site_pix_card_code ?? settingsForBase?.card_payment_code ?? "",
      );

      const [produto, vendedor, cartao] = await Promise.all([
        codigoProduto ? trierGet(salesBaseUrl, PRODUCT_PATH, { codigo: codigoProduto }) : Promise.resolve(null),
        codigoVendedor ? trierGet(salesBaseUrl, SELLER_PATH, { codigo: codigoVendedor }) : Promise.resolve(null),
        codigoCartao ? trierGet(salesBaseUrl, CARD_PATH, { codigoCartao, ativo: "true" }) : Promise.resolve(null),
      ]);

      const found = (r: any) => !!(r && r.ok && r.body && (Array.isArray(r.body) ? r.body.length > 0 : Object.keys(r.body).length > 0));
      const anyReached = [produto, vendedor, cartao].some((r) => r && r.http_status > 0);
      const sgfOnline = [produto, vendedor, cartao].some((r) => r && r.http_status > 0 && r.http_status !== 545 && r.http_status !== 554);

      return json({
        ok: found(produto) !== false && found(vendedor) && found(cartao),
        gateway_reached: anyReached,
        sgf_reached: sgfOnline,
        token_valid: ![401, 403].includes(vendedor?.http_status ?? 0),
        produto: produto ? { codigo: codigoProduto, found: found(produto), http_status: produto.http_status, response: produto.body } : null,
        vendedor: vendedor ? { codigo: codigoVendedor, found: found(vendedor), http_status: vendedor.http_status, response: vendedor.body } : null,
        cartao: cartao ? { codigo: codigoCartao, found: found(cartao), http_status: cartao.http_status, response: cartao.body } : null,
        timestamp: new Date().toISOString(),
      });
    }


    if (!orderId) return json({ error: "order_id obrigatório" }, 400);


    // 1) Carrega config
    const { data: settings, error: setErr } = await admin
      .from("trier_settings").select("*").eq("id", 1).maybeSingle();
    if (setErr || !settings) return json({ error: "trier_settings ausente" }, 500);

    if (action === "send_order" && isInternal && !settings.auto_send_orders_enabled) {
      return json({ skipped: true, reason: "auto_send_disabled" }, 200);
    }

    if (!TRIER_TOKEN) {
      await writeLog({ order_id: orderId, action, status: "error",
        error_message: "TRIER_API_TOKEN ausente" });
      return json({ error: "TRIER_API_TOKEN ausente" }, 500);
    }

    // 2) Carrega pedido + itens
    const { data: order, error: orderErr } = await admin
      .from("orders").select("*").eq("id", orderId).maybeSingle();
    if (orderErr || !order) return json({ error: "Pedido não encontrado" }, 404);

    const isPaymentTest = action === "test_payment_preset";
    const isDiagnosticTest = action === "test_diagnostic_preset";
    const isTest = isPaymentTest || isDiagnosticTest;
    const diagnosticPreset: DiagnosticPreset | null = isDiagnosticTest
      ? (presetParam as unknown as DiagnosticPreset)
      : null;

    if (!isTest) {
      if (order.payment_status !== "approved") {
        return json({ error: "Pedido não está aprovado", payment_status: order.payment_status }, 400);
      }
      if (order.trier_sent && !force) {
        return json({ skipped: true, reason: "already_sent", trier_order_id: order.trier_order_id }, 200);
      }
    }

    const { data: items, error: itemsErr } = await admin
      .from("order_items").select("*, products(trier_product_id)").eq("order_id", orderId);
    if (itemsErr || !items?.length) return json({ error: "Itens do pedido não encontrados" }, 400);

    // 3) Validações de configuração mínimas
    const missingConfig: string[] = [];
    if (!settings.seller_code) missingConfig.push("seller_code");
    if (!settings.seller_name) missingConfig.push("seller_name");

    // Determina modo de pagamento e código
    let mode: PaymentMode;
    if (isPaymentTest) {
      const allowed: PaymentMode[] = ["pix_native","site_pix_card","site_debit_card","site_credit_card"];
      if (!allowed.includes(presetParam as PaymentMode)) {
        return json({ error: "preset inválido. Use: " + allowed.join(", ") }, 400);
      }
      mode = presetParam as PaymentMode;
    } else if (isDiagnosticTest) {
      if (!DIAGNOSTIC_PRESETS.includes(diagnosticPreset as DiagnosticPreset)) {
        return json({ error: "preset diagnóstico inválido. Use: " + DIAGNOSTIC_PRESETS.join(", ") }, 400);
      }
      // diagnóstico fixa pagamento via cartão codigo 18 (site_pix_card)
      mode = "site_pix_card";
    } else {
      mode = (settings.trier_payment_mode as PaymentMode) || "pix_native";
    }
    const codigoPagamento = resolveModeCode(settings, mode);
    if (codigoPagamento == null) missingConfig.push(`código do modo ${mode}`);

    const isDelivery = order.delivery_type === "delivery" || order.delivery_method === "delivery";
    const deliveryFee = Number(order.delivery_fee || 0);
    if (!isTest && isDelivery && deliveryFee > 0 && !settings.delivery_fee_product_code) {
      missingConfig.push("delivery_fee_product_code");
    }
    if (missingConfig.length) {
      const msg = `Configuração Trier incompleta: ${missingConfig.join(", ")}`;
      await writeLog({ order_id: orderId, action, status: "error", error_message: msg, created_by: actorId });
      if (!isTest) {
        await admin.from("orders").update({ trier_last_error: msg }).eq("id", orderId);
      }
      return json({ error: msg }, 400);
    }

    // 4) Monta produtos do payload
    const produtos: any[] = [];
    const itemsWithoutTrierId: string[] = [];
    for (const it of items as any[]) {
      const trierCode = it.trier_product_id || it.products?.trier_product_id;
      if (!trierCode) {
        itemsWithoutTrierId.push(it.product_name);
        continue;
      }
      produtos.push({
        codigoProduto: Number(trierCode) || trierCode,
        nomeProduto: String(it.product_name || "").trim().slice(0, 30),
        quantidade: Number(it.quantity),
        valorUnitario: Number(it.unit_price),
        valorDesconto: 0,
      });
    }
    if (itemsWithoutTrierId.length) {
      const msg = `Itens sem trier_product_id: ${itemsWithoutTrierId.join("; ")}`;
      await writeLog({ order_id: orderId, action, status: "error", error_message: msg, created_by: actorId });
      if (!isTest) {
        await admin.from("orders").update({ trier_last_error: msg }).eq("id", orderId);
      }
      return json({ error: msg }, 400);
    }

    // Item de taxa de entrega (apenas no envio real)
    if (!isTest && isDelivery && deliveryFee > 0 && settings.delivery_fee_product_code) {
      produtos.push({
        codigoProduto: Number(settings.delivery_fee_product_code) || settings.delivery_fee_product_code,
        nomeProduto: String(settings.delivery_fee_product_name || "Taxa de Entrega").trim().slice(0, 30),
        quantidade: 1,
        valorUnitario: deliveryFee,
        valorDesconto: 0,
      });
    }

    // 5) Pagamento
    const valorPago = Number(order.total);
    const mpPaymentId = onlyDigits(order.mercado_pago_payment_id) || String(Date.now());
    const numeroAutorizacao = 1;
    const pagamentoMultiplo = buildPagamentoMultiplo(
      mode,
      Number(codigoPagamento),
      valorPago,
      numeroAutorizacao,
      mpPaymentId,
    );

    const dataPedido = isoDateTimeBR(order.paid_at || order.created_at);
    const numeroPedido = shortNumericOrderId(String(order.id));

    // cliente: modo configurável.
    // no_code (padrão) => codigo: "" conforme coleção oficial
    // omit_code => sem o campo codigo
    // real_code => usa trier_test_customer_code
    // no_customer => remove objeto cliente
    const customerMode: string = settings.trier_customer_mode || "no_code";
    let cliente: Record<string, unknown> | null;
    if (customerMode === "no_customer") {
      cliente = null;
    } else if (customerMode === "omit_code") {
      cliente = buildClienteOficial(order, null);
    } else if (customerMode === "real_code") {
      const code = settings.trier_test_customer_code;
      cliente = buildClienteOficial(order, code != null && code !== "" ? Number(code) : "");
    } else {
      cliente = buildClienteOficial(order, "");
    }

    const payload: Record<string, unknown> = {
      numeroPedido,
      dataPedido,
      valorTotalVenda: Number(order.total),
      valorFrete: deliveryFee,
      entrega: !!isDelivery,
      vendedor: {
        codigo: Number(settings.seller_code),
        nome: settings.seller_name,
      },
      produtos,
      pagamentoMultiplo,
    };
    if (cliente) payload.cliente = cliente;
    // enderecoEntrega sempre presente (inclusive retirada) para evitar NullPointerException
    payload.enderecoEntrega = buildEnderecoEntrega(order, !isDelivery);

    // Diagnostic preset overrides
    if (isDiagnosticTest && diagnosticPreset) {
      const diagCliente = {
        nome: "Amauri Rodrigues",
        numeroCpfCnpj: "04500000060",
        celular: "83999999955",
        fone: "83999999955",
        email: "hamaurih@gmail.com",
      };
      switch (diagnosticPreset) {
        case "customer_code_zero":
          payload.cliente = { codigo: 0, ...diagCliente };
          break;
        case "customer_no_code":
          payload.cliente = { ...diagCliente };
          break;
        case "customer_empty_code":
          payload.cliente = buildClienteOficial(order, "");
          break;
        case "customer_real_code": {
          const code = settings.trier_test_customer_code;
          if (code == null || code === "") {
            return json({ error: "trier_test_customer_code não configurado" }, 400);
          }
          payload.cliente = { codigo: Number(code), ...diagCliente };
          break;
        }
        case "no_customer_object":
          delete (payload as any).cliente;
          break;
        case "seller_real": {
          const sCode = settings.trier_test_seller_code;
          const sName = settings.trier_test_seller_name;
          if (sCode == null || sCode === "" || !sName) {
            return json({ error: "trier_test_seller_code/trier_test_seller_name não configurados" }, 400);
          }
          payload.cliente = { codigo: 0, ...diagCliente };
          payload.vendedor = { codigo: Number(sCode), nome: String(sName) };
          break;
        }
        case "pickup_full_address":
          payload.cliente = buildClienteOficial(order, "");
          payload.entrega = false;
          payload.valorFrete = 0;
          payload.enderecoEntrega = buildEnderecoEntrega(order, false);
          break;
        case "pickup_min_address":
          payload.cliente = buildClienteOficial(order, "");
          payload.entrega = false;
          payload.valorFrete = 0;
          payload.enderecoEntrega = buildEnderecoEntrega(order, true);
          break;
        case "official_payload": {
          payload.cliente = buildClienteOficial(order, "");
          payload.entrega = false;
          payload.valorFrete = 0;
          payload.enderecoEntrega = buildEnderecoEntrega(order, true);
          payload.pagamentoMultiplo = {
            cartao: [
              {
                pagamentoRealizado: true,
                codigo: Number(settings.trier_site_pix_card_code ?? settings.card_payment_code ?? 18),
                valor: Number(order.total),
                qtdParcela: 1,
                numeroAutorizacao: 1,
              },
            ],
          };
          break;
        }
      }
    }


    // 6) Idempotência (somente envio real)
    const payloadHash = await sha256Hex(JSON.stringify(payload));
    if (!isTest && order.trier_sent && !force) {
      return json({ skipped: true, reason: "already_sent" }, 200);
    }

    // 6.1) Trava atômica: impede que dois gatilhos simultâneos (webhook, retorno do
    // cartão, verificação de status, robô de retentativa) gerem notas duplicadas.
    const LOCK_TTL_MS = 5 * 60 * 1000;
    if (!isTest) {
      const staleBefore = new Date(Date.now() - LOCK_TTL_MS).toISOString();
      let claimQ = admin
        .from("orders")
        .update({ trier_sending_at: new Date().toISOString() })
        .eq("id", orderId);
      if (!force) claimQ = claimQ.eq("trier_sent", false);
      const { data: claimed, error: claimErr } = await claimQ
        .or(`trier_sending_at.is.null,trier_sending_at.lt.${staleBefore}`)
        .select("id");
      if (claimErr) return json({ error: claimErr.message }, 500);
      if (!claimed || claimed.length === 0) {
        return json({ skipped: true, reason: "send_in_progress_or_already_sent" }, 200);
      }
    }


    // 7) Envia
    const url = `${salesBaseUrl}${SEND_PATH}`;
    const startedAt = Date.now();
    const currentAttempt = (order.trier_attempts || 0) + 1;
    if (!isTest) {
      await admin.from("orders").update({
        trier_attempts: currentAttempt,
        trier_payload_hash: payloadHash,
      }).eq("id", orderId);
    }


    let httpStatus = 0;
    let responseBody: any = null;
    let errorMessage: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TRIER_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });
      httpStatus = res.status;
      const text = await res.text();
      try { responseBody = text ? JSON.parse(text) : null; } catch { responseBody = { raw: text }; }
      if (!res.ok) errorMessage = `HTTP ${res.status}`;
    } catch (e) {
      errorMessage = `Erro de rede: ${(e as Error).message}`;
    }

    const elapsed = Date.now() - startedAt;
    safeLog("[send-order-to-trier] response", { orderId, action, mode, httpStatus, elapsed });

    const success = httpStatus >= 200 && httpStatus < 300 && !errorMessage;
    const trierOrderId = responseBody?.numeroPedido || responseBody?.numeroVenda || responseBody?.numero || null;
    const trierSaleId = responseBody?.idVenda || responseBody?.id || null;
    const trierNumeroNota = responseBody?.numeroNota || null;

    const logAction = isDiagnosticTest
      ? `test_diagnostic_preset:${diagnosticPreset}`
      : isPaymentTest
        ? `test_payment_preset:${mode}`
        : "send_order";
    await writeLog({
      order_id: orderId,
      action: logAction,
      endpoint: SEND_PATH,
      http_status: httpStatus,
      status: success ? "ok" : "error",
      request_payload: payload,
      response_payload: responseBody,
      error_message: errorMessage,
      created_by: actorId,
    });

    if (isTest) {
      return json({
        ok: success,
        mode,
        diagnostic_preset: diagnosticPreset,
        url,
        method: "POST",
        base_mode: baseMode,
        http_status: httpStatus,
        error: success ? null : classifyTrierError(httpStatus, errorMessage, responseBody).message,
        error_kind: success ? null : classifyTrierError(httpStatus, errorMessage, responseBody).kind,
        response: responseBody,
        request_masked: maskSensitiveData(payload),
        numero_autorizacao_type: typeof numeroAutorizacao,
        timestamp: new Date().toISOString(),
      });
    }


    if (success) {
      await admin.from("orders").update({
        trier_sent: true,
        trier_sent_at: new Date().toISOString(),
        trier_status: "sent",
        trier_status_code: httpStatus,
        trier_order_id: trierOrderId ? String(trierOrderId) : numeroPedido,
        trier_sale_id: trierSaleId ? String(trierSaleId) : null,
        trier_numero_nota: trierNumeroNota ? String(trierNumeroNota) : null,
        trier_last_error: null,
        trier_error_message: null,
      }).eq("id", orderId);
      await admin.from("order_items").update({ trier_item_sent: true }).eq("order_id", orderId);
      await admin.from("admin_notifications").insert({
        type: "trier_order_sent",
        title: "Pedido enviado ao Trier",
        message: `Pedido #${String(orderId).slice(0,6)} enviado com sucesso ao Trier.`,
        order_id: orderId,
      });
      return json({ ok: true, trier_order_id: trierOrderId, http_status: httpStatus });
    } else {
      const friendly = friendlyOrderError(httpStatus, errorMessage, responseBody);
      await admin.from("orders").update({
        trier_sent: false,
        trier_status: "error",
        trier_status_code: httpStatus || null,
        trier_last_error: friendly.slice(0, 500),
        trier_error_message: friendly.slice(0, 1200),
      }).eq("id", orderId);
      if (shouldNotifyFailure(isInternal, httpStatus, currentAttempt)) {
        await admin.from("admin_notifications").insert({
          type: "trier_order_failed",
          title: "Falha ao enviar pedido ao Trier",
          message: `Pedido #${String(orderId).slice(0,6)}: ${friendly}`,
          order_id: orderId,
        });
      }
      // Retorna 200 para que o cliente exiba a mensagem amigável em vez de
      // "Edge Function returned a non-2xx status code" (a falha é externa: SGF/Trier fora do ar).
      return json({ ok: false, http_status: httpStatus, error: friendly, response: responseBody }, 200);
    }

  } catch (e) {
    safeError("[send-order-to-trier] unexpected", { message: (e as Error)?.message });
    return json({ error: (e as Error)?.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
