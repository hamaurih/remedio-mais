import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261025230000_order_command_pilot_cutover_v1.sql","utf8");
const page = readFileSync("src/pages/admin/AdminOrderCommand.tsx","utf8");

describe("order command pilot cutover contract", () => {
  it("adds a per-order pilot allowlist with RLS", () => {
    expect(migration).toContain("create table if not exists public.order_command_pilot_orders");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("order_command_pilot_orders_read_v1");
    expect(migration).toContain("order_command_pilot_orders_insert_v1");
    expect(migration).toContain("order_command_pilot_orders_update_v1");
  });

  it("keeps global mode shadow while allowing only enrolled orders", () => {
    expect(migration).toContain("v_global_enabled");
    expect(migration).toContain("v_pilot_enabled");
    expect(migration).toContain("if not (v_global_enabled or v_pilot_enabled)");
    expect(migration).toContain("Pedido não está habilitado para o piloto do Order Command");
    expect(page).toContain("O Order Command global continua em Shadow");
  });

  it("closes the pilot automatically after commit or release", () => {
    const occurrences = migration.split("update public.order_command_pilot_orders").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("set enabled=false");
    expect(migration).toContain("pilot_closed");
  });

  it("does not expose broad activation in the operational UI", () => {
    expect(page).not.toContain("admin_set_order_command_enabled");
    expect(page).not.toContain("Ativar modo controlado");
    expect(page).toContain("Entrar no piloto");
    expect(page).toContain("Retirar do piloto");
  });

  it("keeps Trier out of the pilot cutover", () => {
    expect(migration).not.toContain("send-order-to-trier");
    expect(migration).not.toContain("trier_settings");
    expect(page).not.toContain("send-order-to-trier");
  });

  it("blocks anonymous enrollment RPC access", () => {
    expect(migration).toContain("revoke all on function public.admin_set_order_command_pilot(uuid,boolean,text) from anon");
  });
});
