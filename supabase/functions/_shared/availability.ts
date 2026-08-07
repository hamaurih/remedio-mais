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
};

export function productStock(p: ProductAvailabilityInput): number {
  const n = Number(p?.stock_quantity ?? p?.stock ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function isProductBlocked(p: ProductAvailabilityInput): boolean {
  return p?.manual_disabled === true || p?.trier_active === false || !!p?.archived_at;
}

export function shouldProductBeActive(p: ProductAvailabilityInput): boolean {
  if (isProductBlocked(p)) return false;
  return productStock(p) > 0;
}
