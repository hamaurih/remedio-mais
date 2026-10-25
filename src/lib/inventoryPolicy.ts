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

export type InventoryManagementRow = {
  product_id: string;
  product_name: string;
  trier_product_id?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category_name?: string | null;
  department_name?: string | null;
  laboratory?: string | null;
  requires_prescription?: boolean;
  controlled?: boolean;
  abc_class: AbcClass;
  abc_value: number;
  abc_units: number;
  reference_price: number;
  on_hand_stock: number;
  reserved_stock: number;
  available_stock: number;
  minimum_stock: number;
  units_30d: number;
  units_90d: number;
  units_180d: number;
  units_365d: number;
  avg_daily_units: number;
  coverage_days?: number | null;
  lead_time_days: number;
  lead_time_source: "supplier" | "default";
  safety_days: number;
  target_coverage_days: number;
  reorder_point: number;
  target_stock: number;
  status: InventoryStatus;
  suggested_qty: number;
  last_sale_at?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  last_cost?: number | null;
  minimum_order_qty?: number | null;
  estimated_line_cost?: number | null;
};

export type InventoryManagementPayload = {
  store: { id: string; name: string };
  parameters: {
    abc_days: number;
    default_lead_time_days: number;
    excess_factor: number;
    class_policy: Record<AbcClass, { safety_days: number; coverage_days: number }>;
  };
  freshness: { rotation_synced_at?: string | null; latest_sale_at?: string | null };
  summary: {
    rupture_count: number;
    critical_count: number;
    replenishment_count: number;
    excess_count: number;
    no_rotation_count: number;
    ok_count: number;
    suggested_units: number;
    estimated_cost: number;
    supplier_linked_items: number;
    lead_time_configured_items: number;
    abc_a_count: number;
    abc_b_count: number;
    abc_c_count: number;
    abc_total_value: number;
    abc_total_units: number;
  };
  rows: InventoryManagementRow[];
};
