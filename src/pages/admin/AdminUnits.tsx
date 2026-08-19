import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  MapPin,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";

type StoreSummary = {
  tenant_id: string;
  store_id: string;
  store_name: string;
  code: string | null;
  store_type: "headquarters" | "branch" | "distribution_center";
  is_headquarters: boolean;
  active: boolean;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  ecommerce_fulfillment_enabled: boolean;
  service_radius_km: number;
  fulfillment_priority: number;
  preparation_minutes: number;
  catalog_items: number;
  items_with_stock: number;
  low_stock_items: number;
  total_units: number;
  reserved_units: number;
  available_units: number;
};

type StoreDetails = {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  legal_name: string | null;
  cnpj: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  service_radius_km: number;
  preparation_minutes: number;
  fulfillment_priority: number;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  ecommerce_fulfillment_enabled: boolean;
  active: boolean;
  is_headquarters: boolean;
  store_type: string;
  operation_status: string;
  compliance_enforced: boolean;
};

type ComplianceSummary = {
  store_id: string;
  missing_count: number;
  compliance_status: string;
  missing_requirements: string[];
};

type InventoryRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  minimum_stock: number | null;
};

const num = (value: unknown) => Number(value || 0);

export default function AdminUnits() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [details, setDetails] = useState<StoreDetails[]>([]);
  const [compliance, setCompliance] = useState<Record<string, ComplianceSummary>>({});
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [editing, setEditing] = useState<StoreDetails | null>(null);
  const db = supabase as any;

  const loadStores = async () => {
    setLoading(true);
    const [summaryRes, detailsRes, complianceRes] = await Promise.all([
      db.from("store_inventory_summary").select("*").order("is_headquarters", { ascending: false }).order("store_name"),
      db.from("stores").select("id,tenant_id,name,code,legal_name,cnpj,address,latitude,longitude,phone,service_radius_km,preparation_minutes,fulfillment_priority,delivery_enabled,pickup_enabled,ecommerce_fulfillment_enabled,active,is_headquarters,store_type,operation_status,compliance_enforced").order("is_headquarters", { ascending: false }).order("name"),
      db.from("store_compliance_readiness").select("store_id,missing_count,compliance_status,missing_requirements"),
    ]);
    if (summaryRes.error) toast.error("Não foi possível carregar o resumo das unidades.");
    if (detailsRes.error) toast.error("Não foi possível carregar os dados das unidades.");

    setStores((summaryRes.data || []).map((row: any) => ({
      ...row,
      service_radius_km: num(row.service_radius_km),
      fulfillment_priority: num(row.fulfillment_priority),
      preparation_minutes: num(row.preparation_minutes),
      catalog_items: num(row.catalog_items),
      items_with_stock: num(row.items_with_stock),
      low_stock_items: num(row.low_stock_items),
      total_units: num(row.total_units),
      reserved_units: num(row.reserved_units),
      available_units: num(row.available_units),
    })));
    setDetails((detailsRes.data || []).map((row: any) => ({
      ...row,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      service_radius_km: num(row.service_radius_km),
      preparation_minutes: num(row.preparation_minutes),
      fulfillment_priority: num(row.fulfillment_priority),
    })));
    const map: Record<string, ComplianceSummary> = {};
    for (const row of complianceRes.data || []) map[row.store_id] = { ...row, missing_count: num(row.missing_count) };
    setCompliance(map);
    setLoading(false);
  };

  const loadInventory = async () => {
    if (selectedStore === "all") { setInventory([]); return; }
    setInventoryLoading(true);
    let query = db.from("store_inventory_catalog").select("product_id,product_name,sku,barcode,on_hand,reserved,available,minimum_stock").eq("store_id", selectedStore).order("available", { ascending: false }).limit(100);
    if (search.trim()) query = query.ilike("product_name", `%${search.trim()}%`);
    const { data, error } = await query;
    if (error) toast.error("Não foi possível consultar o estoque desta unidade.");
    setInventory((data || []).map((row: any) => ({ ...row, on_hand: num(row.on_hand), reserved: num(row.reserved), available: num(row.available), minimum_stock: row.minimum_stock == null ? null : Number(row.minimum_stock) })));
    setInventoryLoading(false);
  };

  useEffect(() => { void loadStores(); }, []);
  useEffect(() => { const t = window.setTimeout(() => void loadInventory(), 250); return () => window.clearTimeout(t); }, [selectedStore, search]);

  const totals = useMemo(() => stores.reduce((acc, store) => ({ available: acc.available + store.available_units, reserved: acc.reserved + store.reserved_units, low: acc.low + store.low_stock_items }), { available: 0, reserved: 0, low: 0 }), [stores]);
  const selectedDetails = details.find((s) => s.id === selectedStore) || null;
  const regularizationCount = details.filter((d) => d.compliance_enforced && (compliance[d.id]?.missing_count || 0) > 0).length;

  const saveStore = async (store: StoreDetails) => {
    const payload = {
      name: store.name,
      code: store.code || null,
      address: store.address || null,
      phone: store.phone || null,
      latitude: store.latitude,
      longitude: store.longitude,
      service_radius_km: store.service_radius_km,
      preparation_minutes: store.preparation_minutes,
      fulfillment_priority: store.fulfillment_priority,
      delivery_enabled: store.delivery_enabled,
      pickup_enabled: store.pickup_enabled,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("stores").update(payload).eq("id", store.id);
    if (error) return toast.error(error.message || "Não foi possível salvar a unidade.");
    toast.success("Configuração logística atualizada.");
    setEditing(null);
    await loadStores();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Multiunidade + Compliance</p>
          <h1 className="text-2xl md:text-3xl font-extrabold">Matriz e Filiais</h1>
          <p className="text-sm text-muted-foreground max-w-3xl mt-1">Gestão consolidada com estoque separado por unidade e dossiê legal, fiscal, sanitário, ANVISA e CRF por estabelecimento.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => void loadStores()} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar</Button>
          <Button onClick={() => navigate("/admin/unidades/nova")}><Plus className="h-4 w-4 mr-2" /> Cadastrar filial legalmente</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric title="Unidades ativas" value={stores.filter((s) => s.active).length} icon={Building2} />
        <Metric title="Em legalização" value={regularizationCount} icon={ClipboardCheck} />
        <Metric title="Estoque disponível" value={Math.round(totals.available).toLocaleString("pt-BR")} icon={Warehouse} />
        <Metric title="Reservado" value={Math.round(totals.reserved).toLocaleString("pt-BR")} icon={PackageSearch} />
        <Metric title="Estoque mínimo" value={totals.low.toLocaleString("pt-BR")} icon={CircleAlert} />
      </div>

      <Card><CardHeader className="pb-3"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>Visão por unidade</CardTitle><CardDescription>Escolha todas para gestão consolidada ou uma loja para consultar seu estoque físico.</CardDescription></div><Select value={selectedStore} onValueChange={setSelectedStore}><SelectTrigger className="w-full md:w-[280px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as unidades</SelectItem>{stores.map((store) => <SelectItem key={store.store_id} value={store.store_id}>{store.is_headquarters ? "Matriz — " : "Filial — "}{store.store_name}</SelectItem>)}</SelectContent></Select></div></CardHeader></Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stores.map((unit) => {
          const detail = details.find((d) => d.id === unit.store_id);
          const complianceRow = compliance[unit.store_id];
          const locationReady = Boolean(detail?.latitude != null && detail?.longitude != null);
          const missing = complianceRow?.missing_count ?? 1;
          const legacy = detail && !detail.compliance_enforced;
          return <Card key={unit.store_id} className={selectedStore === unit.store_id ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3"><div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">{unit.is_headquarters ? <Building2 className="h-5 w-5" /> : <Store className="h-5 w-5" />}</div><div className="flex gap-1 flex-wrap justify-end"><Badge variant={unit.is_headquarters ? "default" : "secondary"}>{unit.is_headquarters ? "Matriz" : "Filial"}</Badge><Badge variant={unit.active ? "outline" : "secondary"}>{unit.active ? "Ativa" : "Inativa"}</Badge></div></div>
              <CardTitle className="text-lg mt-2">{unit.store_name}</CardTitle>
              <CardDescription>{detail?.cnpj || unit.code || "CNPJ ainda não cadastrado"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center"><Mini label="Disponível" value={Math.round(unit.available_units)} /><Mini label="Reservado" value={Math.round(unit.reserved_units)} /><Mini label="Com estoque" value={unit.items_with_stock} /></div>
              <div className="space-y-2 text-xs text-muted-foreground"><div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" /> Raio {unit.service_radius_km} km · preparo {unit.preparation_minutes} min</div><div className="flex items-center gap-2">{locationReady ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <MapPin className="h-3.5 w-3.5 text-amber-600" />}{locationReady ? "Localização configurada" : "Localização ainda não configurada"}</div></div>
              <div className={`rounded-lg border p-3 text-xs ${missing === 0 && !legacy ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"}`}>
                <div className="font-semibold flex items-center gap-2">{missing === 0 && !legacy ? <BadgeCheck className="h-4 w-4 text-emerald-600" /> : <ClipboardCheck className="h-4 w-4 text-amber-600" />}{legacy ? "Dossiê regulatório ainda não aplicado" : missing === 0 ? "Regularização concluída" : `${missing} pendência(s) para operar`}</div>
              </div>
              <div className="flex gap-2 flex-wrap"><Button size="sm" onClick={() => setSelectedStore(unit.store_id)}>Ver estoque</Button>{detail && <Button size="sm" variant="outline" onClick={() => setEditing({ ...detail })}>Logística</Button>}<Button size="sm" variant="secondary" onClick={() => navigate(`/admin/unidades/${unit.store_id}/regularizacao`)}>Regularização</Button></div>
            </CardContent>
          </Card>;
        })}
      </div>

      {selectedStore !== "all" && <Card><CardHeader><CardTitle>Estoque — {selectedDetails?.name || "Unidade"}</CardTitle><CardDescription>Os primeiros 100 resultados são exibidos. Pesquise pelo nome para localizar um produto.</CardDescription><div className="relative max-w-lg pt-2"><Search className="h-4 w-4 absolute left-3 top-5 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto nesta unidade..." /></div></CardHeader><CardContent><div className="rounded-md border overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU / EAN</TableHead><TableHead className="text-right">Físico</TableHead><TableHead className="text-right">Reservado</TableHead><TableHead className="text-right">Disponível</TableHead></TableRow></TableHeader><TableBody>{inventoryLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando estoque...</TableCell></TableRow> : inventory.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado nesta unidade.</TableCell></TableRow> : inventory.map((row) => <TableRow key={row.product_id}><TableCell className="font-medium min-w-[260px]">{row.product_name}</TableCell><TableCell className="text-xs text-muted-foreground">{row.sku || row.barcode || "—"}</TableCell><TableCell className="text-right">{row.on_hand.toLocaleString("pt-BR")}</TableCell><TableCell className="text-right">{row.reserved.toLocaleString("pt-BR")}</TableCell><TableCell className="text-right font-semibold">{row.available.toLocaleString("pt-BR")}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>}

      {editing && <EditStoreDialog store={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={saveStore} />}
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: string | number; icon: any }) { return <Card><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription>{title}</CardDescription><Icon className="h-5 w-5 text-primary" /></div><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>; }
function Mini({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-muted p-2"><div className="font-extrabold text-base">{value.toLocaleString("pt-BR")}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>; }

function EditStoreDialog({ store, onChange, onClose, onSave }: { store: StoreDetails; onChange: (v: StoreDetails) => void; onClose: () => void; onSave: (v: StoreDetails) => void }) {
  const patch = (key: keyof StoreDetails, value: any) => onChange({ ...store, [key]: value });
  return <Dialog open onOpenChange={(v) => !v && onClose()}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Configuração logística — {store.name}</DialogTitle><DialogDescription>Ativação legal, fiscal e sanitária é feita somente no dossiê de regularização.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Nome operacional" value={store.name} onChange={(v) => patch("name", v)} /><Field label="Código" value={store.code || ""} onChange={(v) => patch("code", v)} /><div className="sm:col-span-2"><Field label="Endereço resumido" value={store.address || ""} onChange={(v) => patch("address", v)} /></div><Field label="Telefone" value={store.phone || ""} onChange={(v) => patch("phone", v)} /><Field label="Prioridade operacional" value={String(store.fulfillment_priority)} onChange={(v) => patch("fulfillment_priority", Number(v || 0))} /><Field label="Latitude" value={store.latitude == null ? "" : String(store.latitude)} onChange={(v) => patch("latitude", v ? Number(v) : null)} /><Field label="Longitude" value={store.longitude == null ? "" : String(store.longitude)} onChange={(v) => patch("longitude", v ? Number(v) : null)} /><Field label="Raio de entrega (km)" value={String(store.service_radius_km)} onChange={(v) => patch("service_radius_km", Number(v || 0))} /><Field label="Tempo de preparo (min)" value={String(store.preparation_minutes)} onChange={(v) => patch("preparation_minutes", Number(v || 0))} /><Toggle label="Atende delivery" checked={store.delivery_enabled} onChange={(v) => patch("delivery_enabled", v)} /><Toggle label="Permite retirada" checked={store.pickup_enabled} onChange={(v) => patch("pickup_enabled", v)} /></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(store)}>Salvar logística</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) { return <div className="space-y-1.5"><Label>{label}</Label><Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return <div className="flex items-center justify-between rounded-lg border p-3"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>; }
