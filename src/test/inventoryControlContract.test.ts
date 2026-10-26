import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20261025220000_inventory_lots_expiry_losses_counts.sql";
const pagePath = "src/pages/admin/AdminInventoryControl.tsx";

describe("inventory control SQL contract", () => {
  it("creates loss and inventory count audit structures with RLS", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("create table if not exists public.inventory_loss_events");
    expect(sql).toContain("create table if not exists public.inventory_counts");
    expect(sql).toContain("create table if not exists public.inventory_count_items");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("inventory_loss_events_manage_v1");
    expect(sql).toContain("inventory_counts_manage_v1");
  });

  it("uses the internal inventory ledger as the canonical write path", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("insert into public.inventory_ledger");
    expect(sql).toContain("'inventory_count'");
    expect(sql).toContain("'inventory_loss'");
    expect(sql).not.toContain("update public.products set stock");
    expect(sql).not.toContain("trier_");
  });

  it("implements FEFO and expiry risk bands", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("order by expiry_date asc nulls last");
    expect(sql).toContain("'vencido'");
    expect(sql).toContain("'vence_30'");
    expect(sql).toContain("'vence_60'");
    expect(sql).toContain("'vence_90'");
    expect(sql).toContain("'sem_validade'");
  });

  it("prevents loss above available stock or lot balance", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("Quantidade da perda é maior que o saldo do lote");
    expect(sql).toContain("Quantidade da perda é maior que o saldo disponível");
  });

  it("requires every inventory item to be counted before finalization", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("Existem itens sem contagem informada");
    expect(sql).toContain("counted_qty is null");
    expect(sql).toContain("variance_qty");
  });

  it("blocks anonymous execution of inventory control RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const signature of [
      "admin_inventory_control(integer)",
      "record_inventory_loss(uuid,uuid,numeric,text,text)",
      "start_inventory_count(text,text)",
      "finalize_inventory_count(uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from anon`);
    }
  });
});

describe("inventory control admin UI contract", () => {
  it("exposes lots, losses and inventory count workspaces", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain("Lotes e validade");
    expect(source).toContain("Histórico de perdas");
    expect(source).toContain("Inventário físico");
    expect(source).toContain("FEFO");
  });

  it("uses only internal inventory RPCs and never writes to Trier", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain('rpc("admin_inventory_control"');
    expect(source).toContain('rpc("record_inventory_loss"');
    expect(source).toContain('rpc("start_inventory_count"');
    expect(source).toContain('rpc("finalize_inventory_count"');
    expect(source).not.toContain('from("trier');
    expect(source).not.toContain('rpc("trier');
  });

  it("is wired into admin routing and navigation", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const layout = readFileSync("src/pages/admin/AdminLayout.tsx", "utf8");
    expect(app).toContain('AdminInventoryControl');
    expect(app).toContain('path="estoque-controle"');
    expect(layout).toContain('/admin/estoque-controle');
    expect(layout).toContain('Lotes, Validade e Inventário');
  });
});
