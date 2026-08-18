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
  requires_prescription?: boolean;
  controlled?: boolean;
  prescription_id?: string | null;
  prescription_status?: string | null;
  prescription_approved_at?: string | null;
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

export function isPrescriptionCartItem(item: CartItem) {
  return item.requires_prescription === true || item.controlled === true;
}

function normalizePrescriptionStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase();
}

export function isPrescriptionApproved(item: CartItem) {
  if (!isPrescriptionCartItem(item)) return true;
  const status = normalizePrescriptionStatus(item.prescription_status);
  return !!item.prescription_id && status === "aprovada" && !!item.prescription_approved_at;
}

export function isCartItemPayable(item: CartItem) {
  return !isPrescriptionCartItem(item) || isPrescriptionApproved(item);
}

export function cartPayableItems(items: CartItem[]) {
  return items.filter(isCartItemPayable);
}

export function cartPendingPrescriptionItems(items: CartItem[]) {
  return items.filter((item) => isPrescriptionCartItem(item) && !isCartItemPayable(item));
}

export function cartPayableTotal(items: CartItem[]) {
  return cartTotal(cartPayableItems(items));
}

export function addToCart(item: Omit<CartItem, "quantity">, qty = 1) {
  const items = getCart();
  const existing = items.find((i) => i.id === item.id);
  if (existing) {
    existing.quantity += qty;
    existing.requires_prescription = item.requires_prescription ?? existing.requires_prescription;
    existing.controlled = item.controlled ?? existing.controlled;
  } else {
    items.push({ ...item, product_id: item.product_id || item.id, quantity: qty });
  }
  save(items);

  // Prescription/controlled products are deliberately excluded from Meta
  // AddToCart tracking to avoid sensitive health-related signals.
  if (!item.requires_prescription && !item.controlled) {
    void import("./metaEvents").then((m) => m.trackAddToCart({
      id: item.id, product_id: item.product_id, name: item.name, price: item.price, quantity: qty,
    })).catch(() => {});
  }
}

export function updateQty(id: string, qty: number) {
  const items = getCart().map((i) => (i.id === id ? { ...i, quantity: Math.max(1, qty) } : i));
  save(items);
}

export function updateItemPrice(id: string, price: number) {
  save(getCart().map((i) => (i.id === id ? { ...i, price } : i)));
}

export function updateCartPrescription(
  productId: string,
  prescription: {
    id?: string | null;
    status?: string | null;
    approved_at?: string | null;
  },
) {
  const items = getCart().map((item) => {
    const itemProductId = item.product_id || item.id;
    if (itemProductId !== productId || !isPrescriptionCartItem(item)) return item;
    return {
      ...item,
      prescription_id: prescription.id ?? null,
      prescription_status: prescription.status ?? null,
      prescription_approved_at: prescription.approved_at ?? null,
    };
  });
  save(items);
}

export function syncCartPrescriptionById(
  prescriptionId: string,
  prescription: { status?: string | null; approved_at?: string | null },
) {
  save(getCart().map((item) => item.prescription_id === prescriptionId ? {
    ...item,
    prescription_status: prescription.status ?? null,
    prescription_approved_at: prescription.approved_at ?? null,
  } : item));
}

export function removeFromCart(id: string) {
  save(getCart().filter((i) => i.id !== id));
}

export function removeCartItems(ids: string[]) {
  const set = new Set(ids);
  save(getCart().filter((i) => !set.has(i.id)));
}

// Payment completion must remove what was payable without deleting medicine
// still waiting for prescription approval. Approved prescription items are
// payable and are therefore removed normally after their own successful order.
export function clearCart() {
  save(getCart().filter((item) => !isCartItemPayable(item)));
}

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
