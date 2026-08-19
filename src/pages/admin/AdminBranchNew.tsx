import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const initial = {
  name: "", code: "", legal_name: "", cnpj: "", cnae_main: "", tax_regime: "",
  state_registration: "", municipal_registration: "", redesim_protocol: "",
  zip_code: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "PB", phone: "",
};

export default function AdminBranchNew() {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const set = (key: keyof typeof initial, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Informe o nome da filial.");
    if (!form.cnpj.trim()) return toast.error("Informe o CNPJ da filial para iniciar o dossiê.");
    setSaving(true);
    const address = [form.street, form.number, form.neighborhood, form.city, form.state, form.zip_code].filter(Boolean).join(", ");
    const { data, error } = await (supabase as any).rpc("create_branch_legal_dossier", { p_payload: { ...form, address } });
    setSaving(false);
    if (error) return toast.error(error.message || "Não foi possível cadastrar a filial.");
    toast.success("Filial criada em modo de legalização. Ela permanece inativa até concluir o dossiê obrigatório.");
    navigate(`/admin/unidades/${data}/regularizacao`);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/admin/unidades"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link></Button>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Abertura de estabelecimento</p>
        <h1 className="text-2xl md:text-3xl font-extrabold">Cadastrar filial legalmente</h1>
        <p className="text-sm text-muted-foreground mt-1">O cadastro cria a unidade como <strong>Em legalização</strong>. Ela não entra no site, não recebe pedidos e não fica operacional até o checklist obrigatório estar regular.</p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="pt-5 flex gap-3 text-sm"><ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0" /><div>Depois deste cadastro, o sistema abrirá o dossiê de Vigilância Sanitária, ANVISA, CRF, fiscal, municipal, incêndio, boas práticas e documentos.</div></CardContent>
      </Card>

      <form onSubmit={submit} className="space-y-5">
        <Section title="Identificação da filial" description="Dados societários e cadastrais do estabelecimento." icon={Building2}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome fantasia *" value={form.name} onChange={(v) => set("name", v)} />
            <Field label="Código interno" value={form.code} onChange={(v) => set("code", v)} placeholder="Ex.: FILIAL-CENTRO" />
            <Field label="Razão social" value={form.legal_name} onChange={(v) => set("legal_name", v)} />
            <Field label="CNPJ da filial *" value={form.cnpj} onChange={(v) => set("cnpj", v)} placeholder="00.000.000/0000-00" />
            <Field label="CNAE principal" value={form.cnae_main} onChange={(v) => set("cnae_main", v)} />
            <Field label="Regime tributário" value={form.tax_regime} onChange={(v) => set("tax_regime", v)} />
            <Field label="Inscrição estadual" value={form.state_registration} onChange={(v) => set("state_registration", v)} />
            <Field label="Inscrição municipal" value={form.municipal_registration} onChange={(v) => set("municipal_registration", v)} />
            <Field label="Protocolo REDESIM" value={form.redesim_protocol} onChange={(v) => set("redesim_protocol", v)} />
            <Field label="Telefone" value={form.phone} onChange={(v) => set("phone", v)} />
          </div>
        </Section>

        <Section title="Endereço do estabelecimento" description="Endereço que será usado no licenciamento e posteriormente na logística." icon={Building2}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="CEP" value={form.zip_code} onChange={(v) => set("zip_code", v)} />
            <div className="md:col-span-2"><Field label="Logradouro" value={form.street} onChange={(v) => set("street", v)} /></div>
            <Field label="Número" value={form.number} onChange={(v) => set("number", v)} />
            <Field label="Complemento" value={form.complement} onChange={(v) => set("complement", v)} />
            <Field label="Bairro" value={form.neighborhood} onChange={(v) => set("neighborhood", v)} />
            <Field label="Cidade" value={form.city} onChange={(v) => set("city", v)} />
            <Field label="UF" value={form.state} onChange={(v) => set("state", v.toUpperCase().slice(0, 2))} />
          </div>
        </Section>

        <div className="flex justify-end gap-2"><Button type="button" variant="outline" asChild><Link to="/admin/unidades">Cancelar</Link></Button><Button type="submit" disabled={saving}>{saving ? "Criando dossiê..." : "Criar filial e abrir regularização"}</Button></div>
      </form>
    </div>
  );
}

function Section({ title, description, icon: Icon, children }: { title: string; description: string; icon: any; children: React.ReactNode }) {
  return <Card><CardHeader><div className="flex gap-3"><div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center"><Icon className="h-5 w-5" /></div><div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></div></div></CardHeader><CardContent>{children}</CardContent></Card>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}
