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

  it("wires the existing purchase and finance pages into the admin router", () => {
    const app = readFileSync("src/App.tsx", "utf8");

    expect(app).toContain('import("./pages/admin/AdminPurchaseOperations.tsx")');
    expect(app).toContain('import("./pages/admin/AdminAccountsPayable.tsx")');
    expect(app).toContain('import("./pages/admin/AdminReceivablesCashFlow.tsx")');
    expect(app).toContain('import("./pages/admin/AdminSuppliers.tsx")');
    expect(app).toContain('path="compras-operacionais"');
    expect(app).toContain('path="contas-a-pagar"');
    expect(app).toContain('path="contas-a-receber"');
    expect(app).toContain('path="fornecedores"');
  });

  it("uses the shared ERP page shell on operational workspaces", () => {
    for (const path of [
      "src/pages/admin/AdminOrders.tsx",
      "src/pages/admin/AdminStock.tsx",
      "src/pages/admin/products/AdminProductsIntegrated.tsx",
      "src/pages/admin/AdminSmartPurchasing.tsx",
      "src/pages/admin/AdminPurchaseOperations.tsx",
      "src/pages/admin/AdminAccountsPayable.tsx",
      "src/pages/admin/AdminReceivablesCashFlow.tsx",
      "src/pages/admin/AdminSuppliers.tsx",
      "src/pages/admin/AdminCustomers.tsx",
      "src/pages/admin/AdminRegistrations.tsx",
      "src/pages/admin/AdminSellers.tsx",
      "src/pages/admin/AdminUnits.tsx",
      "src/pages/admin/AdminSettings.tsx",
      "src/pages/admin/AdminPayments.tsx",
      "src/pages/admin/AdminWhatsAppAgent.tsx",
      "src/pages/admin/AdminAICatalog.tsx",
      "src/pages/admin/AdminMetaAds.tsx",
      "src/pages/admin/AdminTrier.tsx",
      "src/pages/admin/AdminAudit.tsx",
      "src/pages/admin/AdminDataQuality.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("ErpPage");
      expect(source).toContain("ErpPageHeader");
    }
  });

  it("keeps every sidebar destination backed by an admin route", () => {
    const layout = readFileSync("src/pages/admin/AdminLayout.tsx", "utf8");
    const app = readFileSync("src/App.tsx", "utf8");
    const menu = [...layout.matchAll(/to:\s*"([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path.startsWith("/admin"));
    const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]);

    const unresolved = menu.filter((menuPath) => {
      const relative = menuPath.replace(/^\/admin\/?/, "");
      if (!relative) return false;
      return !routes.some((route) => {
        if (route === relative) return true;
        if (!route.includes(":")) return false;
        const prefix = route.replace(/\/:([^/]+)/g, "");
        return relative.startsWith(prefix);
      });
    });

    expect(unresolved).toEqual([]);
  });

  it("keeps visual work isolated from checkout/payment/order-command implementation", () => {
    const files = [
      "src/pages/admin/AdminLayout.tsx",
      "src/pages/admin/AdminHome.tsx",
      "src/pages/admin/AdminDashboard.tsx",
      "src/pages/admin/AdminOrders.tsx",
      "src/pages/admin/AdminStock.tsx",
      "src/pages/admin/products/AdminProductsIntegrated.tsx",
      "src/pages/admin/AdminSmartPurchasing.tsx",
      "src/pages/admin/AdminPurchaseOperations.tsx",
      "src/pages/admin/AdminAccountsPayable.tsx",
      "src/pages/admin/AdminReceivablesCashFlow.tsx",
    ];

    for (const path of files) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("erp_create_order_with_reservation");
      expect(source).not.toContain("ERP_ORDER_COMMAND_ENABLED");
    }
  });
});
