import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, PlusCircle, Search, Store, Users } from "lucide-react";

export default function PlatformCompanies() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey:["platform-companies"],
    queryFn: async()=>{
      const { data, error } = await (supabase as any).from("platform_tenant_overview").select("*").order("name");
      if(error) throw error;
      return data || [];
    }
  });
  const rows = useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q) return query.data || [];
    return (query.data||[]).filter((r:any)=>[r.name,r.legal_name,r.cnpj,r.contact_email,r.slug].some(v=>String(v||"").toLowerCase().includes(q)));
  },[query.data,search]);

  return <div className="p-6 lg:p-8 max-w-[1500px] mx-auto space-y-6">
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"><div><p className="text-sm font-semibold text-slate-500">Clientes do SaaS</p><h1 className="text-3xl font-black tracking-tight mt-1">Empresas</h1><p className="text-slate-600 mt-2">Cada empresa é um tenant isolado, com Matriz, filiais, usuários, módulos e assinatura próprios.</p></div><Button asChild><Link to="/platform/empresas/nova"><PlusCircle className="h-4 w-4 mr-2" />Nova empresa</Link></Button></div>
    <div className="relative max-w-xl"><Search className="h-4 w-4 absolute left-3 top-3 text-slate-400"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por empresa, CNPJ, e-mail ou slug" className="pl-9"/></div>
    <div className="grid gap-4 xl:grid-cols-2">{query.isLoading?<p className="text-slate-500">Carregando...</p>:rows.map((r:any)=><Link key={r.id} to={`/platform/empresas/${r.id}`}><Card className="rounded-2xl h-full hover:border-slate-400 hover:shadow-md transition"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="h-11 w-11 rounded-xl bg-slate-950 text-white grid place-items-center shrink-0"><Building2 className="h-5 w-5"/></div><div><div className="font-black text-lg">{r.name}</div><div className="text-sm text-slate-500">{r.legal_name || "Razão social não informada"}</div><div className="text-sm text-slate-500 mt-1">{r.cnpj || "CNPJ pendente"}</div></div></div><div className="text-right space-y-1"><Badge>{r.lifecycle_status || "onboarding"}</Badge><div><Badge variant="secondary">{r.plan_name || "Sem plano"}</Badge></div></div></div><div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t text-sm"><div><Store className="h-4 w-4 mb-1 text-slate-500"/><strong>{r.store_count||0}</strong><div className="text-slate-500">Unidades</div></div><div><Users className="h-4 w-4 mb-1 text-slate-500"/><strong>{r.member_count||0}</strong><div className="text-slate-500">Usuários</div></div><div><strong className="block">{r.onboarding_status || "—"}</strong><div className="text-slate-500 mt-1">Onboarding</div></div></div></CardContent></Card></Link>)}{!query.isLoading && rows.length===0 && <p className="text-slate-500">Nenhuma empresa encontrada.</p>}</div>
  </div>;
}
