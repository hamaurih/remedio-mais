import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, LayoutDashboard, Layers3, LogOut, PlusCircle, ScrollText, ShieldCheck } from "lucide-react";
import { isCustomerDomainBlocked, platformHostLabel } from "./platformHost";

const nav = [
  { to: "/platform", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/platform/empresas", label: "Empresas", icon: Building2 },
  { to: "/platform/empresas/nova", label: "Nova empresa", icon: PlusCircle },
  { to: "/platform/planos", label: "Planos e módulos", icon: Layers3 },
  { to: "/platform/auditoria", label: "Auditoria", icon: ScrollText },
];

export default function PlatformLayout() {
  const { user, loading } = useAuth();
  const membership = useQuery({
    queryKey: ["platform-membership", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("platform_members").select("role,active").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as { role: string; active: boolean } | null;
    },
  });

  if (isCustomerDomainBlocked()) return <Navigate to="/admin" replace />;
  if (loading) return <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Carregando...</div>;
  if (!user) return <Navigate to="/platform/login" replace />;
  if (membership.isLoading) return <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Validando acesso...</div>;
  if (!membership.data?.active) return <div className="min-h-screen bg-slate-950 text-white grid place-items-center p-6"><div className="max-w-lg text-center"><ShieldCheck className="h-12 w-12 mx-auto mb-4" /><h1 className="text-2xl font-bold">Acesso restrito</h1><p className="text-slate-400 mt-2">Sua conta não pertence à administração da plataforma. Administradores das farmácias não têm acesso global às demais empresas.</p><Button variant="secondary" className="mt-6" onClick={()=>supabase.auth.signOut()}>Sair</Button></div></div>;

  return <div className="min-h-screen bg-slate-100 flex text-slate-950">
    <aside className="w-64 shrink-0 bg-slate-950 text-white flex flex-col min-h-screen sticky top-0">
      <div className="p-5 border-b border-slate-800"><div className="h-10 w-10 rounded-xl bg-white text-slate-950 grid place-items-center mb-3"><ShieldCheck className="h-5 w-5" /></div><div className="font-black">Control Plane</div><div className="text-xs text-slate-400 mt-1">{platformHostLabel()}</div><Badge className="mt-3 bg-slate-800 text-slate-200 hover:bg-slate-800">{membership.data.role}</Badge></div>
      <nav className="flex-1 p-3 space-y-1">{nav.map(item=><NavLink key={item.to} to={item.to} end={item.end} className={({isActive})=>`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive?"bg-white text-slate-950":"text-slate-300 hover:bg-slate-900 hover:text-white"}`}><item.icon className="h-4 w-4" />{item.label}</NavLink>)}</nav>
      <div className="p-4 border-t border-slate-800"><div className="text-xs text-slate-500 truncate mb-3">{user.email}</div><Button variant="outline" className="w-full border-slate-700 bg-transparent text-white hover:bg-slate-900 hover:text-white" onClick={()=>supabase.auth.signOut()}><LogOut className="h-4 w-4 mr-2" />Sair</Button></div>
    </aside>
    <main className="flex-1 min-w-0"><Outlet /></main>
  </div>;
}
