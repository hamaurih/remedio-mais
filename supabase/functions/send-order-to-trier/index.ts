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

function omitBlankFields<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
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
  | "customer_real_code"
  | "no_customer_object"
  | "seller_real";
const DIAGNOSTIC_PRESETS: DiagnosticPreset[] = [
  "customer_code_zero",
  "customer_no_code",
  "customer_real_code",
  "no_customer_object",
  "seller_real",
];

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

function friendlyOrderError(httpStatus: number, errorMessage: string | null, responseBody: any) {
  if (httpStatus === 545 || httpStatus === 554) {
    return `Trier indisponível (HTTP ${httpStatus}): o gateway não conseguiu falar com o servidor SGF da farmácia. O pedido permanece pago no site e será reenviado automaticamente.`;
  }
  const bodyText = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody || {});
  if (httpStatus === 500 && /sgf|servidor|conex/i.test(bodyText)) {
    return "Trier/SGF instável (HTTP 500): pedido pago no site, aguardando reenvio automático.";
  }
  if (errorMessage) return errorMessage;
  if (httpStatus) return `Trier respondeu HTTP ${httpStatus}`;
  return "Falha de rede ao enviar pedido ao Trier";
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

    // Quick connectivity test: do not require order_id, do not POST a sale
    if (action === "test_connection") {
      const startedAt = Date.now();
      const testUrl = `${salesBaseUrl}${SEND_PATH}`;
      let httpStatus = 0;
      let errorMessage: string | null = null;
      let respBody: any = null;
      try {
        const res = await fetch(testUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${TRIER_TOKEN || ""}`,
          },
          body: JSON.stringify({ ping: true }),
        });
        httpStatus = res.status;
        const text = await res.text();
        try { respBody = text ? JSON.parse(text) : null; } catch { respBody = { raw: (text || "").slice(0, 500) }; }
      } catch (e) {
        errorMessage = `Erro de rede: ${(e as Error).message}`;
      }
      return json({
        ok: httpStatus > 0,
        reachable: httpStatus > 0,
        url: testUrl,
        base_mode: baseMode,
        http_status: httpStatus,
        error: errorMessage,
        response: respBody,
        elapsed_ms: Date.now() - startedAt,
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
        nomeProduto: it.product_name,
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
        nomeProduto: settings.delivery_fee_product_name || "Taxa de Entrega",
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

    // cliente: modo configurável (no_code padrão de homologação, real_code usa trier_test_customer_code, no_customer remove objeto)
    const customerMode: string = settings.trier_customer_mode || "no_code";
    const clienteBase: Record<string, unknown> = {
      nome: order.customer_name,
      numeroCpfCnpj: onlyDigits(order.customer_cpf),
      celular: onlyDigits(order.customer_phone),
      fone: onlyDigits(order.customer_phone),
      email: order.customer_email,
    };
    let cliente: Record<string, unknown> | null = omitBlankFields(clienteBase);
    if (customerMode === "real_code") {
      const code = settings.trier_test_customer_code;
      if (code != null && code !== "") {
        cliente = { codigo: Number(code), ...cliente };
      }
    } else if (customerMode === "no_customer") {
      cliente = null;
    }
    // "no_code" => envia cliente sem campo codigo (default)

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

    // Diagnostic preset overrides for cliente/vendedor
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
      }
    }


    if (isDelivery) {
      const end = omitBlankFields({
        logradouro: order.delivery_street,
        numero: order.delivery_number,
        complemento: order.delivery_complement,
        referencia: order.delivery_reference,
        bairro: order.delivery_neighborhood,
        cidade: order.delivery_city,
        estado: order.delivery_state,
        cep: onlyDigits(order.delivery_cep),
      });
      if (Object.keys(end).length) payload.enderecoEntrega = end;
    }

    // 6) Idempotência por hash (somente envio real)
    const payloadHash = await sha256Hex(JSON.stringify(payload));
    if (!isTest && order.trier_payload_hash === payloadHash && order.trier_sent && !force) {
      return json({ skipped: true, reason: "same_hash_already_sent" }, 200);
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
        error: errorMessage,
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
