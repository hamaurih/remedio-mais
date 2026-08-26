// Notificação complementar por e-mail de NOVAS RECEITAS.
// LGPD: nunca inclui arquivo da receita, medicamento, dados clínicos, CPF,
// telefone, nome do paciente ou qualquer conteúdo sensível. Apenas avisa que
// existe uma nova receita aguardando análise + horário + link do painel.

const ADMIN_LINK = "https://atacadaodosmedicamentos.com.br/admin/receitas";

type Admin = {
  from: (t: string) => any;
  functions?: unknown;
};

function sanitizeError(msg: unknown): string {
  return String(msg ?? "erro desconhecido")
    .replace(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/g, "[email]")
    .replace(/eyJ[A-Za-z0-9._-]{10,}/g, "[token]")
    .slice(0, 400);
}

async function logAttempt(
  admin: Admin,
  prescription_id: string,
  recipient: string,
  status: string,
  error?: string | null,
) {
  await admin.from("prescription_email_log").insert({
    prescription_id,
    recipient,
    status,
    error: error ? sanitizeError(error) : null,
  });
}

/**
 * Dispara (best effort) o aviso de nova receita. Nunca lança: falha de e-mail
 * não pode quebrar o recebimento da receita nem o alerta realtime existente.
 */
export async function notifyNewPrescriptionByEmail(
  admin: Admin,
  prescriptionId: string,
  createdAt: string,
): Promise<void> {
  try {
    if (!prescriptionId) return;

    const { data: settings } = await admin
      .from("store_settings")
      .select("prescription_email_notify, prescription_email_to")
      .eq("id", 1)
      .maybeSingle();

    if (!settings?.prescription_email_notify) return;
    const recipient = String(settings.prescription_email_to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      await logAttempt(admin, prescriptionId, recipient || "(vazio)", "invalid_recipient", "destinatário inválido ou não configurado");
      return;
    }

    // Idempotência: índice único parcial em (prescription_id) where status='sent'
    // garante no banco que só existe 1 envio bem-sucedido por receita.
    const { data: already } = await admin
      .from("prescription_email_log")
      .select("id")
      .eq("prescription_id", prescriptionId)
      .eq("status", "sent")
      .maybeSingle();
    if (already) return;

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      await logAttempt(admin, prescriptionId, recipient, "no_provider", "ambiente sem credenciais de servidor");
      return;
    }

    const when = new Date(createdAt || Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const res = await fetch(`${url}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        templateName: "nova-receita",
        recipientEmail: recipient,
        // idempotência também no provedor
        idempotencyKey: `nova-receita-${prescriptionId}`,
        templateData: { receivedAt: when, panelUrl: ADMIN_LINK },
      }),
    });

    if (res.status === 404) {
      await logAttempt(admin, prescriptionId, recipient, "no_provider", "infraestrutura de e-mail ainda não configurada no projeto");
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await logAttempt(admin, prescriptionId, recipient, "failed", `HTTP ${res.status} ${body.slice(0, 200)}`);
      return;
    }

    await logAttempt(admin, prescriptionId, recipient, "sent", null);
  } catch (e) {
    try {
      await logAttempt(admin, prescriptionId, "(desconhecido)", "failed", (e as Error)?.message);
    } catch { /* ignora */ }
  }
}
