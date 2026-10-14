import { supabase } from "@/integrations/supabase/client";

export type FunnelCartItem = {
  id: string;
  product_id?: string | null;
  quantity: number;
  price: number;
};

const SESSION_KEY = "atacadao_cart_session_v1";

function createUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // UUID v4 fallback for older browsers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getCartSessionId(create = true): string | null {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id && create) {
      id = createUuid();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return create ? createUuid() : null;
  }
}

export function resetCartSessionId() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export async function trackCartFunnel(
  event: "snapshot" | "cart_changed" | "checkout_started" | "payment_attempted" | "cleared",
  items: FunnelCartItem[],
  paymentMethod?: "pix" | "credit_card" | null,
) {
  const safeItems = (items || []).slice(0, 200).map((i) => ({
    product_id: i.product_id || i.id,
    quantity: Math.max(1, Number(i.quantity) || 1),
    unit_price: Math.max(0, Number(i.price) || 0),
  }));
  const itemCount = safeItems.reduce((s, i) => s + i.quantity, 0);
  const cartValue = safeItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  // Não cria sessão apenas por navegar com carrinho vazio.
  const sessionId = getCartSessionId(itemCount > 0 || event === "checkout_started" || event === "payment_attempted");
  if (!sessionId) return;

  try {
    await (supabase as any).rpc("track_cart_funnel", {
      p_session_id: sessionId,
      p_event: event,
      p_cart_value: Number(cartValue.toFixed(2)),
      p_item_count: itemCount,
      p_items: safeItems,
      p_path: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : null,
      p_payment_method: paymentMethod || null,
    });
  } catch {
    // Analytics nunca pode bloquear compra/carrinho.
  }
}
