/** Estado ambíguo de um pagamento Cielo: não repetir a cobrança automaticamente. */
export type ReconciliationRequired = { order_id: string; error_code: "payment_reconciliation_required"; status?: string };
export function needsPaymentReconciliation(value: unknown): value is ReconciliationRequired {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.error_code === "payment_reconciliation_required" && typeof data.order_id === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.order_id);
}
