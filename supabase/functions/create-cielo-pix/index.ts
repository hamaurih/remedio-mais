// Cria pedido pendente + cobrança Pix via Cielo API 3.0.
// POST /1/sales com Payment.Type=Pix retorna QrCodeBase64Image + QrCodeString.
import { safeLog, safeError } from "../_shared/mask.ts";
import { prepareOrder, jsonResp } from "../_shared/prepare-order.ts";
import { CIELO_BASES, toCents, mapCieloStatus, type CieloEnv } from "../_shared/cielo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const MERCHANT_ID = Deno.env.get("CIELO_MERCHANT_ID");
  const MERCHANT_KEY = Deno.env.get("CIELO_MERCHANT_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  if (!MERCHANT_ID || !MERCHANT_KEY) {
    return jsonResp({ success: false, error: "Cielo não configurada (credenciais ausentes)." }, 500);
  }

  const prep = await prepareOrder(req, "pix");
  if (!prep.ok) return jsonResp(prep.body, prep.status);
  const { admin, order, total } = prep;

  // Ambiente da Cielo
  const { data: pset } = await admin.from("payment_settings").select("environment").eq("id", 1).maybeSingle();
  const env: CieloEnv = ((pset as any)?.environment === "sandbox" ? "sandbox" : "production");
  const base = CIELO_BASES[env].transaction;

  const cpfDigits = String(order.customer_cpf || "").replace(/\D/g, "");
  const expirationMinutes = 30;

  const cieloBody = {
    MerchantOrderId: order.id,
    Customer: {
      Name: order.customer_name || "Cliente",
      Identity: cpfDigits,
      IdentityType: "CPF",
      Email: order.customer_email || undefined,
    },
    Payment: {
      Type: "Pix",
      Amount: toCents(total),
      QrCodeExpiration: expirationMinutes * 60, // segundos
    },
  };

  safeLog("[cielo-pix] request", { order_id: order.id, total, env });

  let res: Response;
  try {
    res = await fetch(`${base}/1/sales/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MerchantId": MERCHANT_ID,
        "MerchantKey": MERCHANT_KEY,
        "RequestId": crypto.randomUUID(),
      },
      body: JSON.stringify(cieloBody),
    });
  } catch (e) {
    safeError("[cielo-pix] network error", { message: (e as Error).message });
    await admin.from("orders").update({ payment_status: "rejected", cancelled_at: new Date().toISOString() }).eq("id", order.id);
    return jsonResp({ success: false, error: "Falha ao contatar Cielo." }, 502);
  }

  const text = await res.text();
  let cielo: any = null;
  try { cielo = JSON.parse(text); } catch { cielo = { raw: text }; }

  if (!res.ok) {
    safeError("[cielo-pix] rejected", { status: res.status, body: cielo });
    await admin.from("orders").update({ payment_status: "rejected", cancelled_at: new Date().toISOString() }).eq("id", order.id);
    const firstErr = Array.isArray(cielo) ? cielo[0] : cielo;
    return jsonResp({
      success: false,
      error: firstErr?.Message || firstErr?.error || "Cielo rejeitou o pagamento Pix.",
      details: cielo,
    }, 502);
  }

  const pay = cielo?.Payment || {};
  const qr = pay.QrCodeString as string | undefined;
  const qrBase64 = pay.QrCodeBase64Image as string | undefined;
  const paymentId = pay.PaymentId as string | undefined;
  const statusCode = Number(pay.Status ?? 12);
  const status = mapCieloStatus(statusCode);

  if (!qr || !qrBase64 || !paymentId) {
    safeError("[cielo-pix] missing qr", { pay });
    return jsonResp({ success: false, error: "Cielo não retornou o QR Code do Pix." }, 502);
  }

  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();

  await admin.from("orders").update({
    cielo_payment_id: paymentId,
    cielo_status: statusCode,
    pix_qr_code: qr,
    pix_qr_code_base64: qrBase64,
    pix_expires_at: expiresAt,
    payment_status: status,
    external_reference: order.id,
  }).eq("id", order.id);

  safeLog("[cielo-pix] success", { order_id: order.id, paymentId, statusCode });

  return jsonResp({
    success: true,
    order_id: order.id,
    payment_id: paymentId,
    status,
    qr_code: qr,
    qr_code_base64: qrBase64,
    expires_at: expiresAt,
    total,
  });
});
