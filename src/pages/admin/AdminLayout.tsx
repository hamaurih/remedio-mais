import { ReactNode, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Activity, BarChart3, Bot, Boxes, Building2, ClipboardList, CreditCard, FileText, Globe2, HardDriveDownload, LayoutDashboard, Layers3, LogOut, Package, Settings, ShoppingBag, Truck, UserCog, UserPlus, Users, WalletCards } from "lucide-react";
import { NotificationsBell } from "@/components/admin/NotificationsBell";
import { CieloPendingReconciler } from "@/components/admin/CieloPendingReconciler";

type Item = { to: string; label: string; icon: any; group: string; end?: boolean; roles?: Array<"admin" | "seller">; requiresPrescriptionPermission?: boolean };
const items: Item[] = [
  { to: "/admin", label: "Início", icon: LayoutDashboard, group: "Visão Geral", end: true, roles: ["admin"] },
  { to: "/admin/bi", label: "BI Executivo", icon: Activity, group: "Visão Geral", roles: ["admin"] },
  { to: "/admin/curva-abc", label: "Curva ABC", icon: BarChart3, group: "Visão Geral", roles: ["admin"] },
  { to: "/admin/vendedor", label: "Início", icon: LayoutDashboard, group: "Vendas", end: true, roles: ["seller"] },

  { to: "/admin/pdv", label: "PDV e Balcão", icon: CreditCard, group: "Vendas", roles: ["admin", "seller"] },
  { to: "/admin/pedidos", label: "Vendas e Pedidos", icon: ShoppingBag, group: "Vendas", roles: ["admin", "seller"] },
  { to: "/admin/ia-vendas", label: "Vendas via WhatsApp/IA", icon: Bot, group: "Vendas", roles: ["admin", "seller"] },
  { to: "/admin/receitas", label: "Receitas", icon: FileText, group: "Vendas", roles: ["admin", "seller"], requiresPrescriptionPermission: true },

  { to: "/admin/compras", label: "Compra inteligente", icon: ClipboardList, group: "Compras e Suprimentos", roles: ["admin"] },
  { to: "/admin/compras-operacionais", label: "Pedidos e Recebimentos", icon: Package, group: "Compras e Suprimentos", roles: ["admin"] },
  { to: "/admin/fornecedores", label: "Fornecedores", icon: Truck, group: "Compras e Suprimentos", roles: ["admin"] },
  { to: "/admin/contas-a-pagar", label: "Contas a Pagar", icon: WalletCards, group: "Financeiro", roles: ["admin"] },

  { to: "/admin/estoque", label: "Estoque", icon: Boxes, group: "Estoque", roles: ["admin"] },

  { to: "/admin/produtos", label: "Produtos e Preços", icon: Package, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/taxonomia", label: "Grupos e Subgrupos", icon: Layers3, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/unidades", label: "Matriz e Filiais", icon: Building2, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/clientes", label: "Clientes", icon: Users, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/cadastros", label: "Cadastros do Site", icon: UserPlus, group: "Cadastros", roles: ["admin"] },
  { to: "/admin/vendedores", label: "Vendedores", icon: UserCog, group: "Cadastros", roles: ["admin"] },

  { to: "/admin/site", label: "Site e E-commerce", icon: Globe2, group: "Integrações", roles: ["admin"] },
  { to: "/admin/pagamentos", label: "Cielo e Pagamentos", icon: CreditCard, group: "Integrações", roles: ["admin"] },
  { to: "/admin/integrations/trier", label: "Trier", icon: Truck, group: "Integrações", roles: ["admin"] },
  { to: "/admin/integrations/whatsapp-agent", label: "Agente WhatsApp", icon: Bot, group: "Integrações", roles: ["admin"] },
  { to: "/admin/integrations/meta-ads", label: "Meta Ads", icon: Activity, group: "Integrações", roles: ["admin"] },

  { to: "/admin/config", label: "Configurações", icon: Settings, group: "Administração e Segurança", roles: ["admin"] },
  { to: "/admin/backups", label: "Backup e Recuperação", icon: HardDriveDownload, group: "Administração e Segurança", roles: ["admin"] },
];

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const qc = useQueryClient();
  const { user, isAdmin, isSeller, loading } = useAuth();
  const [canAccessPrescriptions, setCanAccessPrescriptions] = useState(false);

  // A home e o admin compartilham o mesmo QueryClient. Ao entrar no admin,
  // descartamos o snapshot de banners da home para que uma edição nunca seja
  // seguida por um primeiro frame antigo ao retornar para a loja.
  useEffect(() => {
    qc.removeQueries({ queryKey: ["home_banners"], exact: true });
  }, [qc]);

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
  const groupOrder = ["Visão Geral", "Vendas", "Compras e Suprimentos", "Estoque", "Financeiro", "Cadastros", "Integrações", "Administração e Segurança"];
  const visibleGroups = groupOrder.map(group => ({ group, items: visible.filter(item => item.group === group) })).filter(section => section.items.length);

  return <div className="min-h-screen flex">
    <CieloPendingReconciler enabled={isAdmin} />
    <aside className="w-60 bg-card border-r flex flex-col">
      <div className="p-4 border-b"><div className="flex items-center gap-2"><div className="w-9 h-9 bg-gradient-hero rounded-lg flex items-center justify-center text-primary-foreground font-extrabold">A+</div><div><div className="font-extrabold text-sm">{isAdmin ? "Administração" : "Vendedor"}</div><div className="text-[11px] text-muted-foreground">Atacadão dos Medicamentos</div></div></div></div>
      <nav className="flex-1 p-2 overflow-y-auto">{visibleGroups.map(section => <div key={section.group} className="mb-4"><div className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{section.group}</div><div className="space-y-1">{section.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}><item.icon className="h-4 w-4" /> {item.label}</NavLink>)}</div></div>)}</nav>
      <div className="p-3 border-t"><Button variant="outline" size="sm" className="w-full" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4 mr-2" /> Sair</Button></div>
    </aside>
    <main className="flex-1 bg-background flex flex-col min-w-0"><header className="h-12 border-b bg-card flex items-center justify-end px-3"><NotificationsBell /></header><div className="flex-1">{children || <Outlet />}</div></main>
  </div>;
}
