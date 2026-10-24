import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("admin ERP layout refresh", () => {
  it("keeps the admin shell responsive and collapsible", () => {
    const layout = readFileSync("src/pages/admin/AdminLayout.tsx", "utf8");

    expect(layout).toContain('from "@/components/ui/sheet"');
    expect(layout).toContain("mobileOpen");
    expect(layout).toContain("collapsed");
    expect(layout).toContain("lg:w-[76px]");
    expect(layout).toContain("lg:w-72");
    expect(layout).toContain("Abrir menu");
    expect(layout).toContain("Recolher menu");
    expect(layout).toContain("NotificationsBell");
  });

  it("organizes the home around operation, finance and structure", () => {
    const home = readFileSync("src/pages/admin/AdminHome.tsx", "utf8");

    expect(home).toContain('title: "Operação"');
    expect(home).toContain('title: "Gestão financeira e suprimentos"');
    expect(home).toContain('title: "Cadastros, estrutura e crescimento"');
    expect(home).toContain("Atenção operacional");
    expect(home).toContain('/admin/contas-a-pagar');
    expect(home).toContain('/admin/contas-a-receber');
  });

  it("keeps the BI dashboard aligned with the shared ERP width", () => {
    const dashboard = readFileSync("src/pages/admin/AdminDashboard.tsx", "utf8");

    expect(dashboard).toContain("max-w-[1480px]");
    expect(dashboard).toContain("BI Executivo");
    expect(dashboard).toContain("rounded-2xl border bg-card");
  });

  it("does not modify checkout or payment source files in this visual branch", () => {
    const layout = readFileSync("src/pages/admin/AdminLayout.tsx", "utf8");
    expect(layout).not.toContain("create-cielo-card");
    expect(layout).not.toContain("erp_create_order_with_reservation");
    expect(layout).not.toContain("send-order-to-trier");
  });
});
