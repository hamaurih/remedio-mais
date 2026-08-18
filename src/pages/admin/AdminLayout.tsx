import { ReactNode, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  FileText,
  Globe2,
  Home,
  LogOut,
  Package,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
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
  { to: "/admin", label: "Início", icon: Home, end: true, roles: ["admin"] },
  { to: "/admin/erp", label: "ERP Farmacêutico", icon: Building2, roles: ["admin"] },
  { to: "/admin/bi", label: "BI Executivo", icon: BarChart3, roles: ["admin"] },
  { to: "/admin/curva-abc", label: "Curva ABC", icon: TrendingUp, roles: ["admin"] },
  { to: "/admin/vendedor", label: "Início", icon: Home, end: true, roles: ["seller"] },
  { to: "/admin/pdv", label: "PDV", icon: CreditCard, roles: ["admin", "seller"] },
  { to: "/admin/pedidos", label: "Vendas e Pedidos", icon: ShoppingBag, roles: ["admin", "seller"] },
  { to: "/admin/estoque", label: "Estoque", icon: Boxes, roles: ["admin"] },
  { to: "/admin/produtos", label: "Produtos e Preços", icon: Package, roles: ["admin"] },
  { to: "/admin/site", label: "Site e E-commerce", icon: Globe2, roles: ["admin"] },
  { to: "/admin/receitas", label: "Receitas", icon: FileText, roles: ["admin", "seller"], requiresPrescriptionPermission: true },
  { to: "/admin/clientes", label: "Clientes", icon: Users, roles: ["admin"] },
  { to: "/admin/config", label: "Configurações", icon: Settings, roles: ["admin"] },
];

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, isAdmin, isSeller, loading } = useAuth();
  const [canAccessPrescriptions, setCanAccessPrescriptions] = useState(false);

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

    return () => { active = false; };
  }, [user?.id, isAdmin, isSeller]);

  if (loading) return <div className="p-10 text-center">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin && !isSeller) return (
    <div className="container py-20 text-center">
      <h1 className="text-2xl font-bold mb-2">Acesso restrito</h1>
      <p className="text-muted-foreground">Sua conta não tem permissão de administrador ou vendedor.</p>
    </div>
  );

  const visible = items.filter((item) => {
    if (item.requiresPrescriptionPermission && !isAdmin && !canAccessPrescriptions) return false;
    if (!item.roles) return isAdmin;
    if (isAdmin) return item.roles.includes("admin");
    if (isSeller) return item.roles.includes("seller");
    return false;
  });

  return (
    <div className="min-h-screen flex bg-muted/20">
      <aside className="w-60 xl:w-64 bg-card border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <NavLink to={isAdmin ? "/admin" : "/admin/vendedor"} className="flex items-center gap-3 rounded-xl">
            <div className="w-10 h-10 bg-gradient-hero rounded-xl flex items-center justify-center text-primary-foreground font-black shadow-sm">A+</div>
            <div className="min-w-0">
              <div className="font-black text-sm leading-tight truncate">Atacadão</div>
              <div className="text-[11px] text-muted-foreground">{isAdmin ? "Gestão administrativa" : "Área do vendedor"}</div>
            </div>
          </NavLink>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Navegação</div>
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/80 hover:bg-accent hover:text-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b bg-card/95 backdrop-blur flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
          <div>
            <div className="font-bold text-sm">{isAdmin ? "Painel Administrativo" : "Área do Vendedor"}</div>
            <div className="text-[11px] text-muted-foreground hidden sm:block">Operação, gestão e e-commerce em um só lugar</div>
          </div>
          <NotificationsBell />
        </header>
        <div className="flex-1 min-w-0">{children || <Outlet />}</div>
      </main>
    </div>
  );
}