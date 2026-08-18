import { ReactNode, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Package, Tags, Image as ImageIcon, ShoppingBag, FileText, Settings, LogOut, Tag, Plug, LayoutGrid, Megaphone, CreditCard, Boxes, Users, Activity, Menu as MenuIcon, ShieldAlert, FolderTree, UserCog, Stethoscope, Archive } from "lucide-react";
import { NotificationsBell } from "@/components/admin/NotificationsBell";

type Item = {
  to: string;
  label: string;
  icon: any;
  end?: boolean;
  roles?: Array<"admin" | "seller">;
  requiresPrescriptionPermission?: boolean;
};

const items: Item[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, roles: ["admin"] },
  { to: "/admin/vendedor", label: "Início", icon: LayoutDashboard, end: true, roles: ["seller"] },
  { to: "/admin/pdv", label: "PDV — Ponto de Venda", icon: CreditCard, roles: ["admin", "seller"] },
  { to: "/admin/pdv/indicadores", label: "PDV — Indicadores", icon: Activity, roles: ["admin", "seller"] },
  { to: "/admin/produtos", label: "Produtos", icon: Package, roles: ["admin"] },
  { to: "/admin/estoque", label: "Estoque", icon: Boxes, roles: ["admin"] },
  { to: "/admin/categorias", label: "Categorias", icon: Tags, roles: ["admin"] },
  { to: "/admin/taxonomia", label: "Taxonomia", icon: FolderTree, roles: ["admin"] },
  { to: "/admin/menus", label: "Menus", icon: MenuIcon, roles: ["admin"] },
  { to: "/admin/banners", label: "Banners", icon: ImageIcon, roles: ["admin"] },
  { to: "/admin/mosaico", label: "Mosaico Home", icon: LayoutGrid, roles: ["admin"] },
  { to: "/admin/layout-home", label: "Layout da Home", icon: LayoutGrid, roles: ["admin"] },
  { to: "/admin/vitrines", label: "Vitrines da Home", icon: LayoutGrid, roles: ["admin"] },
  { to: "/admin/promo-banner", label: "Faixa Promo (5 blocos)", icon: Tag, roles: ["admin"] },
  { to: "/admin/campanhas", label: "Campanhas", icon: Megaphone, roles: ["admin"] },
  { to: "/admin/ofertas", label: "Ofertas", icon: Tag, roles: ["admin"] },
  { to: "/admin/monitor-precos", label: "Preços e Ofertas", icon: Activity, roles: ["admin"] },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag, roles: ["admin", "seller"] },
  { to: "/admin/clientes", label: "Clientes", icon: Users, roles: ["admin"] },
  { to: "/admin/vendedores", label: "Vendedores", icon: UserCog, roles: ["admin"] },
  { to: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard, roles: ["admin"] },
  { to: "/admin/receitas", label: "Receitas", icon: FileText, roles: ["admin", "seller"], requiresPrescriptionPermission: true },
  { to: "/admin/integrations/trier", label: "Trier Drogarias", icon: Plug, roles: ["admin"] },
  { to: "/admin/trier/vendas-ecommerce", label: "Trier — Vendas E-commerce", icon: ShoppingBag, roles: ["admin"] },
  { to: "/admin/integrations/whatsapp-agent", label: "Agente WhatsApp", icon: Plug, roles: ["admin"] },
  { to: "/admin/integrations/meta-ads", label: "Meta Ads (Pixel + CAPI)", icon: Megaphone, roles: ["admin"] },

  { to: "/admin/auditoria", label: "Auditoria do Site", icon: Stethoscope, roles: ["admin"] },
  { to: "/admin/diagnostico-home", label: "Diagnóstico da Home", icon: Activity, roles: ["admin"] },
  { to: "/admin/qualidade-dados", label: "Qualidade de Dados", icon: ShieldAlert, roles: ["admin"] },
  { to: "/admin/arquivar-produtos", label: "Arquivar Produtos", icon: Archive, roles: ["admin"] },
  { to: "/admin/config", label: "Configurações", icon: Settings, roles: ["admin"] },
];

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, isAdmin, isSeller, loading } = useAuth();
  const [canViewPrescriptions, setCanViewPrescriptions] = useState(false);

  useEffect(() => {
    let active = true;

    if (!user?.id || isAdmin || !isSeller) {
      setCanViewPrescriptions(false);
      return;
    }

    (supabase as any)
      .from("seller_permissions")
      .select("can_view_prescriptions")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (active) setCanViewPrescriptions(Boolean(data?.can_view_prescriptions));
      });

    return () => {
      active = false;
    };
  }, [user?.id, isAdmin, isSeller]);

  if (loading) return <div className="p-10 text-center">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin && !isSeller) return (
    <div className="container py-20 text-center">
      <h1 className="text-2xl font-bold mb-2">Acesso restrito</h1>
      <p className="text-muted-foreground mb-4">Sua conta não tem permissão de administrador ou vendedor.</p>
    </div>
  );

  const visible = items.filter((it) => {
    if (it.requiresPrescriptionPermission && !isAdmin && !canViewPrescriptions) return false;
    if (!it.roles) return isAdmin;
    if (isAdmin) return it.roles.includes("admin");
    if (isSeller) return it.roles.includes("seller");
    return false;
  });

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-card border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-hero rounded-lg flex items-center justify-center text-primary-foreground font-extrabold">A+</div>
            <div className="font-extrabold text-sm">{isAdmin ? "Admin" : "Vendedor"}</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {visible.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`
              }
            >
              <it.icon className="h-4 w-4" /> {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          <Button variant="outline" size="sm" className="w-full" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 bg-background flex flex-col">
        <header className="h-12 border-b bg-card flex items-center justify-end px-3 gap-2">
          <NotificationsBell />
        </header>
        <div className="flex-1">{children || <Outlet />}</div>
      </main>
    </div>
  );
}
