// Lightweight cart store using localStorage + custom events
export type CartItem = {
  id: string;            // unique line key (variant.id when variant, otherwise product.id)
  product_id?: string;   // parent product id (always set for new items)
  variant_id?: string | null;
  variant_label?: string | null; // e.g. "Tamanho: XXG"
  name: string;
  price: number;
  image_url?: string | null;
  quantity: number;
};

const KEY = "atacadao_cart_v1";
const EVENT = "atacadao:cart-changed";

export function getCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

function save(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(item: Omit<CartItem, "quantity">, qty = 1) {
  const items = getCart();
  const existing = items.find((i) => i.id === item.id);
  if (existing) existing.quantity += qty;
  else items.push({ ...item, product_id: item.product_id || item.id, quantity: qty });
  save(items);
  // Mensuração centralizada (Meta Pixel + CAPI). Nunca lança erro no fluxo do carrinho.
  void import("./metaEvents").then((m) => m.trackAddToCart({
    id: item.id, product_id: item.product_id, name: item.name, price: item.price, quantity: qty,
  })).catch(() => {});
}


export function updateQty(id: string, qty: number) {
  const items = getCart().map((i) => (i.id === id ? { ...i, quantity: Math.max(1, qty) } : i));
  save(items);
}

export function updateItemPrice(id: string, price: number) {
  save(getCart().map((i) => (i.id === id ? { ...i, price } : i)));
}

export function removeFromCart(id: string) {
  save(getCart().filter((i) => i.id !== id));
}

export function clearCart() { save([]); }

// Pedido Pix aguardando confirmação — usado para limpar o carrinho
// mesmo se o cliente pagar no app do banco e não voltar para a tela do Pix.
const PENDING_PIX_KEY = "atacadao_pending_pix_order";

export function setPendingPixOrder(orderId: string) {
  try { localStorage.setItem(PENDING_PIX_KEY, orderId); } catch { /* ignore */ }
}

export function getPendingPixOrder(): string | null {
  try { return localStorage.getItem(PENDING_PIX_KEY); } catch { return null; }
}

export function clearPendingPixOrder() {
  try { localStorage.removeItem(PENDING_PIX_KEY); } catch { /* ignore */ }
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

export function onCartChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function buildWhatsAppLink(phone: string, message: string) {
  const clean = phone.replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}
