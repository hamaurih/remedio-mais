import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261031184500_crm_omnichannel_phase1.sql","utf8");
const page = readFileSync("src/pages/admin/AdminCRM.tsx","utf8");
const app = readFileSync("src/App.tsx","utf8");
const layout = readFileSync("src/pages/admin/AdminLayout.tsx","utf8");
const customers = readFileSync("src/pages/admin/AdminCustomers.tsx","utf8");

describe("CRM omnichannel phase 1 database contract", () => {
  it("creates canonical contacts, identities, opportunities, events and external inbox", () => {
    expect(migration).toContain("create table if not exists public.crm_contacts");
    expect(migration).toContain("create table if not exists public.crm_contact_identities");
    expect(migration).toContain("create table if not exists public.crm_opportunities");
    expect(migration).toContain("create table if not exists public.crm_events");
    expect(migration).toContain("create table if not exists public.crm_external_inbox");
  });

  it("keeps CRM admin-only with RLS", () => {
    for (const table of ["crm_contacts","crm_contact_identities","crm_opportunities","crm_events","crm_external_inbox"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("app_security.has_role(auth.uid(),'admin'::public.app_role)");
    expect(migration).toContain("grant select on public.crm_contacts");
  });

  it("reuses a cart opportunity when the order is created", () => {
    expect(migration).toContain("o.order_id=v_order.id");
    expect(migration).toContain("o.cart_session_id=v_order.cart_session_id");
    expect(migration).toContain("order_id=v_order.id");
    expect(migration).toContain("update public.crm_events");
  });

  it("captures site funnel and order lifecycle without changing transactional entities", () => {
    expect(migration).toContain("cart_started");
    expect(migration).toContain("checkout_started");
    expect(migration).toContain("payment_attempted");
    expect(migration).toContain("purchase_completed");
    expect(migration).toContain("order_created");
    expect(migration).toContain("payment_status_changed");
    expect(migration).toContain("fulfillment_status_changed");
    expect(migration).not.toContain("update public.orders set");
    expect(migration).not.toContain("update public.products set");
  });

  it("prepares A&S external ingestion without activating transport", () => {
    expect(migration).toContain("crm_external_inbox");
    expect(migration).not.toContain("http_post");
    expect(migration).not.toContain("pg_net");
    expect(migration).not.toContain("fetch(");
  });

  it("does not touch Trier", () => {
    expect(migration.toLowerCase()).not.toContain("trier");
  });

  it("provides server-side overview, filters and full timeline RPCs", () => {
    expect(migration).toContain("admin_crm_overview");
    expect(migration).toContain("admin_crm_opportunity_list");
    expect(migration).toContain("admin_crm_timeline");
    expect(migration).toContain("count(*) over()");
  });
});

describe("CRM omnichannel ERP UI contract", () => {
  it("has a dedicated admin route and menu", () => {
    expect(app).toContain("AdminCRM");
    expect(app).toContain('path="crm"');
    expect(layout).toContain('/admin/crm');
    expect(layout).toContain("CRM Omnichannel");
  });

  it("uses server-side CRM queries instead of the old 50-order preview", () => {
    expect(page).toContain('rpc("admin_crm_overview"');
    expect(page).toContain('rpc("admin_crm_opportunity_list"');
    expect(page).toContain('rpc("admin_crm_timeline"');
    expect(page).toContain("Busca e filtros executados no banco");
    expect(customers).not.toContain("UnifiedCrmPanel");
  });

  it("shows the channels needed for the real customer journey", () => {
    expect(page).toContain("Site");
    expect(page).toContain("WhatsApp / IA");
    expect(page).toContain("Balcão / PDV");
    expect(page).toContain("Vendedor");
    expect(page).toContain("Telefone");
  });

  it("shows journey milestones", () => {
    expect(page).toContain("Adicionou produto ao carrinho");
    expect(page).toContain("Iniciou checkout");
    expect(page).toContain("Iniciou pagamento");
    expect(page).toContain("Pedido criado");
    expect(page).toContain("Compra concluída");
    expect(page).toContain("Atendimento iniciado");
    expect(page).toContain("Transferido para atendimento humano");
  });
});
