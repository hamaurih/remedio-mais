import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CRM_KANBAN_COLUMNS, canMoveCrmOpportunity, canMoveCrmTo, kanbanColumnOf, type KanbanOpportunity } from "@/lib/crmKanban";

const base: KanbanOpportunity = {
  opportunity_id: "opp", stage: "cart", status: "open",
  current_channel: "site", value: 35, order_id: null,
};
describe("Kanban CRM — guardas comerciais", () => {
  it("reúne estágios existentes sem inventar evolução operacional", () => {
    expect(CRM_KANBAN_COLUMNS.map(column => column.id)).toContain("processing");
    expect(CRM_KANBAN_COLUMNS.map(column => column.id)).toContain("cancelled");
    expect(kanbanColumnOf({ ...base, stage: "checkout", status: "lost" })).toBe("lost");
  });
  it("permite somente reclassificação comercial em oportunidades abertas e sem pedido", () => {
    expect(canMoveCrmOpportunity(base)).toBe(true);
    expect(canMoveCrmTo(base, "quote")).toBe(true);
    for (const next of ["cart","checkout","payment","order","processing","won","lost","cancelled"]) {
      expect(canMoveCrmTo(base, next)).toBe(false);
    }
    expect(canMoveCrmTo({ ...base, stage: "quote" }, "quote")).toBe(false);
  });
  it("bloqueia oportunidades vinculadas ao pedido, encerradas ou em etapas técnicas", () => {
    expect(canMoveCrmOpportunity({ ...base, order_id: "order" })).toBe(false);
    expect(canMoveCrmOpportunity({ ...base, status: "won" })).toBe(false);
    expect(canMoveCrmOpportunity({ ...base, stage: "checkout" })).toBe(false);
    expect(canMoveCrmOpportunity({ ...base, stage: "processing" })).toBe(false);
  });
  it("não reclassifica estado desconhecido como venda ou contato novo", () => {
    expect(kanbanColumnOf({ ...base, stage: "unexpected_state" })).toBe("unknown");
  });
});
describe("Migração CRM Kanban — limites de segurança", () => {
  const migration = readFileSync("supabase/migrations/20261031195000_crm_kanban_safe_moves.sql","utf8");
  it("usa função privada autorizada e não concede acesso anônimo", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("app_security.has_role(auth.uid(),'admin'::public.app_role)");
    expect(migration).toContain("tenant_id=v_tenant_id");
    expect(migration).toContain("for update");
    expect(migration).toContain("stage_conflict_refresh");
    expect(migration).toContain("from anon");
  });
  it("preserva origem operacional de pedidos, estoque e pagamento", () => {
    expect(migration).toContain("v_row.order_id is not null");
    expect(migration).toContain("system_managed_stage");
    expect(migration).not.toMatch(/update\s+public\.(orders|products|payments)/i);
  });
});
