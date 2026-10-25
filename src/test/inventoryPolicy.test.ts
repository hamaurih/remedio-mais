import { describe, expect, it } from "vitest";
import { calculateInventoryPolicy, INVENTORY_POLICY } from "@/lib/inventoryPolicy";

describe("inventory management policy", () => {
  it("treats a high-rotation A item as critical even with stock far above five units", () => {
    const result = calculateInventoryPolicy({
      abcClass: "A",
      avgDailyUnits: 10,
      onHandStock: 50,
      reservedStock: 0,
      minimumStock: 0,
      leadTimeDays: 4,
    });

    expect(result.reorderPoint).toBe(110);
    expect(result.targetStock).toBe(320);
    expect(result.suggestedQty).toBe(270);
    expect(result.status).toBe("critico");
  });

  it("keeps a slow C item healthy with only two units when coverage is sufficient", () => {
    const result = calculateInventoryPolicy({
      abcClass: "C",
      avgDailyUnits: 0.05,
      onHandStock: 2,
      reservedStock: 0,
      minimumStock: 0,
      leadTimeDays: 3,
    });

    expect(result.reorderPoint).toBe(1);
    expect(result.targetStock).toBe(1);
    expect(result.status).toBe("ok");
    expect(result.suggestedQty).toBe(0);
  });

  it("never suggests automatic purchase for an item without recent rotation", () => {
    const result = calculateInventoryPolicy({
      abcClass: "C",
      avgDailyUnits: 0,
      onHandStock: 10,
      reservedStock: 0,
      minimumStock: 5,
      leadTimeDays: null,
    });

    expect(result.status).toBe("sem_giro");
    expect(result.suggestedQty).toBe(0);
    expect(result.leadTimeSource).toBe("default");
  });

  it("subtracts reservations before deciding replenishment status", () => {
    const result = calculateInventoryPolicy({
      abcClass: "B",
      avgDailyUnits: 1,
      onHandStock: 10,
      reservedStock: 8,
      minimumStock: 0,
      leadTimeDays: 3,
    });

    expect(result.availableStock).toBe(2);
    expect(result.reorderPoint).toBe(8);
    expect(result.status).toBe("critico");
  });

  it("rounds suggested purchase up to the supplier minimum order quantity", () => {
    const result = calculateInventoryPolicy({
      abcClass: "B",
      avgDailyUnits: 2,
      onHandStock: 0,
      reservedStock: 0,
      minimumStock: 0,
      leadTimeDays: 3,
      minimumOrderQty: 12,
    });

    expect(result.targetStock).toBe(44);
    expect(result.suggestedQty).toBe(48);
    expect(result.status).toBe("ruptura");
  });

  it("locks the initial class policy used by SQL and UI", () => {
    expect(INVENTORY_POLICY).toEqual({
      A: { safetyDays: 7, coverageDays: 21 },
      B: { safetyDays: 5, coverageDays: 14 },
      C: { safetyDays: 3, coverageDays: 7 },
      defaultLeadTimeDays: 3,
      excessFactor: 2,
    });
  });
});
