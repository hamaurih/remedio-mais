import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeOrderCommandPayload } from "../../supabase/functions/_shared/erp/order-command-contract";
import { resolveSiteDeliveryFee } from "../../supabase/functions/_shared/erp/site-delivery-pricing";

describe("ERP checkout parity", () => {
  it("normaliza o contrato completo do checkout sem confiar em strings livres", () => {
    const payload = normalizeOrderCommandPayload({
      idempotency_key: "  checkout-1  ",
      channel: "site",
      tenant_id: "tenant",
      store_id: "store",
      user_id: "user",
      customer: {
        name: " Cliente ",
        phone: " 83999999999 ",
        email: " cliente@example.com ",
        cpf: " 123 ",
      },
      delivery_type: "delivery",
      delivery: {
        cep: " 58400-000 ",
        street: " Rua A ",
        number: " 10 ",
        neighborhood: " Centro ",
        city: " Campina Grande ",
        state: " pb ",
        lat: -7.2,
        lng: -35.8,
      },
      payment_method: "pix",
      delivery_fee: 7,
      discount: 1,
      prescription_original_required: true,
      meta: { fbp: "fbp", fbc: "fbc" },
      items: [{
        product_id: "product",
        variant_id: "variant",
        variant_label: " Tamanho: M ",
        quantity: 2,
        unit_price: 10,
        prescription_id: "rx",
        prescription_condition: "original_on_delivery",
      }],
      created_by: "admin",
    });

    expect(payload.idempotency_key).toBe("checkout-1");
    expect(payload.customer.name).toBe("Cliente");
    expect(payload.delivery?.state).toBe("PB");
    expect(payload.items[0].variant_label).toBe("Tamanho: M");
    expect(payload.items[0].prescription_condition).toBe("original_on_delivery");
  });

  it("RPC versionada persiste os principais campos do checkout legado", () => {
    const sql = readFileSync(
      "supabase/migrations/20261024025000_erp_order_command_guarded_foundation.sql",
      "utf8",
    );

    for (const field of [
      "user_id",
      "delivery_cep",
      "delivery_street",
      "delivery_number",
      "delivery_neighborhood",
      "delivery_city",
      "delivery_state",
      "delivery_lat",
      "delivery_lng",
      "payment_gateway",
      "payment_method",
      "prescription_original_required",
      "prescription_original_status",
      "meta_fbp",
      "meta_fbc",
      "variant_id",
      "prescription_id",
      "prescription_condition",
    ]) {
      expect(sql).toContain(field);
    }
  });

  it("possui reserva transacional própria para variantes", () => {
    const sql = readFileSync(
      "supabase/migrations/20261024025000_erp_order_command_guarded_foundation.sql",
      "utf8",
    );

    expect(sql).toContain("variant_inventory_balances");
    expect(sql).toContain("variant_inventory_ledger");
    expect(sql).toContain("variant_inventory_balance_missing");
    expect(sql).toContain("insufficient_variant_stock");
    expect(sql).toContain("order_inventory_reservation_active_variant_uq");
    expect(sql).not.toContain("as $\ndeclare");
    expect(sql).not.toContain("end;\n$;");
  });

  it("valida receita contra usuário e produto no banco", () => {
    const sql = readFileSync(
      "supabase/migrations/20261024025000_erp_order_command_guarded_foundation.sql",
      "utf8",
    );

    expect(sql).toContain("rx.user_id=v_user_id");
    expect(sql).toContain("rx.product_id=p.id");
    expect(sql).toContain("invalid_prescription");
    expect(sql).toContain("pending_collection");
  });

  it("calcula frete do site no servidor e ignora desconto livre", () => {
    expect(resolveSiteDeliveryFee(
      { type: "pickup" },
      { delivery_fee: 9.9, delivery_mode: "flat" },
    )).toEqual({ ok: true, fee: 0, distance_km: null, mode: "pickup" });

    expect(resolveSiteDeliveryFee(
      { type: "delivery" },
      { delivery_fee: 7.5, delivery_mode: "flat" },
    )).toEqual({ ok: true, fee: 7.5, distance_km: null, mode: "flat" });

    const code = readFileSync("supabase/functions/erp-order-command-staging/index.ts", "utf8");
    expect(code).toContain("resolveSiteDeliveryFee");
    expect(code).toContain("deliveryFee = deliveryPricing.fee");
    expect(code).toContain("discount = 0");
  });

  it("deriva elegibilidade Trier somente do ambiente protegido do banco", () => {
    const sql = readFileSync(
      "supabase/migrations/20261024025000_erp_order_command_guarded_foundation.sql",
      "utf8",
    );

    expect(sql).toContain("v_db_environment");
    expect(sql).toContain("v_trier_eligible:=(v_db_environment='production')");
    expect(sql).toContain("erp_site_canary");
    expect(sql).toContain("case when v_trier_eligible then 'pending' else 'not_required' end");
  });

  it("staging resolve preço, variante e receita antes de chamar o RPC", () => {
    const code = readFileSync("supabase/functions/erp-order-command-staging/index.ts", "utf8");
    expect(code).toContain("buildProductReadModel");
    expect(code).toContain('from("product_variants")');
    expect(code).toContain("validatePrescription");
    expect(code).toContain("normalizeOrderCommandPayload");
    expect(code).toContain("expected_unit_price");
    expect(code).toContain("server_priced: true");
  });

  it("falhas Cielo liberam reserva e aprovações fazem settlement antes do Trier", () => {
    const pix = readFileSync("supabase/functions/create-cielo-pix/index.ts", "utf8");
    const card = readFileSync("supabase/functions/create-cielo-card/index.ts", "utf8");
    const webhook = readFileSync("supabase/functions/cielo-webhook/index.ts", "utf8");
    const status = readFileSync("supabase/functions/check-cielo-status/index.ts", "utf8");
    const reconcile = readFileSync("supabase/functions/cielo-reconcile-pending/index.ts", "utf8");

    expect(pix).toContain("releaseInventoryBeforeOrderDelete");
    expect(card).toContain("releaseInventoryBeforeOrderDelete");
    expect(card).toContain("settleOrderInventoryForPayment");
    expect(card).toContain('status==="approved"&&inventory.ok');
    expect(webhook).toContain("settleOrderInventoryForPayment");
    expect(webhook).toContain("firstApproval&&inventory.ok");
    expect(status).toContain("settleOrderInventoryForPayment");
    expect(status).toContain("firstApproval&&inventory.ok");
    expect(reconcile).toContain("settleOrderInventoryForPayment");
    expect(reconcile).toContain("first&&inventory.ok");
  });

  it("canário real continua desativado nesta branch", () => {
    const canary = readFileSync("supabase/functions/_shared/erp/order-canary.ts", "utf8");
    const prepare = readFileSync("supabase/functions/_shared/prepare-order.ts", "utf8");

    expect(canary).toContain('type OrderCanaryMode = "off" | "observe"');
    expect(canary).not.toContain('"execute"');
    expect(prepare).not.toContain("erp_create_order_with_reservation");
    expect(prepare).toContain('admin.from("orders").insert');
  });
});
