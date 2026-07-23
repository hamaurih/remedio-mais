// Helpers compartilhados para integração com Cielo API 3.0.
// Nunca logamos MerchantKey nem número/CVV de cartão.

export const CIELO_BASES = {
  production: {
    transaction: "https://api.cieloecommerce.cielo.com.br",
    query: "https://apiquery.cieloecommerce.cielo.com.br",
  },
  sandbox: {
    transaction: "https://apisandbox.cieloecommerce.cielo.com.br",
    query: "https://apiquerysandbox.cieloecommerce.cielo.com.br",
  },
} as const;

export type CieloEnv = keyof typeof CIELO_BASES;

// Status Cielo → status interno do pedido.
// Referência: https://developercielo.github.io/manual/cielo-ecommerce#status-do-pagamento
export const CIELO_STATUS: Record<number, string> = {
  0: "pending",       // NotFinished
  1: "authorized",    // Authorized (aguardando captura – não usamos, capturamos direto)
  2: "approved",      // PaymentConfirmed
  3: "rejected",      // Denied
  10: "cancelled",    // Voided
  11: "refunded",     // Refunded
  12: "pending",      // Pending (Pix aguardando pagamento)
  13: "cancelled",    // Aborted
  20: "pending",      // Scheduled
};

export function mapCieloStatus(code: number): string {
  return CIELO_STATUS[code] ?? "pending";
}

// Detecção de bandeira a partir do número (regex básica; Cielo aceita
// "Visa", "Master", "Amex", "Elo", "Hipercard", "Diners", "Aura", "JCB").
export function detectBrand(cardNumber: string): string {
  const n = (cardNumber || "").replace(/\D/g, "");
  if (/^4\d{6,}/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])\d{5,}/.test(n)) return "Master";
  if (/^3[47]\d{5,}/.test(n)) return "Amex";
  if (/^(4011|4312|4389|4514|4573|5041|5066|5090|6277|6362|6363|6504|6505|6516|6550)/.test(n)) return "Elo";
  if (/^(606282|3841)/.test(n)) return "Hipercard";
  if (/^3(?:0[0-5]|[68])/.test(n)) return "Diners";
  if (/^35/.test(n)) return "JCB";
  return "Visa";
}

// Cielo espera valores em CENTAVOS (inteiro).
export function toCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

// Máscara segura para logs.
export function maskCard(num: string): string {
  const d = (num || "").replace(/\D/g, "");
  if (d.length < 8) return "***";
  return `${d.slice(0, 6)}******${d.slice(-4)}`;
}

// Regras de parcelamento sem juros — devem espelhar src/lib/installments.ts.
export function maxInstallmentsForTotal(total: number): number {
  const t = Number(total || 0);
  if (t >= 300) return 6;
  if (t >= 200) return 5;
  if (t >= 150) return 4;
  if (t >= 70) return 3;
  if (t >= 40) return 2;
  return 1;
}
