import { customerAccount } from "@/lib/customerAccountApi";
import { getCart, isPrescriptionCartItem, updateCartPrescription } from "@/lib/store";

const APPROVED = new Set(["aprovada", "approved"]);

function rank(status?: string | null) {
  const s = String(status || "").trim().toLowerCase();
  if (APPROVED.has(s)) return 3;
  if (["recusada", "rejeitada", "negada", "rejected"].includes(s)) return 1;
  return 2;
}

/**
 * Reconcilia o carrinho com receitas do próprio usuário via API autenticada.
 * O navegador não consulta a tabela prescriptions diretamente.
 */
export async function syncCartPrescriptionsFromServer(): Promise<boolean> {
  const items = getCart().filter(isPrescriptionCartItem);
  const productIds = Array.from(new Set(items.map((i) => i.product_id || i.id).filter(Boolean)));
  if (!productIds.length) return false;

  let data: any;
  try {
    data = await customerAccount<any>("prescriptions-for-products", { product_ids: productIds });
  } catch {
    return false;
  }

  const rows = Array.isArray(data?.prescriptions) ? data.prescriptions : [];
  const best = new Map<string, any>();

  for (const row of rows) {
    const covered = new Set<string>();
    if (row?.product_id) covered.add(String(row.product_id));
    if (Array.isArray(row?.product_ids)) row.product_ids.forEach((id: unknown) => { if (typeof id === "string") covered.add(id); });

    for (const productId of covered) {
      if (!productIds.includes(productId)) continue;
      const current = best.get(productId);
      if (!current) { best.set(productId, row); continue; }
      const better = rank(row.status) > rank(current.status)
        || (rank(row.status) === rank(current.status)
          && String(row.approved_at || row.created_at) >= String(current.approved_at || current.created_at));
      if (better) best.set(productId, row);
    }
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
