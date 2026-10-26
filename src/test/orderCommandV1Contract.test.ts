import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261025223000_order_command_reservations_v1.sql","utf8");
const page = readFileSync("src/pages/admin/AdminOrderCommand.tsx","utf8");

describe("order command v1 contract", () => {
  it("starts disabled in shadow mode", () => {
    expect(migration).toContain("'order_command_v1',false");
    expect(migration).toContain("'mode','shadow'");
    expect(page).toContain("Order Command está em modo shadow/desligado");
  });

  it("supports site whatsapp counter pdv phone seller and ai channels", () => {
    for (const channel of ["site","whatsapp","balcao","telefone","pdv","vendedor","ia"]) {
      expect(migration).toContain(`'${channel}'`);
    }
  });

  it("reserves commits and releases only through the internal ledger", () => {
    expect(migration).toContain("'reservation'");
    expect(migration).toContain("'sale'");
    expect(migration).toContain("'release'");
    expect(migration).toContain("insert into public.inventory_ledger");
    expect(migration).toContain("insert into public.order_inventory_reservations");
    expect(migration).not.toContain("update public.products set stock");
  });

  it("requires approved payment before commit", () => {
    expect(migration).toContain("Pagamento precisa estar aprovado antes da baixa do estoque");
    expect(migration).toContain("v_order.payment_status<>'approved'");
  });

  it("blocks terminal orders from reservation", () => {
    expect(migration).toContain("Pedido cancelado/terminal não pode reservar estoque");
    expect(migration).toContain("'cancelled','refunded','rejected','chargeback'");
  });

  it("prevents overselling with availability checks and order locking", () => {
    expect(migration).toContain("ib.available>=v_item.quantity");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("insufficient_inventory");
  });

  it("does not touch Trier implementation", () => {
    expect(migration).not.toContain("send-order-to-trier");
    expect(migration).not.toContain("trier_settings");
    expect(page).not.toContain("send-order-to-trier");
  });

  it("blocks anonymous execution of public command RPCs", () => {
    expect(migration).toContain("revoke all on function public.admin_order_command_overview() from anon");
    expect(migration).toContain("revoke all on function public.admin_set_order_command_enabled(boolean) from anon");
    expect(migration).toContain("revoke all on function public.admin_order_inventory_command(uuid,text,text) from anon");
  });

  it("is wired into admin route and navigation", () => {
    const app=readFileSync("src/App.tsx","utf8");
    const layout=readFileSync("src/pages/admin/AdminLayout.tsx","utf8");
    expect(app).toContain("AdminOrderCommand");
    expect(app).toContain('path="order-command"');
    expect(layout).toContain('/admin/order-command');
  });
});
