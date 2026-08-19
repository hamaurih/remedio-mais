import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, CheckCircle2, FileCheck2, Plus, RefreshCw, ShieldAlert, Store } from "lucide-react";
import { toast } from "sonner";

type Unit = {
  id: string;
  name: string;
  code: string | null;
  cnpj: string | null;
  legal_name: string | null;
  address: string | null;
  active: boolean;
  is_headquarters: boolean;
  store_type: string;
  operation_status: string;
  compliance_status: string;
  compliance_enforced: boolean;
  ecommerce_fulfillment_enabled: boolean;
};

type ComplianceItem = { store_id: string; required: boolean; status: string; expiry_date: string | null };

export default function AdminUnits() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const db = supabase as any;
    const [unitRes, itemRes] = await Promise.all([
      db.from("stores").select("id,name,code,cnpj,legal_name,address,active,is_headquarters,store_type,operation_status,compliance_status,compliance_enforced,ecommerce_fulfillment_enabled").order("is_headquarters", { ascending: false }).order("created_at"),
      db.from("store_compliance_items").select("store_id,required,status,expiry_date"),
    ]);
    if (unitRes.error) toast.error("Não foi possível carregar Matriz e Filiais.");
    if (itemRes.error) toast.error("Não foi possível carregar o checklist regulatório.");
    setUnits(unitRes.data || []);
    setItems(itemRes.data || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => units.reduce((acc, u) => {
    acc.total += 1;
    if (u.is_headquarters) acc.matriz += 1; else acc.filiais += 1;
    if (u.compliance_status === "regular") acc.regulares += 1;
    return acc;
  }, { total: 0, matriz: 0, filiais: 0, regulares: 0 }), [units]);

  const progressFor = (storeId: string) => {
    const required = items.filter((i) => i.store_id === storeId && i.required);
    const regular = required.filter((i) => i.status === "regular" && (!i.expiry_date || new Date(`${i.expiry_date}T23:59:59`) >= new Date()));
    return { required: required.length, regular: regular.length, pct: required.length ? Math.round(regular.length / required.length * 100) : 0 };
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Estrutura empresarial</p>
          <h1 className="text-2xl md:text-3xl font-extrabold">Matriz e Filiais</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">Cadastre as unidades e mantenha o dossiê societário, fiscal, sanitário, CRF e ANVISA organizado dentro do sistema.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar</Button>
          <Button asChild><Link to="/admin/unidades/nova"><Plus className="h-4 w-4 mr-2" /> Cadastrar filial</Link></Button>
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="pt-5 flex gap-3 text-sm">
          <ShieldAlert className="h-5 w-5 text-amber-700 shrink-0" />
          <div><strong>Roteamento automático do e-commerce continua desligado.</strong> Esta etapa libera cadastro, documentação e regularização no painel oficial. Nenhuma filial nova receberá pedidos do site até a ativação operacional ser validada.</div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Unidades" value={summary.total} icon={Building2} />
        <Metric label="Matriz" value={summary.matriz} icon={Building2} />
        <Metric label="Filiais" value={summary.filiais} icon={Store} />
        <Metric label="Dossiê regular" value={summary.regulares} icon={CheckCircle2} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {units.map((unit) => {
          const progress = progressFor(unit.id);
          return (
            <Card key={unit.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">{unit.is_headquarters ? <Building2 className="h-5 w-5" /> : <Store className="h-5 w-5" />}</div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Badge variant={unit.is_headquarters ? "default" : "secondary"}>{unit.is_headquarters ? "Matriz" : "Filial"}</Badge>
                    <Badge variant={unit.active ? "outline" : "secondary"}>{unit.active ? "Ativa" : "Em legalização"}</Badge>
                  </div>
                </div>
                <CardTitle className="text-lg mt-2">{unit.name}</CardTitle>
                <CardDescription>{unit.cnpj || "CNPJ ainda não informado"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground min-h-10">{unit.address || "Endereço ainda não preenchido"}</div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5"><span>Regularização</span><strong>{progress.regular}/{progress.required} obrigatórios</strong></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} /></div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 text-xs">
                  <div className="flex items-center gap-2"><FileCheck2 className="h-4 w-4" /><span>Status do dossiê</span></div>
                  <strong>{unit.compliance_status === "regular" ? "Regular" : unit.compliance_status === "expired" ? "Documento vencido" : unit.compliance_enforced ? "Pendente" : "Legado em revisão"}</strong>
                </div>
                <Button asChild className="w-full"><Link to={`/admin/unidades/${unit.id}/regularizacao`}>Abrir regularização</Link></Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!loading && units.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma unidade cadastrada.</CardContent></Card>}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardDescription>{label}</CardDescription><Icon className="h-5 w-5 text-primary" /></div><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>;
}
