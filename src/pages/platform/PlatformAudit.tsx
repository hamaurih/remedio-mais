import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

export default function PlatformAudit(){
  const q=useQuery({queryKey:["platform-audit"],queryFn:async()=>{const {data,error}=await (supabase as any).from("platform_audit_log").select("id,action,target_type,target_id,tenant_id,details,created_at").order("created_at",{ascending:false}).limit(200);if(error)throw error;return data||[];}});
  return <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6"><div><p className="text-sm font-semibold text-slate-500">Governança</p><h1 className="text-3xl font-black mt-1">Auditoria da plataforma</h1><p className="text-slate-600 mt-2">Trilha imutável das ações administrativas de maior impacto no SaaS.</p></div><Card className="rounded-2xl"><CardContent className="p-0 divide-y">{q.isLoading?<p className="p-5 text-slate-500">Carregando...</p>:(q.data||[]).map((r:any)=><div key={r.id} className="p-4 flex items-start gap-3"><div className="h-9 w-9 rounded-lg bg-slate-950 text-white grid place-items-center shrink-0"><ScrollText className="h-4 w-4"/></div><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{r.action}</strong><Badge variant="secondary">{r.target_type}</Badge></div><div className="text-xs text-slate-500 mt-1">{new Date(r.created_at).toLocaleString("pt-BR")}</div><pre className="text-xs bg-slate-50 border rounded-lg p-2 mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify(r.details||{},null,2)}</pre></div></div>)}{!q.isLoading&&!q.data?.length&&<p className="p-5 text-slate-500">Nenhum evento registrado.</p>}</CardContent></Card></div>;
}
