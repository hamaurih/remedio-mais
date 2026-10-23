export type CanonicalSalesChannel =
  | "site"
  | "pdv"
  | "whatsapp_ia"
  | "whatsapp_humano"
  | "telefone"
  | "b2b"
  | "marketplace";

export type CanonicalIntegrationStatus =
  | "not_required"
  | "pending"
  | "sending"
  | "sent"
  | "error";

export function normalizeOrderChannel(
  salesChannel?: string | null,
  source?: string | null,
): CanonicalSalesChannel {
  const channel = String(salesChannel || "").trim().toLowerCase();
  const origin = String(source || "").trim().toLowerCase();

  if (channel === "pdv" || channel === "balcao") return "pdv";
  if (channel === "whatsapp") return origin === "ia" ? "whatsapp_ia" : "whatsapp_humano";
  if (channel === "telefone") return "telefone";
  if (channel === "b2b") return "b2b";
  if (channel === "marketplace") return "marketplace";
  if (origin === "ia") return "whatsapp_ia";
  return "site";
}

export function normalizeTrierIntegrationStatus(order: {
  trier_eligible?: boolean | null;
  trier_sent?: boolean | null;
  trier_status?: string | null;
  trier_sending_at?: string | null;
}): CanonicalIntegrationStatus {
  if (order.trier_eligible === false) return "not_required";
  if (order.trier_sent === true || String(order.trier_status || "").toLowerCase() === "sent") return "sent";
  if (order.trier_sending_at || String(order.trier_status || "").toLowerCase() === "sending") return "sending";
  if (String(order.trier_status || "").toLowerCase() === "error") return "error";
  return "pending";
}
