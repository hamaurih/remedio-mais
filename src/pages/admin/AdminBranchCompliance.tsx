import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle2, ExternalLink, FileCheck2, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";

type Unit = {
  id: string; tenant_id: string; name: string; code: string | null; cnpj: string | null; legal_name: string | null;
  address: string | null; active: boolean; is_headquarters: boolean; operation_status: string; compliance_status: string;
  compliance_enforced: boolean; ecommerce_fulfillment_enabled: boolean; phone: string | null;
};

type Profile = {
  store_id: string; tenant_id: string; trade_name: string | null; legal_name: string | null; cnpj: string | null;
  cnae_main: string | null; legal_nature: string | null; tax_regime: string | null; state_registration: string | null;
  municipal_registration: string | null; junta_registration: string | null; redesim_protocol: string | null;
  zoning_viability_status: string | null; opening_date: string | null; zip_code: string | null; street: string | null;
  number: string | null; complement: string | null; neighborhood: string | null; city: string | null; state: string | null;
  ibge_code: string | null; phone: string | null; email: string | null; handles_prescription_medicines: boolean;
  handles_controlled_medicines: boolean; handles_antimicrobials: boolean; has_manipulation: boolean;
  offers_pharmaceutical_services: boolean; offers_vaccination: boolean; handles_thermolabile: boolean; offers_remote_service: boolean;
  pharmacist_rt_name: string | null; pharmacist_rt_cpf: string | null; pharmacist_rt_crf: string | null;
  pharmacist_rt_crf_state: string | null; pharmacist_rt_start_date: string | null; pharmacist_assistance_hours: string | null;
  digital_certificate_type: string | null; digital_certificate_expires_at: string | null; sefaz_status: string | null;
  nfe_credential_status: string | null; nfce_credential_status: string | null; notes: string | null;
};

type Requirement = {
  id: string; store_id: string; requirement_code: string; required: boolean; status: string; document_number: string | null;
  protocol: string | null; issuer: string | null; issue_date: string | null; expiry_date: string | null; official_url: string | null;
  file_path: string | null; notes: string | null;
  catalog: { category: string; title: string; description: string | null; legal_reference: string | null; sort_order: number } | null;
};

const emptyProfile = {} as Profile;
const statusLabel: Record<string, string> = { pending: "Pendente", in_review: "Em análise", regular: "Regular", not_applicable: "Não aplicável", expired: "Vencido", suspended: "Suspenso" };

