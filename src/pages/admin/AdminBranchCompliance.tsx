import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  Save,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";

const db = supabase as any;

type StoreRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  cnpj: string | null;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  active: boolean;
  is_headquarters: boolean;
  operation_status: string;
  compliance_enforced: boolean;
  ecommerce_fulfillment_enabled: boolean;
};

type ChecklistRow = {
  tenant_id: string;
  store_id: string;
  code: string;
  title: string;
  category: string;
  blocking: boolean;
  legal_reference: string | null;
  guidance: string | null;
  effective_from: string | null;
  applicable: boolean;
  document_status: string;
  document_number: string | null;
  issuer: string | null;
  protocol_number: string | null;
  issue_date: string | null;
  expires_at: string | null;
  file_path: string | null;
  verification_url: string | null;
  notes: string | null;
  inherited_from_store_id: string | null;
  satisfied: boolean;
};

type Readiness = {
  missing_requirements: string[];
  missing_count: number;
  compliance_status: string;
};

const blank = {
  name: "",
  code: "",
  legal_name: "",
  cnpj: "",
  phone: "",
  activity_type: "drogaria",
  cnae_primary: "4771701",
  legal_nature: "",
  state_registration: "",
  municipal_registration: "",
  junta_registration_number: "",
  redesim_protocol: "",
  tax_regime: "",
  opening_date: "",
  zip_code: "",
  street: "",
  street_number: "",
  complement: "",
  neighborhood: "",
  city: "Campina Grande",
  state_code: "PB",
  ibge_city_code: "",
  operating_hours_text: "",
  sells_prescription_medicines: true,
  sells_controlled_medicines: false,
  sells_antimicrobials: true,
  manipulates_medicines: false,
  manipulates_controlled_substances: false,
  pharmaceutical_services: false,
  vaccination_service: false,
  thermolabile_storage: false,
  remote_dispensing: true,
  nfe_enabled: true,
  nfce_enabled: true,
  sefaz_credential_status: "pending",
  digital_certificate_type: "",
  digital_certificate_expires_at: "",
  rt_name: "",
  rt_crf_number: "",
  rt_crf_state: "PB",
  rt_start_date: "",
  rt_schedule_text: "",
  service_radius_km: "18",
  preparation_minutes: "20",
  delivery_enabled: true,
  pickup_enabled: true,
};

type FormState = typeof blank;

const categoryLabels: Record<string, string> = {
  legal: "Societário / Legal",
  fiscal: "Fiscal",
  sanitary: "Vigilância Sanitária",
  anvisa: "ANVISA",
  crf: "CRF / Responsabilidade técnica",
  controlled: "Controlados",
  operational: "Boas práticas",
  digital: "E-commerce",
};

const missingLabels: Record<string, string> = {
  legal_profile: "Cadastro legal da unidade",
  cnpj: "CNPJ da filial",
  legal_name: "Razão social",
  cnae_primary: "CNAE principal",
  state_registration: "Inscrição estadual",
  municipal_registration: "Inscrição municipal",
  tax_regime: "Regime tributário",
  structured_address: "Endereço completo",
  operating_hours: "Horário de funcionamento",
  pharmacist_technical_director: "Farmacêutico responsável técnico",
  sefaz_credential: "Credenciamento SEFAZ validado",
  fiscal_document_configuration: "Configuração de documento fiscal",
  pgrss_or_group_d_notification: "PGRSS ou notificação de resíduos Grupo D",
};

function composeAddress(f: FormState) {
  return [f.street, f.street_number, f.complement, f.neighborhood, f.city, f.state_code, f.zip_code].filter(Boolean).join(", ");
}

