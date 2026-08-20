import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Building2, CheckCircle2, Circle, Store, Users, ShieldCheck, Mail } from "lucide-react";

export default function PlatformCompanyDetail(){
  const { tenantId } = useParams();
  const qc=useQueryClient();
  const detail=useQuery({queryKey:["platform-company",tenantId],enabled:!!tenantId,queryFn:async()=>{
    const db=supabase as any;
    const [overview,stores,onboarding,invites,plans,modules,planModules,overrides]=await Promise.all([
      db.from("platform_tenant_overview").select("*").eq("id",tenantId).maybeSingle(),
      db.from("stores").select("id,name,code,cnpj,active,is_headquarters,operation_status,address").eq("tenant_id",tenantId).order("is_headquarters",{ascending:false}),
      db.from("tenant_onboarding_steps").select("*").eq("tenant_id",tenantId).order("sort_order"),
      db.from("tenant_admin_invites").select("*").eq("tenant_id",tenantId).order("created_at",{ascending:false}),
      db.from("saas_plans").select("id,code,name,is_internal").eq("active",true).order("name"),
      db.from("saas_modules").select("code,name,category,description").eq("active",true).order("sort_order"),
      db.from("saas_plan_modules").select("plan_id,module_code,enabled"),
      db.from("tenant_module_overrides").select("module_code,enabled,reason").eq("tenant_id",tenantId),
    ]);
    const err=[overview,stores,onboarding,invites,plans,modules,planModules,overrides].find((x:any)=>x.error)?.error;if(err)throw err;
    return {overview:overview.data,stores:stores.data||[],onboarding:onboarding.data||[],invites:invites.data||[],plans:plans.data||[],modules:modules.data||[],planModules:planModules.data||[],overrides:overrides.data||[]};
  }});
  const d=detail.data;
  const status=useMutation({mutationFn:async(s:string)=>{const {error}=await (supabase as any).rpc("platform_set_tenant_status",{p_tenant_id:tenantId,p_status:s});if(error)throw error;},onSuccess:()=>qc.invalidateQueries({queryKey:["platform-company",tenantId]})});
  const plan=useMutation({mutationFn:async(code:string)=>{const {error}=await (supabase as any).rpc("platform_change_plan",{p_tenant_id:tenantId,p_plan_code:code,p_billing_cycle:"monthly"});if(error)throw error;},onSuccess:()=>qc.invalidateQueries({queryKey:["platform-company",tenantId]})});
  const override=useMutation({mutationFn:async({code,enabled}:{code:string;enabled:boolean})=>{const {error}=await (supabase as any).rpc("platform_set_module_override",{p_tenant_id:tenantId,p_module_code:code,p_enabled:enabled,p_reason:"Alteração pelo Control Plane"});if(error)throw error;},onSuccess:()=>qc.invalidateQueries({queryKey:["platform-company",tenantId]})});
  const moduleState=useMemo(()=>{const map:any={};if(!d)return map;for(const m of d.modules){const base=d.planModules.some((pm:any)=>pm.plan_id===d.overview?.plan_id&&pm.module_code===m.code&&pm.enabled);const ov=d.overrides.find((o:any)=>o.module_code===m.code);map[m.code]=ov?ov.enabled:base;}return map;},[d]);
  if(detail.isLoading)return <div className="p-8">Carregando empresa...</div>;
  if(!d?.overview)return <div className="p-8">Empresa não encontrada.</div>;
  const o=d.overview;
  return <div className="p-6 lg:p-8 max-w-[1500px] mx-auto space-y-6">
    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4"><div><div className="flex items-center gap-2"><Building2 className="h-6 w-6"/><h1 className="text-3xl font-black">{o.name}</h1><Badge>{o.lifecycle_status}</Badge></div><p className="text-slate-500 mt-2">{o.legal_name||"Razão social pendente"} · {o.cnpj||"CNPJ pendente"}</p><p className="text-sm text-slate-500 mt-1">Tenant: {o.slug}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>status.mutate("active")} disabled={status.isPending}>Ativar</Button><Button variant="outline" onClick={()=>status.mutate("suspended")} disabled={status.isPending}>Suspender</Button><Button variant="destructive" onClick={()=>status.mutate("cancelled")} disabled={status.isPending}>Cancelar</Button></div></div>

    <div className="grid gap-4 md:grid-cols-4"><Mini title="Unidades" value={o.store_count||0} icon={Store}/><Mini title="Usuários" value={o.member_count||0} icon={Users}/><Mini title="Plano" value={o.plan_name||"—"} icon={ShieldCheck}/><Mini title="Onboarding" value={o.onboarding_status||"—"} icon={CheckCircle2}/></div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="rounded-2xl"><CardHeader><CardTitle>Assinatura</CardTitle></CardHeader><CardContent className="space-y-3"><div><span className="text-sm text-slate-500">Plano atual</span><div className="font-bold">{o.plan_name||"Sem plano"}</div></div><Select value={o.plan_code||undefined} onValueChange={v=>plan.mutate(v)}><SelectTrigger><SelectValue placeholder="Alterar plano"/></SelectTrigger><SelectContent>{d.plans.map((p:any)=><SelectItem key={p.code} value={p.code}>{p.name}{p.is_internal?" (interno)":""}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Trocas de plano são auditadas. Preços comerciais permanecem a definir até a estratégia de cobrança ser fechada.</p></CardContent></Card>
      <Card className="rounded-2xl"><CardHeader><CardTitle>Contato empresarial</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div><strong>Responsável:</strong> {o.contact_name||"—"}</div><div><strong>E-mail:</strong> {o.contact_email||"—"}</div><div><strong>Telefone:</strong> {o.contact_phone||"—"}</div></CardContent></Card>
    </div>

    <Card className="rounded-2xl"><CardHeader><CardTitle>Módulos liberados</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{d.modules.map((m:any)=><div key={m.code} className="p-4 rounded-xl border flex items-center justify-between gap-4"><div><div className="font-bold">{m.name}</div><div className="text-xs text-slate-500 mt-1">{m.category}</div></div><Switch checked={Boolean(moduleState[m.code])} onCheckedChange={checked=>override.mutate({code:m.code,enabled:checked})}/></div>)}</CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="rounded-2xl"><CardHeader><CardTitle>Onboarding</CardTitle></CardHeader><CardContent className="space-y-3">{d.onboarding.map((s:any)=><div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border">{s.status==="completed"?<CheckCircle2 className="h-5 w-5 text-emerald-600"/>:<Circle className="h-5 w-5 text-slate-400"/>}<div><div className="font-semibold">{s.title}</div><div className="text-xs text-slate-500">{s.status}</div></div></div>)}</CardContent></Card>
      <Card className="rounded-2xl"><CardHeader><CardTitle>Unidades</CardTitle></CardHeader><CardContent className="space-y-3">{d.stores.map((s:any)=><div key={s.id} className="p-4 rounded-xl border"><div className="flex items-center justify-between"><div className="font-bold">{s.name}</div>{s.is_headquarters&&<Badge variant="secondary">Matriz</Badge>}</div><div className="text-sm text-slate-500 mt-1">{s.cnpj||"CNPJ pendente"} · {s.operation_status||"—"}</div><div className="text-xs text-slate-500 mt-1">{s.address||"Endereço pendente"}</div></div>)}</CardContent></Card>
    </div>

    <Card className="rounded-2xl"><CardHeader><CardTitle>Convites administrativos</CardTitle></CardHeader><CardContent className="space-y-3">{d.invites.length?d.invites.map((i:any)=><div key={i.id} className="flex items-center gap-3 p-3 rounded-xl border"><Mail className="h-4 w-4"/><div className="flex-1"><div className="font-semibold">{i.full_name||i.email}</div><div className="text-xs text-slate-500">{i.email}</div></div><Badge variant="secondary">{i.status}</Badge></div>):<p className="text-sm text-slate-500">Nenhum convite registrado.</p>}</CardContent></Card>
  </div>;
}
function Mini({title,value,icon:Icon}:{title:string;value:any;icon:any}){return <Card className="rounded-2xl"><CardContent className="p-5"><Icon className="h-5 w-5 text-slate-500"/><div className="text-2xl font-black mt-3">{value}</div><div className="text-sm text-slate-500">{title}</div></CardContent></Card>}