export default function AdminBranchCompliance() {
  const { storeId } = useParams();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    const db = supabase as any;
    const [unitRes, profileRes, reqRes] = await Promise.all([
      db.from("stores").select("id,tenant_id,name,code,cnpj,legal_name,address,active,is_headquarters,operation_status,compliance_status,compliance_enforced,ecommerce_fulfillment_enabled,phone").eq("id", storeId).single(),
      db.from("store_legal_profiles").select("*").eq("store_id", storeId).single(),
      db.from("store_compliance_items").select("id,store_id,requirement_code,required,status,document_number,protocol,issuer,issue_date,expiry_date,official_url,file_path,notes,catalog:store_compliance_catalog(category,title,description,legal_reference,sort_order)").eq("store_id", storeId),
    ]);
    if (unitRes.error) toast.error("Unidade não encontrada."); else setUnit(unitRes.data);
    if (profileRes.error) toast.error("Não foi possível carregar os dados legais."); else setProfile(profileRes.data);
    if (reqRes.error) toast.error("Não foi possível carregar o checklist."); else setRequirements((reqRes.data || []).sort((a: any, b: any) => (a.catalog?.sort_order || 999) - (b.catalog?.sort_order || 999)));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [storeId]);

  const requiredRows = requirements.filter((r) => r.required);
  const regularRows = requiredRows.filter((r) => r.status === "regular" && (!r.expiry_date || new Date(`${r.expiry_date}T23:59:59`) >= new Date()));
  const progress = requiredRows.length ? Math.round(regularRows.length / requiredRows.length * 100) : 0;
  const canActivate = requiredRows.length > 0 && regularRows.length === requiredRows.length;

  const grouped = useMemo(() => requirements.reduce((acc, row) => {
    const category = row.catalog?.category || "Outros";
    (acc[category] ||= []).push(row);
    return acc;
  }, {} as Record<string, Requirement[]>), [requirements]);

  const patchProfile = (key: keyof Profile, value: any) => setProfile((p) => ({ ...p, [key]: value }));
  const patchRequirement = (id: string, key: keyof Requirement, value: any) => setRequirements((rows) => rows.map((r) => r.id === id ? { ...r, [key]: value } : r));

  const saveProfile = async () => {
    if (!unit || !storeId) return;
    setSavingProfile(true);
    const db = supabase as any;
    const profilePayload = { ...profile, updated_at: new Date().toISOString() };
    delete (profilePayload as any).store_id;
    delete (profilePayload as any).tenant_id;
    const address = [profile.street, profile.number, profile.neighborhood, profile.city, profile.state, profile.zip_code].filter(Boolean).join(", ");
    const [profileRes, storeRes] = await Promise.all([
      db.from("store_legal_profiles").update(profilePayload).eq("store_id", storeId),
      db.from("stores").update({ name: profile.trade_name || unit.name, legal_name: profile.legal_name || null, cnpj: profile.cnpj || null, address: address || unit.address, phone: profile.phone || null, updated_at: new Date().toISOString() }).eq("id", storeId),
    ]);
    if (profileRes.error || storeRes.error) {
      setSavingProfile(false);
      return toast.error(profileRes.error?.message || storeRes.error?.message || "Não foi possível salvar o cadastro legal.");
    }
    const refresh = await db.rpc("refresh_store_compliance", { p_store_id: storeId });
    setSavingProfile(false);
    if (refresh.error) return toast.error(refresh.error.message || "Dados salvos, mas não foi possível recalcular o checklist.");
    toast.success("Cadastro legal e perfil sanitário atualizados.");
    await load();
  };

  const saveRequirement = async (row: Requirement) => {
    setSavingItem(row.id);
    const { error } = await (supabase as any).from("store_compliance_items").update({
      status: row.status,
      document_number: row.document_number || null,
      protocol: row.protocol || null,
      issuer: row.issuer || null,
      issue_date: row.issue_date || null,
      expiry_date: row.expiry_date || null,
      official_url: row.official_url || null,
      file_path: row.file_path || null,
      notes: row.notes || null,
      reviewed_at: row.status === "regular" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    setSavingItem(null);
    if (error) return toast.error(error.message || "Não foi possível salvar o requisito.");
    toast.success(`${row.catalog?.title || "Requisito"} atualizado.`);
    await load();
  };

  const uploadDocument = async (row: Requirement, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${storeId}/${row.requirement_code}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("store-compliance").upload(path, file, { upsert: false });
    if (error) return toast.error(error.message || "Falha ao anexar documento.");
    patchRequirement(row.id, "file_path", path);
    const { error: updateError } = await (supabase as any).from("store_compliance_items").update({ file_path: path, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updateError) return toast.error("Arquivo enviado, mas não foi possível vinculá-lo ao requisito.");
    toast.success("Documento anexado com segurança.");
    await load();
  };

  const openDocument = async (path: string) => {
    const { data, error } = await supabase.storage.from("store-compliance").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) return toast.error("Não foi possível abrir o documento.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const activateBranch = async () => {
    if (!unit || unit.is_headquarters || !canActivate) return;
    const { error } = await (supabase as any).from("stores").update({ active: true, operation_status: "active", ecommerce_fulfillment_enabled: false, updated_at: new Date().toISOString() }).eq("id", unit.id);
    if (error) return toast.error(error.message || "A filial ainda possui pendências bloqueantes.");
    toast.success("Filial ativada no cadastro interno. Roteamento do e-commerce permanece desligado.");
    await load();
  };

  if (loading) return <div className="p-10 text-center text-muted-foreground">Carregando dossiê regulatório...</div>;
  if (!unit) return <div className="p-10 text-center">Unidade não encontrada.</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/admin/unidades"><ArrowLeft className="h-4 w-4 mr-2" /> Matriz e Filiais</Link></Button>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Dossiê legal, sanitário e fiscal</p><h1 className="text-2xl md:text-3xl font-extrabold">{unit.name}</h1><p className="text-sm text-muted-foreground">{unit.cnpj || "CNPJ ainda não informado"} · {unit.is_headquarters ? "Matriz" : "Filial"}</p></div>
          <div className="flex flex-wrap gap-2"><Badge variant={unit.active ? "default" : "secondary"}>{unit.active ? "Ativa" : "Em legalização"}</Badge><Badge variant={unit.compliance_status === "regular" ? "default" : "outline"}>{unit.compliance_enforced ? statusLabel[unit.compliance_status] || unit.compliance_status : "Legado em revisão"}</Badge></div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <Card><CardHeader><CardTitle>Progresso da regularização</CardTitle><CardDescription>Somente requisitos marcados como obrigatórios entram na trava de ativação.</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between text-sm mb-2"><span>{regularRows.length} de {requiredRows.length} obrigatórios regulares</span><strong>{progress}%</strong></div><div className="h-3 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardDescription>Operação</CardDescription><CardTitle className="text-lg">{unit.is_headquarters ? "Matriz atual" : canActivate ? "Apta para ativação" : "Bloqueada"}</CardTitle></CardHeader><CardContent>{unit.is_headquarters ? <p className="text-xs text-muted-foreground">A Matriz segue sem bloqueio retroativo enquanto o dossiê real é preenchido.</p> : unit.active ? <div className="flex gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" /> Ativa internamente. Site ainda desligado.</div> : <Button className="w-full" disabled={!canActivate} onClick={activateBranch}>Ativar filial sem e-commerce</Button>}</CardContent></Card>
      </div>

      <Card className="border-amber-200 bg-amber-50/40"><CardContent className="pt-5 flex gap-3 text-sm"><ShieldAlert className="h-5 w-5 text-amber-700 shrink-0" /><div><strong>Esta tela não concede licença ou autorização.</strong> Ela organiza evidências e impede ativação interna irregular. A validade jurídica depende do órgão competente e do documento oficial anexado.</div></CardContent></Card>

      <Card>
        <CardHeader><CardTitle>1. Cadastro societário, fiscal e endereço</CardTitle><CardDescription>Dados básicos usados para identificar e licenciar o estabelecimento.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Nome fantasia" value={profile.trade_name || ""} onChange={(v) => patchProfile("trade_name", v)} />
            <Field label="Razão social" value={profile.legal_name || ""} onChange={(v) => patchProfile("legal_name", v)} />
            <Field label="CNPJ" value={profile.cnpj || ""} onChange={(v) => patchProfile("cnpj", v)} />
            <Field label="CNAE principal" value={profile.cnae_main || ""} onChange={(v) => patchProfile("cnae_main", v)} />
            <Field label="Natureza jurídica" value={profile.legal_nature || ""} onChange={(v) => patchProfile("legal_nature", v)} />
            <Field label="Regime tributário" value={profile.tax_regime || ""} onChange={(v) => patchProfile("tax_regime", v)} />
            <Field label="Inscrição estadual" value={profile.state_registration || ""} onChange={(v) => patchProfile("state_registration", v)} />
            <Field label="Inscrição municipal" value={profile.municipal_registration || ""} onChange={(v) => patchProfile("municipal_registration", v)} />
            <Field label="Registro Junta Comercial" value={profile.junta_registration || ""} onChange={(v) => patchProfile("junta_registration", v)} />
            <Field label="Protocolo REDESIM" value={profile.redesim_protocol || ""} onChange={(v) => patchProfile("redesim_protocol", v)} />
            <Field label="Viabilidade do endereço" value={profile.zoning_viability_status || ""} onChange={(v) => patchProfile("zoning_viability_status", v)} placeholder="Ex.: Aprovada" />
            <Field label="Data de abertura" type="date" value={profile.opening_date || ""} onChange={(v) => patchProfile("opening_date", v || null)} />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="CEP" value={profile.zip_code || ""} onChange={(v) => patchProfile("zip_code", v)} />
            <div className="md:col-span-2"><Field label="Logradouro" value={profile.street || ""} onChange={(v) => patchProfile("street", v)} /></div>
            <Field label="Número" value={profile.number || ""} onChange={(v) => patchProfile("number", v)} />
            <Field label="Complemento" value={profile.complement || ""} onChange={(v) => patchProfile("complement", v)} />
            <Field label="Bairro" value={profile.neighborhood || ""} onChange={(v) => patchProfile("neighborhood", v)} />
            <Field label="Cidade" value={profile.city || ""} onChange={(v) => patchProfile("city", v)} />
            <Field label="UF" value={profile.state || ""} onChange={(v) => patchProfile("state", v.toUpperCase().slice(0, 2))} />
            <Field label="Código IBGE" value={profile.ibge_code || ""} onChange={(v) => patchProfile("ibge_code", v)} />
            <Field label="Telefone" value={profile.phone || ""} onChange={(v) => patchProfile("phone", v)} />
            <Field label="E-mail" value={profile.email || ""} onChange={(v) => patchProfile("email", v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Perfil sanitário e responsabilidade técnica</CardTitle><CardDescription>Essas opções determinam quais obrigações condicionais passam a ser exigidas.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Toggle label="Medicamentos sob prescrição" checked={profile.handles_prescription_medicines} onChange={(v) => patchProfile("handles_prescription_medicines", v)} />
            <Toggle label="Controlados" checked={profile.handles_controlled_medicines} onChange={(v) => patchProfile("handles_controlled_medicines", v)} />
            <Toggle label="Antimicrobianos" checked={profile.handles_antimicrobials} onChange={(v) => patchProfile("handles_antimicrobials", v)} />
            <Toggle label="Manipulação" checked={profile.has_manipulation} onChange={(v) => patchProfile("has_manipulation", v)} />
            <Toggle label="Serviços farmacêuticos" checked={profile.offers_pharmaceutical_services} onChange={(v) => patchProfile("offers_pharmaceutical_services", v)} />
            <Toggle label="Vacinação" checked={profile.offers_vaccination} onChange={(v) => patchProfile("offers_vaccination", v)} />
            <Toggle label="Termolábeis" checked={profile.handles_thermolabile} onChange={(v) => patchProfile("handles_thermolabile", v)} />
            <Toggle label="Atendimento remoto" checked={profile.offers_remote_service} onChange={(v) => patchProfile("offers_remote_service", v)} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Farmacêutico RT" value={profile.pharmacist_rt_name || ""} onChange={(v) => patchProfile("pharmacist_rt_name", v)} />
            <Field label="CPF do RT" value={profile.pharmacist_rt_cpf || ""} onChange={(v) => patchProfile("pharmacist_rt_cpf", v)} />
            <Field label="CRF do RT" value={profile.pharmacist_rt_crf || ""} onChange={(v) => patchProfile("pharmacist_rt_crf", v)} />
            <Field label="UF do CRF" value={profile.pharmacist_rt_crf_state || ""} onChange={(v) => patchProfile("pharmacist_rt_crf_state", v.toUpperCase().slice(0, 2))} />
            <Field label="Início da responsabilidade" type="date" value={profile.pharmacist_rt_start_date || ""} onChange={(v) => patchProfile("pharmacist_rt_start_date", v || null)} />
            <Field label="Horário de assistência farmacêutica" value={profile.pharmacist_assistance_hours || ""} onChange={(v) => patchProfile("pharmacist_assistance_hours", v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Configuração fiscal</CardTitle><CardDescription>Preparação para NF-e/NFC-e própria e credenciamento da unidade.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo de certificado digital" value={profile.digital_certificate_type || ""} onChange={(v) => patchProfile("digital_certificate_type", v)} placeholder="Ex.: A1" />
          <Field label="Validade do certificado" type="date" value={profile.digital_certificate_expires_at || ""} onChange={(v) => patchProfile("digital_certificate_expires_at", v || null)} />
          <Field label="Situação SEFAZ" value={profile.sefaz_status || ""} onChange={(v) => patchProfile("sefaz_status", v)} />
          <Field label="Credenciamento NF-e" value={profile.nfe_credential_status || ""} onChange={(v) => patchProfile("nfe_credential_status", v)} />
          <Field label="Credenciamento NFC-e" value={profile.nfce_credential_status || ""} onChange={(v) => patchProfile("nfce_credential_status", v)} />
          <div className="md:col-span-3 space-y-1.5"><Label>Observações gerais</Label><Textarea value={profile.notes || ""} onChange={(e) => patchProfile("notes", e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="flex justify-end"><Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Salvando..." : "Salvar cadastro e recalcular exigências"}</Button></div>

      <div className="space-y-4">
        <div><h2 className="text-xl font-extrabold">4. Checklist documental</h2><p className="text-sm text-muted-foreground">Anexe os documentos, informe validade e marque como regular somente após conferir o documento oficial.</p></div>
        {Object.entries(grouped).map(([category, rows]) => (
          <Card key={category}>
            <CardHeader><CardTitle className="text-lg">{category}</CardTitle><CardDescription>{rows.filter((r) => r.required).length} requisito(s) obrigatório(s) nesta unidade</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {rows.map((row) => <RequirementEditor key={row.id} row={row} saving={savingItem === row.id} onPatch={(key, value) => patchRequirement(row.id, key, value)} onSave={() => saveRequirement(row)} onUpload={(e) => uploadDocument(row, e)} onOpen={() => row.file_path && openDocument(row.file_path)} />)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RequirementEditor({ row, saving, onPatch, onSave, onUpload, onOpen }: { row: Requirement; saving: boolean; onPatch: (key: keyof Requirement, value: any) => void; onSave: () => void; onUpload: (e: ChangeEvent<HTMLInputElement>) => void; onOpen: () => void }) {
  return (
    <div className={`rounded-xl border p-4 space-y-4 ${!row.required ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div><div className="flex items-center gap-2 flex-wrap"><h3 className="font-bold">{row.catalog?.title || row.requirement_code}</h3><Badge variant={row.required ? "default" : "secondary"}>{row.required ? "Obrigatório" : "Condicional"}</Badge></div><p className="text-xs text-muted-foreground mt-1">{row.catalog?.description}</p>{row.catalog?.legal_reference && <p className="text-[11px] text-muted-foreground mt-1">Referência: {row.catalog.legal_reference}</p>}</div>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={row.status} onChange={(e) => onPatch("status", e.target.value)} disabled={!row.required && row.status === "not_applicable"}>
          <option value="pending">Pendente</option><option value="in_review">Em análise</option><option value="regular">Regular</option><option value="not_applicable">Não aplicável</option><option value="expired">Vencido</option><option value="suspended">Suspenso</option>
        </select>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Número/documento" value={row.document_number || ""} onChange={(v) => onPatch("document_number", v)} />
        <Field label="Protocolo" value={row.protocol || ""} onChange={(v) => onPatch("protocol", v)} />
        <Field label="Órgão emissor" value={row.issuer || ""} onChange={(v) => onPatch("issuer", v)} />
        <Field label="Data de emissão" type="date" value={row.issue_date || ""} onChange={(v) => onPatch("issue_date", v || null)} />
        <Field label="Validade" type="date" value={row.expiry_date || ""} onChange={(v) => onPatch("expiry_date", v || null)} />
        <div className="md:col-span-2"><Field label="Link oficial para consulta" value={row.official_url || ""} onChange={(v) => onPatch("official_url", v)} /></div>
        <div className="space-y-1.5"><Label>Anexo privado</Label><label className="h-10 border rounded-md px-3 flex items-center gap-2 text-sm cursor-pointer hover:bg-muted"><Upload className="h-4 w-4" /> {row.file_path ? "Substituir/anexar novo" : "Enviar PDF ou imagem"}<input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onUpload} /></label></div>
      </div>
      <div className="space-y-1.5"><Label>Observações</Label><Textarea value={row.notes || ""} onChange={(e) => onPatch("notes", e.target.value)} /></div>
      <div className="flex flex-wrap justify-end gap-2">{row.official_url && <Button size="sm" variant="outline" asChild><a href={row.official_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" /> Consulta oficial</a></Button>}{row.file_path && <Button size="sm" variant="outline" onClick={onOpen}><FileCheck2 className="h-4 w-4 mr-2" /> Ver anexo</Button>}<Button size="sm" onClick={onSave} disabled={saving}>{saving ? "Salvando..." : "Salvar requisito"}</Button></div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-lg border p-3 gap-3"><Label className="text-sm leading-tight">{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>;
}
