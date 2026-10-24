import { ReactNode, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Globe2,
  HardDriveDownload,
  LayoutDashboard,
  Layers3,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  UserCog,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { NotificationsBell } from "@/components/admin/NotificationsBell";
import { CieloPendingReconciler } from "@/components/admin/CieloPendingReconciler";

type Role = "admin" | "seller";
type Item = {
  to: string;
  label: string;
  icon: any;
  group: string;
  end?: boolean;
  roles?: Role[];
  requiresPrescriptionPermission?: boolean;
};

const items: Item[] = [
  { to: "/admin", label: "Início", icon: LayoutDashboard, group: "Visão Geral", end: true, roles: ["admin"] },
  { to: "/admin/bi", label: "BI Executivo", icon: Activity, group: "Visão Geral", roles: ["admin"] },
  { to: "/admin/curva-abc", label: "Curva ABC", icon: BarChart3, group: "Visão Geral", roles: ["admin"] },
  { to: "/admin/vendedor", label: "Início", icon: LayoutDashboard, group: "Vendas", end: true, roles: ["seller"] },

  { to: "/admin/pdv", label: "PDV e Balcão", icon: CreditCard, group: "Vendas", roles: ["admin", "seller"] },
  { to: "/admin/pedidos", label: "Vendas e Pedidos", icon: ShoppingBag, group: "Vendas", roles: ["admin", "seller"] },
  { to: "/admin/ia-vendas", label: "Vendas via WhatsApp/IA", icon: Bot, group: "Vendas", roles: ["admin", "seller"] },
  { to: "/admin/funil-carrinhos", label: "Funil e Carrinhos", icon: Activity, group: "Vendas", roles: ["admin"] },
  { to: "/admin/receitas", label: "Receitas", icon: FileText, group: "Vendas", roles: ["admin", "seller"], requiresPrescriptionPermission: true },

  { to: "/admin/compras", label: "Compra inteligente", icon: ClipboardList, group: "Compras e Suprimentos", roles: ["admin"] },
  { to: "/admin/compras-operacionais", label: "Pedidos e Recebimentos", icon: Package, group: "Compras e Suprimentos", roles: ["admin"] },
  { to: "/admin/fornecedores", label: "Fornecedores", icon: Truck, group: "Compras e Suprimentos", roles: ["admin"] },

  { to: "/admin/estoque", label: "Estoque", icon: Boxes, group: "Estoque", roles: ["admin"] },

  { to: "/admin/contas-a-pagar", label: "Contas a Pagar", icon: WalletCards, group: "Financeiro", roles: ["admin"] },
  { to: "/admin/contas-a-receber", label: "Contas a Receber e Caixa", icon: WalletCards, group: "Financeiro", roles: ["admin"] },

  { to: "/admin/produtos", label: "Produtos e Preços", icon: Package, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/taxonomia", label: "Grupos e Subgrupos", icon: Layers3, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/unidades", label: "Matriz e Filiais", icon: Building2, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/clientes", label: "Clientes", icon: Users, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/cadastros", label: "Cadastros do Site", icon: UserPlus, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/vendedores", label: "Vendedores", icon: UserCog, group: "Cadastros", roles: ["admin"] },

  { to: "/admin/site", label: "Site e E-commerce", icon: Globe2, group: "Integrações", roles: ["admin"] },
  { to: "/admin/catalogo-ia", label: "Catálogo da IA", icon: Boxes, group: "Integrações", roles: ["admin"] },
  { to: "/admin/pagamentos", label: "Cielo e Pagamentos", icon: CreditCard, group: "Integrações", roles: ["admin"] },
  { to: "/admin/integrations/trier", label: "Trier", icon: Truck, group: "Integrações", roles: ["admin"] },
  { to: "/admin/integrations/whatsapp-agent", label: "Agente WhatsApp", icon: Bot, group: "Integrações", roles: ["admin"] },
  { to: "/admin/integrations/meta-ads", label: "Meta Ads", icon: Activity, group: "Integrações", roles: ["admin"] },

  { to: "/admin/config", label: "Configurações", icon: Settings, group: "Administração e Segurança", roles: ["admin"] },
  { to: "/admin/backups", label: "Backup e Recuperação", icon: HardDriveDownload, group: "Administração e Segurança", roles: ["admin"] },
];

const groupOrder = [
  "Visão Geral",
  "Vendas",
  "Compras e Suprimentos",
  "Estoque",
  "Financeiro",
  "Cadastros",
  "Integrações",
  "Administração e Segurança",
];

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const qc = useQueryClient();
  const location = useLocation();
  const { user, isAdmin, isSeller, loading } = useAuth();
  const [canAccessPrescriptions, setCanAccessPrescriptions] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    qc.removeQueries({ queryKey: ["home_banners"], exact: true });
  }, [qc]);

  useEffect(() => {
    let active = true;
    if (!user?.id || isAdmin || !isSeller) {
      setCanAccessPrescriptions(false);
      return;
    }
    (supabase as any)
      .from("seller_permissions")
      .select("can_view_prescriptions,can_approve_prescriptions")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (active) {
          setCanAccessPrescriptions(Boolean(data?.can_view_prescriptions || data?.can_approve_prescriptions));
        }
      });
    return () => {
      active = false;
    };
  }, [user?.id, isAdmin, isSeller]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-muted/20 text-sm text-muted-foreground">Carregando painel...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin && !isSeller) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Acesso restrito</h1>
        <p className="text-muted-foreground">Sua conta não tem permissão de administrador ou vendedor.</p>
      </div>
    );
  }

  const visible = items.filter((item) => {
    if (item.requiresPrescriptionPermission && !isAdmin && !canAccessPrescriptions) return false;
    if (isAdmin) return item.roles?.includes("admin");
    if (isSeller) return item.roles?.includes("seller");
    return false;
  });

  const visibleGroups = groupOrder
    .map((group) => ({ group, items: visible.filter((item) => item.group === group) }))
    .filter((section) => section.items.length);

  const currentItem = [...visible]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));

  const pageTitle = currentItem?.label || (isAdmin ? "Administração" : "Vendedor");
  const pageGroup = currentItem?.group || "Painel";

  const renderNav = (mobile = false) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-4">
      <div className="space-y-5">
        {visibleGroups.map((section) => (
          <div key={section.group}>
            {!collapsed || mobile ? (
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/80">
                {section.group}
              </div>
            ) : (
              <div className="mx-auto mb-2 h-px w-8 bg-border" />
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => mobile && setMobileOpen(false)}
                    title={collapsed && !mobile ? item.label : undefined}
                    className={({ isActive }) =>
                      [
                        "group flex items-center rounded-xl text-sm font-medium transition-all",
                        collapsed && !mobile ? "h-10 justify-center px-2" : "min-h-10 gap-3 px-3",
                        isActive
                          ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 shadow-sm"
                          : "text-foreground/75 hover:bg-accent/70 hover:text-foreground",
                      ].join(" ")
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
                return mobile ? <SheetClose asChild key={item.to}>{link}</SheetClose> : link;
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );

  const renderBrand = (mobile = false) => (
    <div className="flex h-16 items-center gap-3 border-b px-3.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-sm">
        A+
      </div>
      {(!collapsed || mobile) && (
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">{isAdmin ? "ERP Administrativo" : "Painel do Vendedor"}</div>
          <div className="truncate text-[11px] text-muted-foreground">Atacadão dos Medicamentos</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20 lg:flex">
      <CieloPendingReconciler enabled={isAdmin} />

      <aside
        className={[
          "hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:flex-col border-r bg-card transition-[width] duration-200",
          collapsed ? "lg:w-[76px]" : "lg:w-72",
        ].join(" ")}
      >
        {renderBrand()}
        {renderNav()}
        <div className="border-t p-2.5">
          <Button
            variant="ghost"
            size="sm"
            className={collapsed ? "w-full px-0" : "w-full justify-start"}
            onClick={() => supabase.auth.signOut()}
            title={collapsed ? "Sair" : undefined}
          >
            <LogOut className={collapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
            {!collapsed && "Sair"}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:px-5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </Button>
            <SheetContent side="left" className="w-[88vw] max-w-[320px] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu administrativo</SheetTitle>
              </SheetHeader>
              <div className="flex h-full flex-col">
                {renderBrand(true)}
                {renderNav(true)}
                <div className="border-t p-3">
                  <Button variant="outline" className="w-full justify-start" onClick={() => supabase.auth.signOut()}>
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold leading-tight md:text-base">{pageTitle}</div>
            <div className="truncate text-[11px] text-muted-foreground">{pageGroup}</div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:flex">
            <Store className="h-3.5 w-3.5 text-primary" />
            {isAdmin ? "Administrador" : "Vendedor"}
          </div>
          <NotificationsBell />
        </header>

        <div className="min-h-[calc(100vh-4rem)]">{children || <Outlet />}</div>
      </main>
    </div>
  );
}
