/**
 * One browser checkout intent -> one durable server-side order identity.
 * Never persist PAN, CVV, customer address, CPF or raw fingerprint.
 */
export type CheckoutAttemptIntent = {
  userId: string;
  paymentMethod: "pix" | "credit_card";
  products: Array<{ id: string; variantId?: string | null; quantity: number; unitCents: number }>;
  deliveryType: "pickup" | "delivery";
  delivery: Record<string, string | number | null | undefined> | null;
  customer: { name: string; phone: string; cpf: string };
  totalCents: number;
  installments: number;
  cardLast4?: string;
  cardExpiration?: string;
};

const TTL_MS = 30 * 60 * 1000;
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canonicalCheckoutAttempt(input: CheckoutAttemptIntent): string {
  const products = input.products.map(p => ({
    id: p.id, variantId: p.variantId || null,
    quantity: Number(p.quantity), unitCents: Number(p.unitCents),
  })).sort((a, b) => (a.id + ":" + a.variantId).localeCompare(b.id + ":" + b.variantId));
  const delivery = input.deliveryType === "pickup" ? null : input.delivery;
  // The canonical data is hashed in memory. It is never written to storage.
  return JSON.stringify({
    userId: input.userId, paymentMethod: input.paymentMethod, products,
    deliveryType: input.deliveryType, delivery,
    customer: input.customer, totalCents: input.totalCents,
    installments: input.installments,
    cardLast4: input.cardLast4 || "", cardExpiration: input.cardExpiration || "",
  });
}

function parseExisting(value: string | null, now: number): string | null {
  if (!value) return null;
  try {
    const row = JSON.parse(value) as { key?: unknown; created?: unknown };
    if (typeof row.key === "string" && TOKEN_RE.test(row.key)
      && typeof row.created === "number" && row.created <= now
      && now - row.created < TTL_MS) return row.key;
  } catch { /* corrupt or stale storage -> replace */ }
  return null;
}

/** Reused by retries and tabs; database unique external_idempotency_key is the final guard. */
export async function getCheckoutAttemptKey(intent: CheckoutAttemptIntent): Promise<string> {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID) {
    throw new Error("Não foi possível iniciar um pagamento seguro neste navegador.");
  }
  const bytes = new TextEncoder().encode(canonicalCheckoutAttempt(intent));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, "0")).join("");
  const storageKey = "cielo-checkout-intent-v1:" + hash;
  const claim = () => {
    const now = Date.now();
    // Fail closed if stable storage is unavailable; no silently generated duplicate token.
    const existing = parseExisting(localStorage.getItem(storageKey), now);
    if (existing) return existing;
    const key = crypto.randomUUID();
    localStorage.setItem(storageKey, JSON.stringify({ key, created: now }));
    return key;
  };
  const locks = globalThis.navigator?.locks;
  if (locks?.request) return locks.request(storageKey, claim);
  return claim();
}

/** Remove an old attempt only after confirmed purchase; a new purchase can then use a new key. */
export function linkCheckoutAttemptToOrder(orderId: string, token: string): void {
  if (!TOKEN_RE.test(orderId) || !TOKEN_RE.test(token)) return;
  try { localStorage.setItem("cielo-checkout-order-v1:" + orderId, token); }
  catch { /* closed storage is handled by the next checkout attempt */ }
}
export function completeCheckoutAttempt(orderId: string): void {
  if (!TOKEN_RE.test(orderId)) return;
  try {
    const mapping = "cielo-checkout-order-v1:" + orderId;
    const token = localStorage.getItem(mapping);
    if (!token) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("cielo-checkout-intent-v1:")) keys.push(key);
    }
    for (const key of keys) {
      const value = localStorage.getItem(key);
      try {
        if (value && (JSON.parse(value) as { key?: string }).key === token) localStorage.removeItem(key);
      } catch { /* ignore malformed values */ }
    }
    localStorage.removeItem(mapping);
  } catch { /* checkout remains safe; stale entries expire automatically */ }
}
