import { ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Moon, Sun, ExternalLink, Tags, Megaphone, ShieldCheck, RefreshCw, Activity, BarChart3, Boxes, Building2, ClipboardList, CreditCard, FileText, Globe2, LayoutDashboard, LogOut, Package, Settings, ShoppingBag, UserCog, Users } from "lucide-react";
import { NotificationsBell } from "@/components/admin/NotificationsBell";
import { CieloPendingReconciler } from "@/components/admin/CieloPendingReconciler";

import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { SheetTitle, SheetDescription } from "@/components/ui/sheet";
import "./admin-theme.css";

type Item = { group?: string; to: string; label: string; icon: any; end?: boolean; roles?: Array<"admin" | "seller">; requiresPrescriptionPermission?: boolean };
const items: Item[] = [
  { group: "Dashboard", to: "/admin", label: "Visão geral", icon: LayoutDashboard, end: true, roles: ["admin"] },
  { group: "Dashboard", to: "/admin/bi", label: "BI executivo", icon: Activity, roles: ["admin"] },
  { group: "Dashboard", to: "/admin/vendedor", label: "Minha visão geral", icon: LayoutDashboard, end: true, roles: ["seller"] },
  { group: "Comercial", to: "/admin/pdv", label: "PDV / Caixa", icon: CreditCard, roles: ["admin", "seller"] },
  { group: "Comercial", to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag, roles: ["admin", "seller"] },
  { group: "Comercial", to: "/admin/clientes", label: "Clientes", icon: Users, roles: ["admin"] },
  { group: "Comercial", to: "/admin/vendedores", label: "Vendedores e permissões", icon: UserCog, roles: ["admin"] },
  { group: "Catálogo", to: "/admin/produtos", label: "Produtos e preços", icon: Package, roles: ["admin"] },
  { group: "Catálogo", to: "/admin/categorias", label: "Categorias", icon: Tags, roles: ["admin"] },
  { group: "Catálogo", to: "/admin/taxonomia", label: "Classificação", icon: ClipboardList, roles: ["admin"] },
  { group: "Catálogo", to: "/admin/monitor-precos", label: "Monitor de preços", icon: Activity, roles: ["admin"] },
  { group: "Estoque", to: "/admin/estoque", label: "Estoque e movimentações", icon: Boxes, roles: ["admin"] },
  { group: "Estoque", to: "/admin/compras", label: "Compra inteligente", icon: ClipboardList, roles: ["admin"] },
  { group: "Estoque", to: "/admin/curva-abc", label: "Curva ABC", icon: BarChart3, roles: ["admin"] },
  { group: "Farmácia", to: "/admin/receitas", label: "Receitas e análise", icon: FileText, roles: ["admin", "seller"], requiresPrescriptionPermission: true },
  { group: "Farmácia", to: "/admin/unidades", label: "Unidades e regularização", icon: Building2, roles: ["admin"] },
  { group: "Financeiro", to: "/admin/pagamentos", label: "Pagamentos e conciliação", icon: CreditCard, roles: ["admin"] },
  { group: "Marketing", to: "/admin/campanhas", label: "Campanhas", icon: Megaphone, roles: ["admin"] },
  { group: "Marketing", to: "/admin/ofertas", label: "Ofertas e promoções", icon: Tags, roles: ["admin"] },
  { group: "Marketing", to: "/admin/banners", label: "Banners", icon: Globe2, roles: ["admin"] },
  { group: "Marketing", to: "/admin/site", label: "Gestão do e-commerce", icon: Globe2, roles: ["admin"] },
  { group: "Integrações", to: "/admin/integrations/trier", label: "Trier", icon: RefreshCw, roles: ["admin"] },
  { group: "Integrações", to: "/admin/integrations/meta-ads", label: "Meta Ads", icon: Megaphone, roles: ["admin"] },
  { group: "Integrações", to: "/admin/integrations/whatsapp-agent", label: "Automação WhatsApp", icon: Activity, roles: ["admin"] },
  { group: "Sistema", to: "/admin/auditoria", label: "Auditoria", icon: ShieldCheck, roles: ["admin"] },
  { group: "Sistema", to: "/admin/qualidade-dados", label: "Qualidade dos dados", icon: ClipboardList, roles: ["admin"] },
  { group: "Sistema", to: "/admin/config", label: "Configurações", icon: Settings, roles: ["admin"] },
];

