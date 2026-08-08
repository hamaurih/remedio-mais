// Regra ÚNICA de disponibilidade pública de um produto.
// stock > 0  => disponível/ativo no site
// stock <= 0 => indisponível
// Bloqueios legítimos (mesmo com estoque > 0):
//   manual_disabled = true | trier_active = false | archived_at preenchido
// Nenhum estoque mínimo arbitrário: 1 unidade já é disponível.
// Flags legadas (is_active, ecommerce_enabled, sync_with_trier) NÃO bloqueiam.

export type ProductAvailabilityInput = {
  stock_quantity?: number | string | null;
  stock?: number | string | null;
  trier_active?: boolean | null;
  manual_disabled?: boolean | null;
  archived_at?: string | null;
  force_active?: boolean | null;
};

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Usa o MAIOR valor entre stock e stock_quantity: edições manuais atualizam só
// `stock` e syncs antigos deixaram `stock_quantity` defasado.
export function productStock(p: ProductAvailabilityInput): number {
  const a = toNum(p?.stock);
  const b = toNum(p?.stock_quantity);
  if (a === null && b === null) return 0;
  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
}

export function isProductBlocked(p: ProductAvailabilityInput): boolean {
  if (p?.manual_disabled === true || !!p?.archived_at) return true;
  // force_active = override do admin: ignora o "inativo no Trier".
  if (p?.trier_active === false && p?.force_active !== true) return true;
  return false;
}

export function shouldProductBeActive(p: ProductAvailabilityInput): boolean {
  if (isProductBlocked(p)) return false;
  return productStock(p) > 0;
}
