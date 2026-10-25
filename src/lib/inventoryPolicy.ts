export type AbcClass = "A" | "B" | "C";
export type InventoryStatus = "ruptura" | "critico" | "repor" | "excesso" | "sem_giro" | "ok";

export const INVENTORY_POLICY = {
  A: { safetyDays: 7, coverageDays: 21 },
  B: { safetyDays: 5, coverageDays: 14 },
  C: { safetyDays: 3, coverageDays: 7 },
  defaultLeadTimeDays: 3,
  excessFactor: 2,
} as const;

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  ruptura: "Ruptura",
  critico: "Crítico",
  repor: "Repor",
  excesso: "Excesso",
  sem_giro: "Sem giro",
  ok: "OK",
};

export type InventoryPolicyInput = {
  abcClass: AbcClass;
  avgDailyUnits: number;
  onHandStock: number;
  reservedStock?: number;
  minimumStock?: number;
  leadTimeDays?: number | null;
  minimumOrderQty?: number | null;
};

export type InventoryPolicyResult = {
  abcClass: AbcClass;
  availableStock: number;
  leadTimeDays: number;
  leadTimeSource: "supplier" | "default";
  safetyDays: number;
  coverageDaysTarget: number;
  coverageDays: number | null;
  reorderPoint: number;
  targetStock: number;
  suggestedQty: number;
  status: InventoryStatus;
};

function finiteNonNegative(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function calculateInventoryPolicy(input: InventoryPolicyInput): InventoryPolicyResult {
  const policy = INVENTORY_POLICY[input.abcClass];
  const avgDailyUnits = finiteNonNegative(input.avgDailyUnits);
  const onHandStock = finiteNonNegative(input.onHandStock);
  const reservedStock = finiteNonNegative(input.reservedStock);
  const availableStock = Math.max(0, onHandStock - reservedStock);
  const minimumStock = finiteNonNegative(input.minimumStock);
  const hasSupplierLeadTime = input.leadTimeDays != null && Number.isFinite(Number(input.leadTimeDays)) && Number(input.leadTimeDays) >= 0;
  const leadTimeDays = hasSupplierLeadTime ? Number(input.leadTimeDays) : INVENTORY_POLICY.defaultLeadTimeDays;
  const minimumOrderQty = finiteNonNegative(input.minimumOrderQty);

  const reorderPoint = avgDailyUnits > 0
    ? Math.max(minimumStock, Math.ceil(avgDailyUnits * (leadTimeDays + policy.safetyDays)))
    : minimumStock;

  const targetStock = avgDailyUnits > 0
    ? Math.max(
        reorderPoint,
        Math.ceil(avgDailyUnits * (leadTimeDays + policy.safetyDays + policy.coverageDays)),
      )
    : minimumStock;

  let status: InventoryStatus = "ok";
  if (avgDailyUnits <= 0) {
    status = availableStock > 0 ? "sem_giro" : "ok";
  } else if (availableStock <= 0) {
    status = "ruptura";
  } else if (availableStock <= reorderPoint) {
    status = "critico";
  } else if (availableStock < targetStock) {
    status = "repor";
  } else if (targetStock > 0 && availableStock > targetStock * INVENTORY_POLICY.excessFactor) {
    status = "excesso";
  }

  let suggestedQty = avgDailyUnits > 0 ? Math.max(0, targetStock - availableStock) : 0;
  if (suggestedQty > 0 && minimumOrderQty > 1) {
    suggestedQty = Math.ceil(suggestedQty / minimumOrderQty) * minimumOrderQty;
  }

  return {
    abcClass: input.abcClass,
    availableStock,
    leadTimeDays,
    leadTimeSource: hasSupplierLeadTime ? "supplier" : "default",
    safetyDays: policy.safetyDays,
    coverageDaysTarget: policy.coverageDays,
    coverageDays: avgDailyUnits > 0 ? availableStock / avgDailyUnits : null,
    reorderPoint,
    targetStock,
    suggestedQty,
    status,
  };
}
