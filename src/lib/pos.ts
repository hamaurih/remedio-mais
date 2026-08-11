import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PLACEHOLDER } from "@/lib/productQuality";

const db = supabase as any;

export type PosProduct = {
  id: string;
  name: string;
  manufacturer: string | null;
  trier_product_id: string | null;
  barcode: string | null;
  sku: string | null;
  image_url: string | null;
  price: number | null;
  promo_price: number | null;
  promotion_start: string | null;
  promotion_end: string | null;
  stock: number | null;
};

export type PosCartItem = {
  product: PosProduct;
  quantity: number;
  discount: number;
};

export type PosPaymentMethod = "cash" | "pix" | "debit" | "credit";

export type PosPayment = {
  method: PosPaymentMethod;
  amount: number;
  received_amount?: number;
};

export type PosSession = {
  id: string;
  store_id: string;
  terminal_id: string;
  operator_id: string;
  opening_amount: number;
  opened_at: string;
  status: "open" | "closed";
};

export type PosOperator = {
  id: string;
  store_id: string;
  pos_role: "operator" | "supervisor" | "manager" | "admin";
  max_discount_percent: number;
};

export const PAYMENT_LABELS: Record<PosPaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Cartão débito",
  credit: "Cartão crédito",
};

export function productImage(p: { image_url?: string | null }) {
  const url = (p.image_url || "").trim();
  if (!url || url.toLowerCase().includes("placeholder")) return DEFAULT_PLACEHOLDER;
  return url;
}

export function hasValidPromo(p: PosProduct) {
  const promo = Number(p.promo_price ?? 0);
  const base = Number(p.price ?? 0);
  if (!promo || promo <= 0 || !base || promo >= base) return false;
  const now = Date.now();
  if (p.promotion_start && new Date(p.promotion_start).getTime() > now) return false;
  if (p.promotion_end && new Date(p.promotion_end).getTime() < now) return false;
  return true;
}

export function unitPrice(p: PosProduct) {
  return hasValidPromo(p) ? Number(p.promo_price) : Number(p.price ?? 0);
}

export function itemTotal(item: PosCartItem) {
  return round2(unitPrice(item.product) * item.quantity - (item.discount || 0));
}

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function brl(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// manual_barcode é uma FLAG booleana ("código digitado à mão"), nunca um EAN.
const PRODUCT_FIELDS =
  "id,name,manufacturer,trier_product_id,barcode,trier_barcode,sku,image_url,price,promo_price,promotion_start,promotion_end,stock";

function normalize(row: any): PosProduct {
  return {
    ...row,
    barcode: row.barcode || row.trier_barcode || null,
  } as PosProduct;
}

/** Busca por código exato (EAN/barras/Trier/SKU) e, se não achar, por nome. */
export async function posSearchProducts(term: string): Promise<PosProduct[]> {
  const q = term.trim();
  if (!q) return [];
  const code = q.replace(/\s+/g, "");
  const exact = await db
    .from("products")
    .select(PRODUCT_FIELDS)
    .or(
      [
        `barcode.eq.${code}`,
        `trier_barcode.eq.${code}`,
        `sku.eq.${code}`,
        `trier_product_id.eq.${code}`,
      ].join(","),
    )
    .limit(10);
  if (exact.error) throw exact.error;
  if ((exact.data?.length ?? 0) > 0) return (exact.data as any[]).map(normalize);

  const byName = await db
    .from("products")
    .select(PRODUCT_FIELDS)
    .ilike("name", `%${q}%`)
    .order("stock", { ascending: false })
    .limit(20);
  if (byName.error) throw byName.error;
  return ((byName.data as any[]) || []).map(normalize);
}

export async function posGetOperator(): Promise<PosOperator | null> {
  const { data } = await db.from("pos_operators").select("id,store_id,pos_role,max_discount_percent").eq("active", true).limit(1).maybeSingle();
  return (data as PosOperator) || null;
}

export async function posGetTerminals() {
  const { data, error } = await db
    .from("pos_terminals")
    .select("id,name,code,store_id,active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data as any[]) || [];
}

export async function posGetOpenSession(): Promise<PosSession | null> {
  const { data } = await db
    .from("cash_register_sessions")
    .select("id,store_id,terminal_id,operator_id,opening_amount,opened_at,status")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PosSession) || null;
}

export async function posOpenSession(terminalId: string, openingAmount: number) {
  const { data, error } = await db.rpc("pos_open_session", {
    _terminal_id: terminalId,
    _opening_amount: openingAmount,
  });
  if (error) throw error;
  return data as string;
}

export async function posCloseSession(sessionId: string, countedCash: number, notes?: string) {
  const { data, error } = await db.rpc("pos_close_session", {
    _session_id: sessionId,
    _counted_cash: countedCash,
    _notes: notes || null,
  });
  if (error) throw error;
  return data as any;
}

export async function posCashMovement(sessionId: string, type: "withdrawal" | "deposit", amount: number, reason?: string) {
  const { error } = await db.rpc("pos_cash_movement", {
    _session_id: sessionId,
    _type: type,
    _amount: amount,
    _reason: reason || null,
  });
  if (error) throw error;
}

export type PosFinalizePayload = {
  session_id: string;
  client_request_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_cpf?: string | null;
  customer_phone?: string | null;
  discount?: number;
  notes?: string | null;
  items: { product_id: string; quantity: number; discount: number }[];
  payments: PosPayment[];
};

export type PosFinalizeResult = {
  sale_id: string;
  sale_number: number;
  order_id: string | null;
  subtotal: number;
  discount: number;
  total: number;
  change: number;
  duplicate?: boolean;
};

export async function posFinalizeSale(payload: PosFinalizePayload): Promise<PosFinalizeResult> {
  const { data, error } = await db.rpc("pos_finalize_sale", { _payload: payload });
  if (error) throw error;
  return data as PosFinalizeResult;
}

/** Reaproveita a integração oficial já existente (send-order-to-trier). */
export async function posSendSaleToTrier(saleId: string, orderId: string | null) {
  if (!orderId) return { ok: false, error: "Venda sem pedido vinculado" };
  const { data, error } = await supabase.functions.invoke("send-order-to-trier", {
    body: { order_id: orderId },
  });
  const ok = !error && (data as any)?.ok !== false;
  await db
    .from("pos_sales")
    .update({
      trier_status: ok ? "sent" : "error",
      trier_sent_at: ok ? new Date().toISOString() : null,
      trier_error_message: ok ? null : error?.message || (data as any)?.error || "Falha no envio",
      status: ok ? "trier_sent" : "trier_error",
    })
    .eq("id", saleId);
  return { ok, error: ok ? undefined : error?.message || (data as any)?.error };
}

export async function posSearchCustomers(term: string) {
  const q = term.trim();
  if (!q) return [];
  const digits = q.replace(/\D/g, "");
  const filters = [`full_name.ilike.%${q}%`];
  if (digits.length >= 3) filters.push(`cpf.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,cpf,phone,email")
    .or(filters.join(","))
    .limit(10);
  if (error) throw error;
  return (data as any[]) || [];
}
