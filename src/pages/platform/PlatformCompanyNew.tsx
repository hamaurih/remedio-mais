import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ShieldCheck } from "lucide-react";

const empty = { name:"", legal_name:"", cnpj:"", contact_name:"", contact_email:"", contact_phone:"", admin_name:"", admin_email:"", plan_code:"starter", billing_cycle:"monthly", zip_code:"", street:"", number:"", complement:"", neighborhood:"", city:"", state:"", website:"" };

export default function PlatformCompanyNew() {
  const navigate = useNavigate();
  const [form,setForm]=useState(empty);
  const [error,setError]=useState("");
  const plans=useQuery({queryKey:["platform-plans-new-company"],queryFn:async()=>{const {data,error}=await (supabase as any).from("saas_plans").select("code,name,description,is_internal").eq("active",true).order("name");if(error)throw error;return (data||[]).filter((p:any)=>!p.is_internal);}});
  const create=useMutation({mutationFn:async()=>{const {data,error}=await (supabase as any).rpc("platform_create_company",{p_payload:form});if(error)throw error;return data;},onSuccess:(data:any)=>navigate(`/platform/empresas/${data.tenant_id}`),onError:(e:any)=>setError(e?.message||"Não foi possível criar a empresa.")});
  const change=(key:string,value:string)=>setForm(v=>({...v,[key]:value}));
  const submit=(e:FormEvent)=>{e.preventDefault();setError("");create.mutate();};

  return <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
    <div><p className="text-sm font-semibold text-slate-500">Provisionamento</p><h1 className="text-3xl font-black tracking-tight mt-1">Nova empresa</h1><p className="text-slate-600 mt-2">Cria um tenant isolado, sua Matriz, assinatura, onboarding e convite do administrador. A empresa nasce fora de operação até concluir a implantação.</p></div>
    <form onSubmit={submit} className="space-y-6">
      <Section title="Empresa" icon={Building2}><Field label="Nome fantasia" value={form.name} onChange={v=>change("name",v)} required/><Field label="Razão social" value={form.legal_name} onChange={v=>change("legal_name",v)}/><Field label="CNPJ" value={form.cnpj} onChange={v=>change("cnpj",v)}/><Field label="Site" value={form.website} onChange={v=>change("website",v)} /></Section>
      <Section title="Contato empresarial"><Field label="Responsável" value={form.contact_name} onChange={v=>change("contact_name",v)}/><Field label="E-mail" type="email" value={form.contact_email} onChange={v=>change("contact_email",v)}/><Field label="Telefone" value={form.contact_phone} onChange={v=>change("contact_phone",v)}/></Section>
      <Section title="Administrador inicial" icon={ShieldCheck}><Field label="Nome do administrador" value={form.admin_name} onChange={v=>change("admin_name",v)}/><Field label="E-mail do administrador" type="email" value={form.admin_email} onChange={v=>change("admin_email",v)} required/></Section>
      <Section title="Plano e assinatura"><div className="space-y-2"><Label>Plano</Label><Select value={form.plan_code} onValueChange={v=>change("plan_code",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(plans.data||[]).map((p:any)=><SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Ciclo</Label><Select value={form.billing_cycle} onValueChange={v=>change("billing_cycle",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="monthly">Mensal</SelectItem><SelectItem value="yearly">Anual</SelectItem><SelectItem value="custom">Personalizado</SelectItem></SelectContent></Select></div></Section>
      <Section title="Endereço da Matriz"><Field label="CEP" value={form.zip_code} onChange={v=>change("zip_code",v)}/><Field label="Logradouro" value={form.street} onChange={v=>change("street",v)}/><Field label="Número" value={form.number} onChange={v=>change("number",v)}/><Field label="Complemento" value={form.complement} onChange={v=>change("complement",v)}/><Field label="Bairro" value={form.neighborhood} onChange={v=>change("neighborhood",v)}/><Field label="Cidade" value={form.city} onChange={v=>change("city",v)}/><Field label="UF" value={form.state} onChange={v=>change("state",v)} /></Section>
      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end"><Button type="submit" size="lg" disabled={create.isPending}>{create.isPending?"Provisionando...":"Criar empresa e iniciar onboarding"}</Button></div>
    </form>
  </div>;
}

function Section({title,children,icon:Icon}:{title:string;children:any;icon?:any}){return <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2">{Icon&&<Icon className="h-5 w-5"/>}{title}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{children}</CardContent></Card>}
function Field({label,value,onChange,type="text",required=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}){return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={e=>onChange(e.target.value)} required={required}/></div>}
