import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, PlusCircle, Store, Users, Activity, ArrowRight } from "lucide-react";

function statusLabel(status?: string | null) {
  const map: Record<string,string> = { active:"Ativa", onboarding:"Implantação", trial:"Teste", suspended:"Suspensa", cancelled:"Cancelada" };
  return map[status || ""] || status || "—";
}

export default function PlatformDashboard() {
  const overview = useQuery({
    queryKey: ["platform-dashboard"],
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db.from("platform_tenant_overview").select("*").order("created_at", { ascending:false });
      if (error) throw error;
      const rows = data || [];
      return {
        rows,
        companies: rows.length,
        active: rows.filter((r:any)=>r.lifecycle_status === "active").length,
        onboarding: rows.filter((r:any)=>["onboarding","trial"].includes(r.lifecycle_status)).length,
        stores: rows.reduce((s:number,r:any)=>s+Number(r.store_count||0),0),
        members: rows.reduce((s:number,r:any)=>s+Number(r.member_count||0),0),
      };
    },
    refetchInterval: 60_000,
  });
  const d = overview.data;

  return <div className="p-6 lg:p-8 max-w-[1500px] mx-auto space-y-8">
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"><div><p className="text-sm font-semibold text-slate-500">Administração da plataforma</p><h1 className="text-3xl font-black tracking-tight mt-1">Visão geral do SaaS</h1><p className="text-slate-600 mt-2">Empresas, unidades, usuários e estágio de implantação em uma única visão.</p></div><Button asChild><Link to="/platform/empresas/nova"><PlusCircle className="h-4 w-4 mr-2" />Cadastrar empresa</Link></Button></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi title="Empresas" value={d?.companies ?? "—"} icon={Building2} />
      <Kpi title="Ativas" value={d?.active ?? "—"} icon={Activity} />
      <Kpi title="Em implantação" value={d?.onboarding ?? "—"} icon={Activity} />
      <Kpi title="Unidades" value={d?.stores ?? "—"} icon={Store} />
      <Kpi title="Usuários vinculados" value={d?.members ?? "—"} icon={Users} />
    </div>

    <Card className="rounded-2xl"><CardHeader className="flex-row items-center justify-between"><CardTitle>Empresas recentes</CardTitle><Button variant="outline" asChild><Link to="/platform/empresas">Ver todas</Link></Button></CardHeader><CardContent className="space-y-3">{overview.isLoading ? <p className="text-sm text-slate-500">Carregando...</p> : (d?.rows || []).slice(0,8).map((row:any)=><Link key={row.id} to={`/platform/empresas/${row.id}`} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 rounded-xl border hover:border-slate-400 hover:bg-slate-50 transition"><div><div className="font-bold">{row.name}</div><div className="text-sm text-slate-500">{row.cnpj || "CNPJ não informado"} · {row.store_count} unidade(s) · {row.member_count} usuário(s)</div></div><div className="flex items-center gap-2"><Badge variant="secondary">{row.plan_name || "Sem plano"}</Badge><Badge>{statusLabel(row.lifecycle_status)}</Badge><ArrowRight className="h-4 w-4 text-slate-400" /></div></Link>)}{!overview.isLoading && !d?.rows?.length && <p className="text-sm text-slate-500">Nenhuma empresa cadastrada.</p>}</CardContent></Card>
  </div>;
}

function Kpi({title,value,icon:Icon}:{title:string;value:any;icon:any}) { return <Card className="rounded-2xl"><CardContent className="p-5"><div className="h-10 w-10 rounded-xl bg-slate-950 text-white grid place-items-center"><Icon className="h-5 w-5" /></div><div className="text-3xl font-black mt-5">{value}</div><div className="text-sm text-slate-500 mt-1">{title}</div></CardContent></Card>; }
