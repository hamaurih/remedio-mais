import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  deterministicCanaryBucket,
  evaluateOrderCanary,
  parseOrderCanaryConfig,
} from "../../supabase/functions/_shared/erp/order-canary";

describe("ERP Order Canary safe observation", () => {
  it("nasce desligado e com zero por cento", () => {
    const config = parseOrderCanaryConfig({});
    expect(config.mode).toBe("off");
    expect(config.percent).toBe(0);
    expect(config.channels.size).toBe(0);
  });

  it("não aceita modo execute nesta fase", () => {
    const config = parseOrderCanaryConfig({
      ERP_ORDER_CANARY_MODE: "execute",
      ERP_ORDER_CANARY_PERCENT: "100",
      ERP_ORDER_CANARY_CHANNELS: "site",
    });
    expect(config.mode).toBe("off");
  });

  it("bucket é determinístico", () => {
    const a = deterministicCanaryBucket("user-123", "salt-a");
    const b = deterministicCanaryBucket("user-123", "salt-a");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(10000);
  });

  it("100% em observe nunca muda a rota real do checkout", () => {
    const decision = evaluateOrderCanary({
      config: parseOrderCanaryConfig({
        ERP_ORDER_CANARY_MODE: "observe",
        ERP_ORDER_CANARY_PERCENT: "100",
        ERP_ORDER_CANARY_CHANNELS: "site",
      }),
      stableKey: "user-123",
      channel: "site",
      deliveryType: "pickup",
      items: [{ requires_prescription: false, controlled: false }],
    });

    expect(decision.candidate).toBe(true);
    expect(decision.selected).toBe(true);
    expect(decision.would_route).toBe("erp");
    expect(decision.route).toBe("legacy");
    expect(decision.reason).toBe("selected_observe_only");
  });

  it("exclui entrega, variantes e itens regulados do primeiro canário", () => {
    const config = parseOrderCanaryConfig({
      ERP_ORDER_CANARY_MODE: "observe",
      ERP_ORDER_CANARY_PERCENT: "100",
      ERP_ORDER_CANARY_CHANNELS: "site",
    });

    expect(evaluateOrderCanary({
      config, stableKey: "a", channel: "site", deliveryType: "delivery", items: [{}],
    }).reason).toBe("delivery_not_eligible");

    expect(evaluateOrderCanary({
      config, stableKey: "a", channel: "site", deliveryType: "pickup", items: [{ variant_id: "v1" }],
    }).reason).toBe("variant_not_eligible");

    expect(evaluateOrderCanary({
      config, stableKey: "a", channel: "site", deliveryType: "pickup", items: [{ controlled: true }],
    }).reason).toBe("regulated_item_not_eligible");
  });

  it("prepare-order continua sem chamar o novo RPC", () => {
    const code = readFileSync("supabase/functions/_shared/prepare-order.ts", "utf8");
    expect(code).toContain("evaluateOrderCanary");
    expect(code).toContain('route: "legacy"');
    expect(code).not.toContain("erp_create_order_with_reservation");
    expect(code).toContain('admin.from("orders").insert');
  });

  it("migration oficial nasce com flag de banco desligada", () => {
    const sql = readFileSync(
      "supabase/migrations/20261024025000_erp_order_command_guarded_foundation.sql",
      "utf8",
    );
    expect(sql).toContain("'order_command_write',false");
    expect(sql).toContain("erp_order_command_db_disabled");
    expect(sql).toContain("erp_order_channel_db_disabled");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("grant execute on function public.erp_create_order_with_reservation(jsonb) to service_role");
  });
});
