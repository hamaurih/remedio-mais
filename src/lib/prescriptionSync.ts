import { supabase } from "@/integrations/supabase/client";
import { getCart, isPrescriptionCartItem, updateCartPrescription } from "@/lib/store";

const APPROVED = new Set(["aprovada", "approved"]);

function rank(status?: string | null) {
  const s = String(status || "").trim().toLowerCase();
  if (APPROVED.has(s)) return 3;
  if (["recusada", "rejeitada", "negada", "rejected"].includes(s)) return 1;
  return 2; // pending / under review
}

/**
 * Reconcilia o carrinho local com o servidor pelo par (usuário dono, produto).
 * Necessário porque a aprovação acontece no admin e o carrinho vive no
 * localStorage: sem isso, um item pode ficar bloqueado mesmo com receita
 * aprovada (outro dispositivo, aba antiga, falha do vínculo no upload).
 * A liberação continua exigindo receita aprovada do próprio usuário para
 * aquele produto — o RLS garante que só as receitas do dono são retornadas.
 */
export async function syncCartPrescriptionsFromServer(): Promise<boolean> {
  const items = getCart().filter(isPrescriptionCartItem);
  const productIds = Array.from(new Set(items.map((i) => i.product_id || i.id).filter(Boolean)));
  if (!productIds.length) return false;

  const { data, error } = await (supabase as any)
    .from("prescriptions")
    .select("id,product_id,status,approved_at,created_at")
    .in("product_id", productIds)
    .order("created_at", { ascending: true });

  if (error || !Array.isArray(data)) return false;

  const best = new Map<string, any>();
  for (const row of data) {
    if (!row?.product_id) continue;
    const current = best.get(row.product_id);
    if (!current) { best.set(row.product_id, row); continue; }
    const better = rank(row.status) > rank(current.status)
      || (rank(row.status) === rank(current.status)
        && String(row.approved_at || row.created_at) >= String(current.approved_at || current.created_at));
    if (better) best.set(row.product_id, row);
  }

  let changed = false;
  for (const [productId, row] of best) {
    const item = items.find((i) => (i.product_id || i.id) === productId);
    if (!item) continue;
    const status = String(row.status || "").trim().toLowerCase();
    const normalizedStatus = APPROVED.has(status) ? "aprovada" : row.status;
    if (item.prescription_id === row.id
      && String(item.prescription_status || "").toLowerCase() === String(normalizedStatus || "").toLowerCase()
      && (item.prescription_approved_at || null) === (row.approved_at || null)) continue;
    updateCartPrescription(productId, {
      id: row.id,
      status: normalizedStatus,
      approved_at: row.approved_at ?? null,
    });
    changed = true;
  }
  return changed;
}
