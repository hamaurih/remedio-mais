import { ReactNode } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Package, Tags, Image as ImageIcon, ShoppingBag, FileText, Settings, LogOut, Tag, Plug, LayoutGrid, Megaphone, CreditCard, Boxes, Users, Activity, Menu as MenuIcon, ShieldAlert, FolderTree } from "lucide-react";

const items = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/produtos", label: "Produtos", icon: Package },
  { to: "/admin/estoque", label: "Estoque", icon: Boxes },
  { to: "/admin/categorias", label: "Categorias", icon: Tags },
  { to: "/admin/taxonomia", label: "Taxonomia", icon: FolderTree },
  { to: "/admin/menus", label: "Menus", icon: MenuIcon },
  { to: "/admin/banners", label: "Banners", icon: ImageIcon },
  { to: "/admin/mosaico", label: "Mosaico Home", icon: LayoutGrid },
  { to: "/admin/promo-banner", label: "Faixa Promo (5 blocos)", icon: Tag },
  { to: "/admin/campanhas", label: "Campanhas", icon: Megaphone },
  { to: "/admin/ofertas", label: "Ofertas", icon: Tag },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard },
  { to: "/admin/receitas", label: "Receitas", icon: FileText },
  { to: "/admin/integrations/trier", label: "Trier Drogarias", icon: Plug },
  { to: "/admin/diagnostico-home", label: "Diagnóstico da Home", icon: Activity },
  { to: "/admin/qualidade-dados", label: "Qualidade de Dados", icon: ShieldAlert },
  { to: "/admin/config", label: "Configurações", icon: Settings },
];

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="p-10 text-center">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return (
    <div className="container py-20 text-center">
      <h1 className="text-2xl font-bold mb-2">Acesso restrito</h1>
      <p className="text-muted-foreground mb-4">Sua conta não tem permissão de administrador.</p>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">Para conceder, vá no painel da Lovable Cloud (Backend → Tabela <code>user_roles</code>) e adicione uma linha com seu user_id e role <code>admin</code>.</p>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-card border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-hero rounded-lg flex items-center justify-center text-primary-foreground font-extrabold">A+</div>
            <div className="font-extrabold text-sm">Admin</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {items.map((it) => (
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
      <main className="flex-1 bg-background">
        {children || <Outlet />}
      </main>
    </div>
  );
}
