import { ReactNode, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Activity, BarChart3, Boxes, CreditCard, FileText, Globe2, LayoutDashboard, LogOut, Package, Settings, ShoppingBag, Users } from "lucide-react";
import { NotificationsBell } from "@/components/admin/NotificationsBell";
import { CieloPendingReconciler } from "@/components/admin/CieloPendingReconciler";

type Item = { to: string; label: string; icon: any; end?: boolean; roles?: Array<"admin" | "seller">; requiresPrescriptionPermission?: boolean };
const items: Item[] = [
  { to: "/admin", label: "Início", icon: LayoutDashboard, end: true, roles: ["admin"] },
  { to: "/admin/bi", label: "BI Executivo", icon: Activity, roles: ["admin"] },
  { to: "/admin/curva-abc", label: "Curva ABC", icon: BarChart3, roles: ["admin"] },
  { to: "/admin/vendedor", label: "Início", icon: LayoutDashboard, end: true, roles: ["seller"] },
  { to: "/admin/pdv", label: "PDV", icon: CreditCard, roles: ["admin", "seller"] },
  { to: "/admin/pedidos", label: "Vendas e Pedidos", icon: ShoppingBag, roles: ["admin", "seller"] },
  { to: "/admin/estoque", label: "Estoque", icon: Boxes, roles: ["admin"] },
  { to: "/admin/produtos", label: "Produtos e Preços", icon: Package, roles: ["admin"] },
  { to: "/admin/site", label: "Site e E-commerce", icon: Globe2, roles: ["admin"] },
  { to: "/admin/receitas", label: "Receitas", icon: FileText, roles: ["admin", "seller"], requiresPrescriptionPermission: true },
  { to: "/admin/clientes", label: "Clientes", icon: Users, roles: ["admin"] },
  { to: "/admin/vendedores", label: "Vendedores", icon: UserCog, roles: ["admin"] },
  { to: "/admin/config", label: "Configurações", icon: Settings, roles: ["admin"] },
];

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, isAdmin, isSeller, loading } = useAuth();
  const [canAccessPrescriptions, setCanAccessPrescriptions] = useState(false);
  useEffect(() => {
    let active = true;
    if (!user?.id || isAdmin || !isSeller) { setCanAccessPrescriptions(false); return; }
    (supabase as any).from("seller_permissions").select("can_view_prescriptions,can_approve_prescriptions").eq("user_id", user.id).maybeSingle().then(({ data }: { data: any }) => {
      if (active) setCanAccessPrescriptions(Boolean(data?.can_view_prescriptions || data?.can_approve_prescriptions));
    });
    return () => { active = false; };
  }, [user?.id, isAdmin, isSeller]);

  if (loading) return <div className="p-10 text-center">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin && !isSeller) return <div className="container py-20 text-center"><h1 className="text-2xl font-bold mb-2">Acesso restrito</h1><p className="text-muted-foreground">Sua conta não tem permissão de administrador ou vendedor.</p></div>;

  const visible = items.filter(item => {
    if (item.requiresPrescriptionPermission && !isAdmin && !canAccessPrescriptions) return false;
    if (isAdmin) return item.roles?.includes("admin");
    if (isSeller) return item.roles?.includes("seller");
    return false;
  });

  return <div className="min-h-screen flex">
    <CieloPendingReconciler enabled={isAdmin} />
    <aside className="w-60 bg-card border-r flex flex-col">
      <div className="p-4 border-b"><div className="flex items-center gap-2"><div className="w-9 h-9 bg-gradient-hero rounded-lg flex items-center justify-center text-primary-foreground font-extrabold">A+</div><div><div className="font-extrabold text-sm">{isAdmin ? "Administração" : "Vendedor"}</div><div className="text-[11px] text-muted-foreground">Atacadão dos Medicamentos</div></div></div></div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">{visible.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}><item.icon className="h-4 w-4" /> {item.label}</NavLink>)}</nav>
      <div className="p-3 border-t"><Button variant="outline" size="sm" className="w-full" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4 mr-2" /> Sair</Button></div>
    </aside>
    <main className="flex-1 bg-background flex flex-col min-w-0"><header className="h-12 border-b bg-card flex items-center justify-end px-3"><NotificationsBell /></header><div className="flex-1">{children || <Outlet />}</div></main>
  </div>;
}