function AdminNavigation({ visible }: { visible: Item[] }) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  return <Sidebar collapsible="icon">
    {isMobile && <><SheetTitle className="sr-only">Menu administrativo</SheetTitle><SheetDescription className="sr-only">Módulos do Atacadão dos Medicamentos</SheetDescription></>}
    <SidebarHeader className="h-20 justify-center border-b">
      <Link to="/admin" aria-label="Atacadão dos Medicamentos — início" className="flex items-center gap-3 overflow-hidden" onClick={() => setOpenMobile(false)}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">A+</span>
        <span className="group-data-[collapsible=icon]:hidden"><span className="block text-sm font-bold">Atacadão</span><span className="block text-xs text-muted-foreground">dos Medicamentos · Gestão</span></span>
      </Link>
    </SidebarHeader>
    <SidebarContent><nav aria-label="Módulos administrativos">
      {[...new Set(visible.map(item => item.group))].map(group => <SidebarGroup key={group}>
        <SidebarGroupLabel className="text-xs uppercase tracking-wider">{group}</SidebarGroupLabel>
        <SidebarMenu>{visible.filter(item => item.group === group).map(item => <SidebarMenuItem key={item.to}>
          <SidebarMenuButton asChild tooltip={item.label} isActive={item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/")} className="h-10 data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
            <NavLink to={item.to} end={item.end} onClick={() => setOpenMobile(false)}><item.icon aria-hidden="true" /><span>{item.label}</span></NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>)}</SidebarMenu>
      </SidebarGroup>)}
    </nav></SidebarContent>
    <SidebarFooter className="border-t"><SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Sair da conta" onClick={() => supabase.auth.signOut()}><LogOut /><span>Sair da conta</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
  </Sidebar>;
}

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("atacadao-admin-theme") === "dark" ? "dark" : "light"; } catch { return "light"; }
  });
  useLayoutEffect(() => {
    const previous = document.body.getAttribute("data-admin-theme");
    document.body.setAttribute("data-admin-theme", theme);
    try { localStorage.setItem("atacadao-admin-theme", theme); } catch { /* Device preferences are optional. */ }
    return () => { if (previous === null) document.body.removeAttribute("data-admin-theme"); else document.body.setAttribute("data-admin-theme", previous); };
  }, [theme]);
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

  const current = [...visible].sort((a, b) => b.to.length - a.to.length).find(item => item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/"));
  return <SidebarProvider className={`admin-shell ${theme === "dark" ? "dark" : ""}`}>
    <CieloPendingReconciler enabled={isAdmin} />
    <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-card focus:p-3">Ir para o conteúdo</a>
    <AdminNavigation visible={visible} />
    <main className="min-w-0 flex-1 bg-background text-foreground">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card px-4 md:px-6">
        <SidebarTrigger aria-label="Abrir ou recolher menu" className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1"><div className="hidden text-xs text-muted-foreground sm:block">{current?.group || "Sistema"}</div><div className="truncate text-sm font-semibold">{current?.label || "Administração"}</div></div>
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to="/"><ExternalLink className="mr-2 h-4 w-4" />Ver loja</Link></Button>
        <Button variant="ghost" size="icon" aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</Button>
        <NotificationsBell />
      </header>
      <div id="admin-content" className="admin-content" tabIndex={-1}>{children || <Outlet />}</div>
    </main>
  </SidebarProvider>;
}
