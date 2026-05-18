// Pix discount helper

export function calculatePixPrice(
  basePrice: number | null | undefined,
  pixDiscountPercentage: number | null | undefined,
): number | null {
  if (!basePrice || !pixDiscountPercentage || pixDiscountPercentage <= 0) return null;
  return basePrice * (1 - pixDiscountPercentage / 100);
}

export type PixConfig = {
  enabled: boolean;
  percentage: number;
};

export function resolvePixPercentage(
  productPct: number | null | undefined,
  storePct: number | null | undefined,
  storeEnabled: boolean | null | undefined,
): number {
  if (productPct && productPct > 0) return Number(productPct);
  if (storeEnabled && storePct && storePct > 0) return Number(storePct);
  return 0;
}