export default function AdminBranchCompliance() {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const isNew = !storeId;
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...blank });
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileExists, setProfileExists] = useState(false);

  const patch = (key: keyof FormState, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const load = async () => {
    setLoading(true);
    if (isNew) {
      const { data, error } = await db.from("stores").select("tenant_id").limit(1).maybeSingle();
      if (error || !data?.tenant_id) toast.error("Não foi possível identificar a empresa atual.");
      setTenantId(data?.tenant_id || null);
      setLoading(false);
      return;
    }

    const storeRes = await db.from("stores").select("id,tenant_id,name,code,cnpj,legal_name,address,phone,active,is_headquarters,operation_status,compliance_enforced,ecommerce_fulfillment_enabled").eq("id", storeId).single();
    if (storeRes.error || !storeRes.data) {
      toast.error("Unidade não encontrada.");
      setLoading(false);
      return;
    }
    const s = storeRes.data as StoreRow;
    setStore(s);
    setTenantId(s.tenant_id);

    const [profileRes, rtRes, checklistRes, readinessRes] = await Promise.all([
      db.from("store_legal_profiles").select("*").eq("store_id", storeId).maybeSingle(),
      db.from("store_technical_responsibilities").select("*").eq("store_id", storeId).eq("responsibility_type", "technical_director").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("store_compliance_checklist").select("*").eq("store_id", storeId).eq("applicable", true).order("category").order("code"),
      db.from("store_compliance_readiness").select("missing_requirements,missing_count,compliance_status").eq("store_id", storeId).maybeSingle(),
    ]);

    const p = profileRes.data;
    const rt = rtRes.data;
    setProfileExists(Boolean(p));
    setForm({
      ...blank,
      name: s.name || "",
      code: s.code || "",
      legal_name: s.legal_name || "",
      cnpj: s.cnpj || "",
      phone: s.phone || "",
      activity_type: p?.activity_type || "drogaria",
      cnae_primary: p?.cnae_primary || "4771701",
      legal_nature: p?.legal_nature || "",
      state_registration: p?.state_registration || "",
      municipal_registration: p?.municipal_registration || "",
      junta_registration_number: p?.junta_registration_number || "",
      redesim_protocol: p?.redesim_protocol || "",
      tax_regime: p?.tax_regime || "",
      opening_date: p?.opening_date || "",
      zip_code: p?.zip_code || "",
      street: p?.street || "",
      street_number: p?.street_number || "",
      complement: p?.complement || "",
      neighborhood: p?.neighborhood || "",
      city: p?.city || "Campina Grande",
      state_code: p?.state_code || "PB",
      ibge_city_code: p?.ibge_city_code || "",
      operating_hours_text: p?.operating_hours?.display || "",
      sells_prescription_medicines: p?.sells_prescription_medicines ?? true,
      sells_controlled_medicines: p?.sells_controlled_medicines ?? false,
      sells_antimicrobials: p?.sells_antimicrobials ?? true,
      manipulates_medicines: p?.manipulates_medicines ?? false,
      manipulates_controlled_substances: p?.manipulates_controlled_substances ?? false,
      pharmaceutical_services: p?.pharmaceutical_services ?? false,
      vaccination_service: p?.vaccination_service ?? false,
      thermolabile_storage: p?.thermolabile_storage ?? false,
      remote_dispensing: p?.remote_dispensing ?? true,
      nfe_enabled: p?.nfe_enabled ?? true,
      nfce_enabled: p?.nfce_enabled ?? true,
      sefaz_credential_status: p?.sefaz_credential_status || "pending",
      digital_certificate_type: p?.digital_certificate_type || "",
      digital_certificate_expires_at: p?.digital_certificate_expires_at?.slice?.(0, 10) || "",
      rt_name: rt?.professional_name || "",
      rt_crf_number: rt?.crf_number || "",
      rt_crf_state: rt?.crf_state || "PB",
      rt_start_date: rt?.starts_at || "",
      rt_schedule_text: rt?.weekly_schedule?.display || "",
      service_radius_km: "18",
      preparation_minutes: "20",
      delivery_enabled: true,
      pickup_enabled: true,
    });
    setChecklist((checklistRes.data || []) as ChecklistRow[]);
    setReadiness(readinessRes.data || null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [storeId]);

  const blocking = useMemo(() => checklist.filter((r) => r.applicable && r.blocking), [checklist]);
  const blockingSatisfied = useMemo(() => blocking.filter((r) => r.satisfied).length, [blocking]);
  const percentage = blocking.length ? Math.round((blockingSatisfied / blocking.length) * 100) : 0;

  const payload = () => ({
    ...form,
    address: composeAddress(form),
    operating_hours: form.operating_hours_text ? { display: form.operating_hours_text } : {},
    rt_schedule: form.rt_schedule_text ? { display: form.rt_schedule_text } : {},
    digital_certificate_expires_at: form.digital_certificate_expires_at || null,
  });

  const createBranch = async () => {
    if (!tenantId) return toast.error("Empresa não identificada.");
    if (!form.name.trim() || !form.legal_name.trim() || !form.cnpj.trim()) return toast.error("Preencha nome, razão social e CNPJ.");
    setSaving(true);
    const { data, error } = await db.rpc("create_branch_legal_dossier", { p_tenant_id: tenantId, p_payload: payload() });
    setSaving(false);
    if (error) return toast.error(error.message || "Não foi possível criar o dossiê da filial.");
    toast.success("Filial criada em modo de legalização. Venda e e-commerce permanecem bloqueados até a regularização.");
    navigate(`/admin/unidades/${data}/regularizacao`);
  };

  const saveProfile = async () => {
    if (!storeId || !tenantId) return;
    setSaving(true);
    const storePayload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      cnpj: form.cnpj.trim() || null,
      legal_name: form.legal_name.trim() || null,
      phone: form.phone.trim() || null,
      address: composeAddress(form) || null,
      updated_at: new Date().toISOString(),
    };
    const profilePayload = {
      store_id: storeId,
      tenant_id: tenantId,
      activity_type: form.activity_type,
      cnae_primary: form.cnae_primary || null,
      legal_nature: form.legal_nature || null,
      state_registration: form.state_registration || null,
      municipal_registration: form.municipal_registration || null,
      junta_registration_number: form.junta_registration_number || null,
      redesim_protocol: form.redesim_protocol || null,
      tax_regime: form.tax_regime || null,
      opening_date: form.opening_date || null,
      zip_code: form.zip_code || null,
      street: form.street || null,
      street_number: form.street_number || null,
      complement: form.complement || null,
      neighborhood: form.neighborhood || null,
      city: form.city || null,
      state_code: form.state_code || null,
      ibge_city_code: form.ibge_city_code || null,
      operating_hours: form.operating_hours_text ? { display: form.operating_hours_text } : {},
      sells_prescription_medicines: form.sells_prescription_medicines,
      sells_controlled_medicines: form.sells_controlled_medicines,
      sells_antimicrobials: form.sells_antimicrobials,
      manipulates_medicines: form.manipulates_medicines,
      manipulates_controlled_substances: form.manipulates_controlled_substances,
      pharmaceutical_services: form.pharmaceutical_services,
      vaccination_service: form.vaccination_service,
      thermolabile_storage: form.thermolabile_storage,
      remote_dispensing: form.remote_dispensing,
      nfe_enabled: form.nfe_enabled,
      nfce_enabled: form.nfce_enabled,
      sefaz_credential_status: form.sefaz_credential_status,
      digital_certificate_type: form.digital_certificate_type || null,
      digital_certificate_expires_at: form.digital_certificate_expires_at || null,
      updated_at: new Date().toISOString(),
    };
    const [sRes, pRes] = await Promise.all([
      db.from("stores").update(storePayload).eq("id", storeId),
      db.from("store_legal_profiles").upsert(profilePayload, { onConflict: "store_id" }),
    ]);
    setSaving(false);
    if (sRes.error || pRes.error) return toast.error(sRes.error?.message || pRes.error?.message || "Erro ao salvar cadastro legal.");
    toast.success("Cadastro legal atualizado.");
    setProfileExists(true);
    await load();
  };

  const saveRt = async () => {
    if (!storeId || !tenantId || !form.rt_name.trim() || !form.rt_crf_number.trim()) return toast.error("Informe nome e CRF do farmacêutico RT.");
    const existing = await db.from("store_technical_responsibilities").select("id").eq("store_id", storeId).eq("responsibility_type", "technical_director").eq("active", true).limit(1).maybeSingle();
    const rtPayload = {
      tenant_id: tenantId,
      store_id: storeId,
      professional_name: form.rt_name.trim(),
      crf_number: form.rt_crf_number.trim(),
      crf_state: form.rt_crf_state || "PB",
      responsibility_type: "technical_director",
      weekly_schedule: form.rt_schedule_text ? { display: form.rt_schedule_text } : {},
      starts_at: form.rt_start_date || new Date().toISOString().slice(0, 10),
      active: true,
      updated_at: new Date().toISOString(),
    };
    const result = existing.data?.id
      ? await db.from("store_technical_responsibilities").update(rtPayload).eq("id", existing.data.id)
      : await db.from("store_technical_responsibilities").insert(rtPayload);
    if (result.error) return toast.error(result.error.message || "Erro ao salvar responsável técnico.");
    toast.success("Responsabilidade técnica atualizada.");
    await load();
  };

  const activate = async () => {
    if (!storeId || !store) return;
    if ((readiness?.missing_count || 0) > 0) return toast.error("Existem pendências obrigatórias antes da ativação.");
    const payloadUpdate = store.compliance_enforced
      ? { active: true, ecommerce_fulfillment_enabled: true, operation_status: "active" }
      : { compliance_enforced: true, active: true, ecommerce_fulfillment_enabled: true, operation_status: "active" };
    const { error } = await db.from("stores").update(payloadUpdate).eq("id", storeId);
    if (error) return toast.error(error.message || "Não foi possível ativar a unidade.");
    toast.success("Unidade regularizada e liberada para operação.");
    await load();
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando dossiê...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3 items-start">
          <Button variant="outline" size="icon" onClick={() => navigate("/admin/unidades")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Regularização farmacêutica</p>
            <h1 className="text-2xl md:text-3xl font-extrabold">{isNew ? "Cadastrar nova filial" : `Dossiê — ${store?.name || "Unidade"}`}</h1>
            <p className="text-sm text-muted-foreground max-w-3xl mt-1">Cadastro societário, fiscal, Vigilância Sanitária, ANVISA, CRF, controlados e boas práticas em uma única trilha.</p>
          </div>
        </div>
        {!isNew && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={store?.active ? "default" : "secondary"}>{store?.active ? "Operando" : "Em legalização"}</Badge>
            <Badge variant={(readiness?.missing_count || 0) === 0 ? "default" : "outline"}>{percentage}% documental</Badge>
          </div>
        )}
      </div>

      {!isNew && (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard icon={ShieldCheck} title="Conformidade bloqueante" value={`${blockingSatisfied}/${blocking.length}`} subtitle={`${percentage}% concluído`} />
          <MetricCard icon={CircleAlert} title="Pendências para ativar" value={readiness?.missing_count || 0} subtitle="Campos, RT e documentos obrigatórios" />
          <MetricCard icon={BadgeCheck} title="Status da unidade" value={store?.operation_status || "—"} subtitle={store?.compliance_enforced ? "Regra de compliance ativa" : "Unidade legada em revisão"} />
        </div>
      )}

      {form.remote_dispensing && form.sells_controlled_medicines && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/10">
          <CardHeader className="pb-3"><CardTitle className="text-base flex gap-2 items-center"><CircleAlert className="h-5 w-5 text-amber-600" /> Controlados e canal digital</CardTitle><CardDescription>O sistema trata separadamente venda pela internet e entrega remota. A entrega remota de controlados pode ocorrer sob o procedimento sanitário aplicável; a venda de controlados pela internet permanece vedada. O dossiê exige um POP específico para esse fluxo.</CardDescription></CardHeader>
        </Card>
      )}

      <Tabs defaultValue="legal" className="space-y-4">
        <TabsList className="h-auto flex flex-wrap justify-start">
          <TabsTrigger value="legal">Cadastro legal</TabsTrigger>
          <TabsTrigger value="sanitary">Sanitário e operação</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="rt">Responsável técnico</TabsTrigger>
          {!isNew && <TabsTrigger value="documents">Documentos e licenças</TabsTrigger>}
        </TabsList>

        <TabsContent value="legal"><LegalSection form={form} patch={patch} /></TabsContent>
        <TabsContent value="sanitary"><SanitarySection form={form} patch={patch} /></TabsContent>
        <TabsContent value="fiscal"><FiscalSection form={form} patch={patch} /></TabsContent>
        <TabsContent value="rt"><RtSection form={form} patch={patch} onSave={!isNew ? saveRt : undefined} /></TabsContent>
        {!isNew && <TabsContent value="documents"><DocumentsSection rows={checklist} tenantId={tenantId!} storeId={storeId!} onSaved={load} /></TabsContent>}
      </Tabs>

      {!isNew && (readiness?.missing_requirements?.length || 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pendências que bloqueiam a ativação</CardTitle><CardDescription>O banco impede a unidade de operar no e-commerce enquanto esta lista não estiver zerada.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {readiness!.missing_requirements.map((code) => <Badge key={code} variant="outline">{missingLabels[code] || checklist.find((x) => x.code === code)?.title || code}</Badge>)}
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-3 z-10 rounded-xl border bg-background/95 backdrop-blur p-3 flex flex-col gap-2 sm:flex-row sm:justify-end shadow-lg">
        {isNew ? (
          <Button onClick={createBranch} disabled={saving}><Building2 className="h-4 w-4 mr-2" /> {saving ? "Criando dossiê..." : "Criar filial em legalização"}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={saveProfile} disabled={saving}><Save className="h-4 w-4 mr-2" /> Salvar cadastro</Button>
            <Button onClick={activate} disabled={(readiness?.missing_count || 0) > 0 || Boolean(store?.active && store?.compliance_enforced)}><CheckCircle2 className="h-4 w-4 mr-2" /> {store?.active && store?.compliance_enforced ? "Unidade regularizada" : "Ativar somente após regularização"}</Button>
          </>
        )}
      </div>
    </div>
  );
}

function LegalSection({ form, patch }: { form: FormState; patch: (k: keyof FormState, v: any) => void }) {
  return <Card><CardHeader><CardTitle>1. Constituição e inscrições</CardTitle><CardDescription>Dados do estabelecimento filial, REDESIM, Junta Comercial e inscrições tributárias.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    <Field label="Nome fantasia da filial *" value={form.name} onChange={(v) => patch("name", v)} />
    <Field label="Código interno" value={form.code} onChange={(v) => patch("code", v)} />
    <Field label="CNPJ da filial *" value={form.cnpj} onChange={(v) => patch("cnpj", v)} placeholder="00.000.000/0000-00" />
    <div className="lg:col-span-2"><Field label="Razão social *" value={form.legal_name} onChange={(v) => patch("legal_name", v)} /></div>
    <Field label="Telefone" value={form.phone} onChange={(v) => patch("phone", v)} />
    <Field label="CNAE principal *" value={form.cnae_primary} onChange={(v) => patch("cnae_primary", v)} />
    <Field label="Natureza jurídica" value={form.legal_nature} onChange={(v) => patch("legal_nature", v)} />
    <SelectField label="Regime tributário *" value={form.tax_regime} onChange={(v) => patch("tax_regime", v)} options={[['simples_nacional','Simples Nacional'],['lucro_presumido','Lucro Presumido'],['lucro_real','Lucro Real'],['outro','Outro']]} />
    <Field label="Inscrição estadual *" value={form.state_registration} onChange={(v) => patch("state_registration", v)} />
    <Field label="Inscrição municipal *" value={form.municipal_registration} onChange={(v) => patch("municipal_registration", v)} />
    <Field label="Registro Junta Comercial" value={form.junta_registration_number} onChange={(v) => patch("junta_registration_number", v)} />
    <Field label="Protocolo REDESIM" value={form.redesim_protocol} onChange={(v) => patch("redesim_protocol", v)} />
    <Field label="Data de abertura" value={form.opening_date} onChange={(v) => patch("opening_date", v)} type="date" />
    <div className="lg:col-span-3 border-t pt-4"><h3 className="font-semibold mb-3">Endereço legal do estabelecimento</h3><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Field label="CEP *" value={form.zip_code} onChange={(v) => patch("zip_code", v)} />
      <div className="lg:col-span-2"><Field label="Logradouro *" value={form.street} onChange={(v) => patch("street", v)} /></div>
      <Field label="Número *" value={form.street_number} onChange={(v) => patch("street_number", v)} />
      <Field label="Complemento" value={form.complement} onChange={(v) => patch("complement", v)} />
      <Field label="Bairro" value={form.neighborhood} onChange={(v) => patch("neighborhood", v)} />
      <Field label="Município *" value={form.city} onChange={(v) => patch("city", v)} />
      <Field label="UF *" value={form.state_code} onChange={(v) => patch("state_code", v.toUpperCase().slice(0,2))} />
      <Field label="Código IBGE" value={form.ibge_city_code} onChange={(v) => patch("ibge_city_code", v)} />
    </div></div>
  </CardContent></Card>;
}

function SanitarySection({ form, patch }: { form: FormState; patch: (k: keyof FormState, v: any) => void }) {
  return <Card><CardHeader><CardTitle>2. Perfil sanitário e atividades</CardTitle><CardDescription>As respostas definem automaticamente quais licenças e obrigações aparecem no checklist.</CardDescription></CardHeader><CardContent className="space-y-5">
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <SelectField label="Tipo de estabelecimento" value={form.activity_type} onChange={(v) => patch("activity_type", v)} options={[['drogaria','Drogaria'],['farmacia_sem_manipulacao','Farmácia sem manipulação'],['farmacia_com_manipulacao','Farmácia com manipulação'],['distribution_center','Centro de distribuição'],['administrative','Unidade administrativa']]} />
      <div className="md:col-span-2"><Field label="Horário de funcionamento *" value={form.operating_hours_text} onChange={(v) => patch("operating_hours_text", v)} placeholder="Ex.: seg a sáb 07:00–22:00; dom 08:00–18:00" /></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Toggle label="Vende medicamentos sob prescrição" checked={form.sells_prescription_medicines} onChange={(v) => patch("sells_prescription_medicines", v)} />
      <Toggle label="Vende medicamentos controlados" checked={form.sells_controlled_medicines} onChange={(v) => patch("sells_controlled_medicines", v)} />
      <Toggle label="Vende antimicrobianos" checked={form.sells_antimicrobials} onChange={(v) => patch("sells_antimicrobials", v)} />
      <Toggle label="Manipula medicamentos" checked={form.manipulates_medicines} onChange={(v) => patch("manipulates_medicines", v)} />
      <Toggle label="Manipula substâncias controladas" checked={form.manipulates_controlled_substances} onChange={(v) => patch("manipulates_controlled_substances", v)} />
      <Toggle label="Presta serviços farmacêuticos" checked={form.pharmaceutical_services} onChange={(v) => patch("pharmaceutical_services", v)} />
      <Toggle label="Serviço de vacinação" checked={form.vaccination_service} onChange={(v) => patch("vaccination_service", v)} />
      <Toggle label="Armazena termolábeis" checked={form.thermolabile_storage} onChange={(v) => patch("thermolabile_storage", v)} />
      <Toggle label="Atende solicitações remotas / e-commerce" checked={form.remote_dispensing} onChange={(v) => patch("remote_dispensing", v)} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t pt-4">
      <Field label="Raio de entrega (km)" value={form.service_radius_km} onChange={(v) => patch("service_radius_km", v)} />
      <Field label="Preparo médio (min)" value={form.preparation_minutes} onChange={(v) => patch("preparation_minutes", v)} />
      <Toggle label="Delivery" checked={form.delivery_enabled} onChange={(v) => patch("delivery_enabled", v)} />
      <Toggle label="Retirada em loja" checked={form.pickup_enabled} onChange={(v) => patch("pickup_enabled", v)} />
    </div>
  </CardContent></Card>;
}

function FiscalSection({ form, patch }: { form: FormState; patch: (k: keyof FormState, v: any) => void }) {
  return <Card><CardHeader><CardTitle>3. Preparação fiscal da filial</CardTitle><CardDescription>Credenciais e certificados serão validados em homologação antes de qualquer emissão fiscal em produção.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><Toggle label="Emitirá NFC-e" checked={form.nfce_enabled} onChange={(v) => patch("nfce_enabled", v)} /><Toggle label="Emitirá NF-e" checked={form.nfe_enabled} onChange={(v) => patch("nfe_enabled", v)} /></div>
    <div className="grid gap-4 md:grid-cols-3">
      <SelectField label="Situação SEFAZ" value={form.sefaz_credential_status} onChange={(v) => patch("sefaz_credential_status", v)} options={[['pending','Pendente'],['configured','Configurado'],['validated','Validado'],['blocked','Bloqueado']]} />
      <SelectField label="Certificado digital" value={form.digital_certificate_type} onChange={(v) => patch("digital_certificate_type", v)} options={[['a1','A1'],['a3','A3'],['cloud','Nuvem'],['other','Outro']]} allowEmpty />
      <Field label="Validade do certificado" value={form.digital_certificate_expires_at} onChange={(v) => patch("digital_certificate_expires_at", v)} type="date" />
    </div>
    <p className="text-xs text-muted-foreground">O ERP registra situação, validade e identificadores. Senhas, CSC e chaves privadas não devem ser gravadas nestes campos; serão mantidas em cofre de segredos quando a emissão fiscal for integrada.</p>
  </CardContent></Card>;
}

function RtSection({ form, patch, onSave }: { form: FormState; patch: (k: keyof FormState, v: any) => void; onSave?: () => void }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" /> 4. Farmacêutico responsável técnico</CardTitle><CardDescription>A presença do farmacêutico deve cobrir todo o horário de funcionamento; cadastre depois os substitutos quando houver.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2"><Field label="Nome do farmacêutico RT" value={form.rt_name} onChange={(v) => patch("rt_name", v)} /></div>
      <Field label="CRF nº" value={form.rt_crf_number} onChange={(v) => patch("rt_crf_number", v)} />
      <Field label="UF do CRF" value={form.rt_crf_state} onChange={(v) => patch("rt_crf_state", v.toUpperCase().slice(0,2))} />
      <Field label="Início da responsabilidade" value={form.rt_start_date} onChange={(v) => patch("rt_start_date", v)} type="date" />
      <div className="md:col-span-2 lg:col-span-3"><Field label="Horário de assistência técnica" value={form.rt_schedule_text} onChange={(v) => patch("rt_schedule_text", v)} placeholder="Ex.: seg a sáb 07:00–15:00" /></div>
    </div>
    {onSave && <Button variant="outline" onClick={onSave}><Save className="h-4 w-4 mr-2" /> Salvar RT principal</Button>}
  </CardContent></Card>;
}

function DocumentsSection({ rows, tenantId, storeId, onSaved }: { rows: ChecklistRow[]; tenantId: string; storeId: string; onSaved: () => void }) {
  const grouped = useMemo(() => rows.reduce<Record<string, ChecklistRow[]>>((acc, row) => { (acc[row.category] ||= []).push(row); return acc; }, {}), [rows]);
  return <div className="space-y-5">
    {Object.entries(grouped).map(([category, items]) => <Card key={category}><CardHeader><CardTitle className="text-lg">{categoryLabels[category] || category}</CardTitle><CardDescription>{items.filter((i) => i.satisfied).length}/{items.length} itens atendidos nesta categoria.</CardDescription></CardHeader><CardContent className="space-y-3">{items.map((row) => <RequirementEditor key={row.code} row={row} tenantId={tenantId} storeId={storeId} onSaved={onSaved} />)}</CardContent></Card>)}
  </div>;
}

function RequirementEditor({ row, tenantId, storeId, onSaved }: { row: ChecklistRow; tenantId: string; storeId: string; onSaved: () => void }) {
  const [status, setStatus] = useState(row.document_status || "missing");
  const [number, setNumber] = useState(row.document_number || "");
  const [issuer, setIssuer] = useState(row.issuer || "");
  const [protocol, setProtocol] = useState(row.protocol_number || "");
  const [issueDate, setIssueDate] = useState(row.issue_date || "");
  const [expiresAt, setExpiresAt] = useState(row.expires_at || "");
  const [verificationUrl, setVerificationUrl] = useState(row.verification_url || "");
  const [notes, setNotes] = useState(row.notes || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setStatus(row.document_status || "missing"); setNumber(row.document_number || ""); setIssuer(row.issuer || ""); setProtocol(row.protocol_number || ""); setIssueDate(row.issue_date || ""); setExpiresAt(row.expires_at || ""); setVerificationUrl(row.verification_url || ""); setNotes(row.notes || ""); }, [row.code,row.document_status,row.document_number,row.issuer,row.protocol_number,row.issue_date,row.expires_at,row.verification_url,row.notes]);

  const save = async (filePath?: string) => {
    setSaving(true);
    const { error } = await db.from("store_compliance_documents").upsert({
      tenant_id: tenantId,
      store_id: storeId,
      document_type: row.code,
      status,
      document_number: number || null,
      issuer: issuer || null,
      protocol_number: protocol || null,
      issue_date: issueDate || null,
      expires_at: expiresAt || null,
      verification_url: verificationUrl || null,
      notes: notes || null,
      file_path: filePath ?? row.file_path ?? null,
      verified_at: status === "valid" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,document_type" });
    setSaving(false);
    if (error) return toast.error(error.message || "Erro ao salvar documento.");
    toast.success(`${row.title} atualizado.`);
    onSaved();
  };

  const upload = async (file: File) => {
    setUploading(true);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${tenantId}/${storeId}/${row.code}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("store-compliance").upload(path, file, { upsert: false });
    if (error) { setUploading(false); return toast.error(error.message || "Falha ao anexar arquivo."); }
    setUploading(false);
    await save(path);
  };

  const openFile = async () => {
    if (!row.file_path) return;
    const { data, error } = await supabase.storage.from("store-compliance").createSignedUrl(row.file_path, 300);
    if (error || !data?.signedUrl) return toast.error("Não foi possível abrir o anexo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return <div className={`rounded-xl border p-4 ${row.satisfied ? "bg-emerald-50/40 dark:bg-emerald-950/10" : ""}`}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex gap-2 items-center flex-wrap"><h4 className="font-semibold">{row.title}</h4><Badge variant={row.satisfied ? "default" : row.blocking ? "destructive" : "secondary"}>{row.satisfied ? "Regular" : row.blocking ? "Obrigatório" : "Acompanhamento"}</Badge>{row.document_status === "inherited" && <Badge variant="outline">Herdado da matriz</Badge>}</div>
        <p className="text-xs text-muted-foreground mt-1">{row.legal_reference || "Requisito interno"}</p>
        {row.guidance && <p className="text-xs mt-1 max-w-3xl">{row.guidance}</p>}
      </div>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full lg:w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="missing">Não informado</SelectItem><SelectItem value="pending">Em andamento</SelectItem><SelectItem value="valid">Válido</SelectItem><SelectItem value="expired">Vencido</SelectItem><SelectItem value="rejected">Indeferido</SelectItem><SelectItem value="inherited">Herdado da matriz</SelectItem><SelectItem value="not_applicable">Não aplicável</SelectItem></SelectContent></Select>
    </div>
    <div className="grid gap-3 mt-4 md:grid-cols-2 lg:grid-cols-4">
      <Field label="Número / identificação" value={number} onChange={setNumber} />
      <Field label="Órgão emissor" value={issuer} onChange={setIssuer} />
      <Field label="Protocolo" value={protocol} onChange={setProtocol} />
      <Field label="Emissão" value={issueDate} onChange={setIssueDate} type="date" />
      <Field label="Validade" value={expiresAt} onChange={setExpiresAt} type="date" />
      <div className="lg:col-span-2"><Field label="Link oficial de consulta/validação" value={verificationUrl} onChange={setVerificationUrl} /></div>
      <Field label="Observações" value={notes} onChange={setNotes} />
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving}><Save className="h-4 w-4 mr-2" /> Salvar</Button>
      <label className="inline-flex"><input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} /><span className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium cursor-pointer hover:bg-accent"><Upload className="h-4 w-4 mr-2" />{uploading ? "Enviando..." : row.file_path ? "Substituir anexo" : "Anexar documento"}</span></label>
      {row.file_path && <Button size="sm" variant="ghost" onClick={openFile}><FileText className="h-4 w-4 mr-2" /> Ver anexo</Button>}
      {verificationUrl && <Button size="sm" variant="ghost" onClick={() => window.open(verificationUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="h-4 w-4 mr-2" /> Consultar órgão</Button>}
    </div>
  </div>;
}

function MetricCard({ icon: Icon, title, value, subtitle }: { icon: any; title: string; value: string | number; subtitle: string }) {
  return <Card><CardHeader className="pb-2"><div className="flex justify-between gap-2"><CardDescription>{title}</CardDescription><Icon className="h-5 w-5 text-primary" /></div><CardTitle className="text-2xl capitalize">{value}</CardTitle><p className="text-xs text-muted-foreground">{subtitle}</p></CardHeader></Card>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><Label className="text-sm leading-tight">{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>;
}

function SelectField({ label, value, onChange, options, allowEmpty }: { label: string; value: string; onChange: (v: string) => void; options: [string,string][]; allowEmpty?: boolean }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Select value={value || (allowEmpty ? "__empty" : undefined)} onValueChange={(v) => onChange(v === "__empty" ? "" : v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{allowEmpty && <SelectItem value="__empty">Não informado</SelectItem>}{options.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>;
}
