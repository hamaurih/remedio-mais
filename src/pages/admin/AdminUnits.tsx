import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
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
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [details, setDetails] = useState<StoreDetails[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StoreDetails | null>(null);

  const db = supabase as any;

  const loadStores = async () => {
    setLoading(true);
    const [summaryRes, detailsRes] = await Promise.all([
      db.from("store_inventory_summary").select("*").order("is_headquarters", { ascending: false }).order("store_name"),
      db.from("stores").select("id,tenant_id,name,code,legal_name,cnpj,address,latitude,longitude,phone,service_radius_km,preparation_minutes,fulfillment_priority,delivery_enabled,pickup_enabled,ecommerce_fulfillment_enabled,active,is_headquarters,store_type").order("is_headquarters", { ascending: false }).order("name"),
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
    setLoading(false);
  };

  const loadInventory = async () => {
    if (selectedStore === "all") {
      setInventory([]);
      return;
    }
    setInventoryLoading(true);
    let query = db
      .from("store_inventory_catalog")
      .select("product_id,product_name,sku,barcode,on_hand,reserved,available,minimum_stock")
      .eq("store_id", selectedStore)
      .order("available", { ascending: false })
      .limit(100);

    if (search.trim()) query = query.ilike("product_name", `%${search.trim()}%`);
    const { data, error } = await query;
    if (error) toast.error("Não foi possível consultar o estoque desta unidade.");
    setInventory((data || []).map((row: any) => ({
      ...row,
      on_hand: num(row.on_hand),
      reserved: num(row.reserved),
      available: num(row.available),
      minimum_stock: row.minimum_stock == null ? null : Number(row.minimum_stock),
    })));
    setInventoryLoading(false);
  };

  useEffect(() => { void loadStores(); }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void loadInventory(), 250);
    return () => window.clearTimeout(t);
  }, [selectedStore, search]);

  const totals = useMemo(() => stores.reduce((acc, store) => ({
    available: acc.available + store.available_units,
    reserved: acc.reserved + store.reserved_units,
    low: acc.low + store.low_stock_items,
  }), { available: 0, reserved: 0, low: 0 }), [stores]);

  const selectedDetails = details.find((s) => s.id === selectedStore) || null;

  const createBranch = async (form: { name: string; code: string; address: string; latitude: string; longitude: string; radius: string; prep: string }) => {
    const tenantId = stores[0]?.tenant_id || details[0]?.tenant_id;
    if (!tenantId) return toast.error("Tenant não identificado.");
    if (!form.name.trim()) return toast.error("Informe o nome da filial.");

    const payload = {
      tenant_id: tenantId,
      name: form.name.trim(),
      code: form.code.trim() || null,
      address: form.address.trim() || null,
      store_type: "branch",
      is_headquarters: false,
      active: true,
      delivery_enabled: true,
      pickup_enabled: true,
      ecommerce_fulfillment_enabled: true,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      service_radius_km: Number(form.radius || 18),
      preparation_minutes: Number(form.prep || 20),
      fulfillment_priority: 100,
    };
    const { error } = await db.from("stores").insert(payload);
    if (error) return toast.error(error.message || "Não foi possível criar a filial.");
    toast.success("Filial criada. Ela inicia sem estoque e pode receber mercadoria por compra ou transferência.");
    setCreateOpen(false);
    await loadStores();
  };

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
      ecommerce_fulfillment_enabled: store.ecommerce_fulfillment_enabled,
      active: store.active,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("stores").update(payload).eq("id", store.id);
    if (error) return toast.error(error.message || "Não foi possível salvar a unidade.");
    toast.success("Unidade atualizada.");
    setEditing(null);
    await loadStores();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Multiunidade</p>
          <h1 className="text-2xl md:text-3xl font-extrabold">Matriz e Filiais</h1>
          <p className="text-sm text-muted-foreground max-w-3xl mt-1">
            Consulte o estoque consolidado ou entre em cada unidade. O e-commerce poderá escolher automaticamente a loja que atende o carrinho completo com menor distância.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadStores()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <NewBranchDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createBranch} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Unidades ativas" value={stores.filter((s) => s.active).length} icon={Building2} />
        <Metric title="Estoque disponível" value={Math.round(totals.available).toLocaleString("pt-BR")} icon={Warehouse} />
        <Metric title="Unidades reservadas" value={Math.round(totals.reserved).toLocaleString("pt-BR")} icon={PackageSearch} />
        <Metric title="Itens em estoque mínimo" value={totals.low.toLocaleString("pt-BR")} icon={CircleAlert} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Visão por unidade</CardTitle>
              <CardDescription>Escolha “Todas” para gestão consolidada ou uma loja para abrir seu estoque.</CardDescription>
            </div>
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger className="w-full md:w-[280px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {store.is_headquarters ? "Matriz — " : "Filial — "}{store.store_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stores.map((store) => {
          const detail = details.find((d) => d.id === store.store_id);
          const locationReady = Boolean(detail?.latitude != null && detail?.longitude != null);
          return (
            <Card key={store.store_id} className={selectedStore === store.store_id ? "ring-2 ring-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    {store.is_headquarters ? <Building2 className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <Badge variant={store.is_headquarters ? "default" : "secondary"}>{store.is_headquarters ? "Matriz" : "Filial"}</Badge>
                    <Badge variant={store.active ? "outline" : "destructive"}>{store.active ? "Ativa" : "Inativa"}</Badge>
                  </div>
                </div>
                <CardTitle className="text-lg mt-2">{store.store_name}</CardTitle>
                <CardDescription>{store.code || "Sem código interno"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Mini label="Disponível" value={Math.round(store.available_units)} />
                  <Mini label="Reservado" value={Math.round(store.reserved_units)} />
                  <Mini label="Com estoque" value={store.items_with_stock} />
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" /> Raio {store.service_radius_km} km · preparo {store.preparation_minutes} min</div>
                  <div className="flex items-center gap-2">
                    {locationReady ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <MapPin className="h-3.5 w-3.5 text-amber-600" />}
                    {locationReady ? "Localização configurada" : "Localização ainda não configurada"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => setSelectedStore(store.store_id)}>Ver estoque</Button>
                  {detail && <Button size="sm" variant="outline" onClick={() => setEditing({ ...detail })}>Configurar</Button>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedStore !== "all" && (
        <Card>
          <CardHeader>
            <CardTitle>Estoque — {selectedDetails?.name || "Unidade"}</CardTitle>
            <CardDescription>Os primeiros 100 resultados são exibidos. Pesquise pelo nome para localizar um produto.</CardDescription>
            <div className="relative max-w-lg pt-2">
              <Search className="h-4 w-4 absolute left-3 top-5 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto nesta unidade..." />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU / EAN</TableHead><TableHead className="text-right">Físico</TableHead><TableHead className="text-right">Reservado</TableHead><TableHead className="text-right">Disponível</TableHead></TableRow></TableHeader>
                <TableBody>
                  {inventoryLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando estoque...</TableCell></TableRow>
                  ) : inventory.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado nesta unidade.</TableCell></TableRow>
                  ) : inventory.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium min-w-[260px]">{row.product_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.sku || row.barcode || "—"}</TableCell>
                      <TableCell className="text-right">{row.on_hand.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{row.reserved.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right font-semibold">{row.available.toLocaleString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {editing && <EditStoreDialog store={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={saveStore} />}
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: string | number; icon: any }) {
  return <Card><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription>{title}</CardDescription><Icon className="h-5 w-5 text-primary" /></div><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>;
}

function Mini({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-muted p-2"><div className="font-extrabold text-base">{value.toLocaleString("pt-BR")}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>;
}

function NewBranchDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (v: any) => void }) {
  const [form, setForm] = useState({ name: "", code: "", address: "", latitude: "", longitude: "", radius: "18", prep: "20" });
  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nova filial</Button></DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Adicionar filial</DialogTitle><DialogDescription>A filial começa com estoque zero. O saldo entra por recebimento, inventário ou transferência.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Nome da filial" value={form.name} onChange={(v) => set("name", v)} />
          <Field label="Código interno" value={form.code} onChange={(v) => set("code", v)} />
          <div className="sm:col-span-2"><Field label="Endereço" value={form.address} onChange={(v) => set("address", v)} /></div>
          <Field label="Latitude" value={form.latitude} onChange={(v) => set("latitude", v)} placeholder="Ex.: -7.2300000" />
          <Field label="Longitude" value={form.longitude} onChange={(v) => set("longitude", v)} placeholder="Ex.: -35.8800000" />
          <Field label="Raio de entrega (km)" value={form.radius} onChange={(v) => set("radius", v)} />
          <Field label="Tempo de preparo (min)" value={form.prep} onChange={(v) => set("prep", v)} />
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => onCreate(form)}>Criar filial</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStoreDialog({ store, onChange, onClose, onSave }: { store: StoreDetails; onChange: (v: StoreDetails) => void; onClose: () => void; onSave: (v: StoreDetails) => void }) {
  const patch = (key: keyof StoreDetails, value: any) => onChange({ ...store, [key]: value });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Configurar {store.is_headquarters ? "Matriz" : "Filial"}</DialogTitle><DialogDescription>Localização e disponibilidade serão usadas pelo futuro motor de roteamento do e-commerce.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Nome" value={store.name} onChange={(v) => patch("name", v)} />
          <Field label="Código" value={store.code || ""} onChange={(v) => patch("code", v)} />
          <div className="sm:col-span-2"><Field label="Endereço" value={store.address || ""} onChange={(v) => patch("address", v)} /></div>
          <Field label="Telefone" value={store.phone || ""} onChange={(v) => patch("phone", v)} />
          <Field label="Prioridade operacional" value={String(store.fulfillment_priority)} onChange={(v) => patch("fulfillment_priority", Number(v || 0))} />
          <Field label="Latitude" value={store.latitude == null ? "" : String(store.latitude)} onChange={(v) => patch("latitude", v ? Number(v) : null)} />
          <Field label="Longitude" value={store.longitude == null ? "" : String(store.longitude)} onChange={(v) => patch("longitude", v ? Number(v) : null)} />
          <Field label="Raio de entrega (km)" value={String(store.service_radius_km)} onChange={(v) => patch("service_radius_km", Number(v || 0))} />
          <Field label="Tempo de preparo (min)" value={String(store.preparation_minutes)} onChange={(v) => patch("preparation_minutes", Number(v || 0))} />
          <Toggle label="Ativa" checked={store.active} onChange={(v) => patch("active", v)} />
          <Toggle label="Atende delivery" checked={store.delivery_enabled} onChange={(v) => patch("delivery_enabled", v)} />
          <Toggle label="Permite retirada" checked={store.pickup_enabled} onChange={(v) => patch("pickup_enabled", v)} />
          <Toggle label="Pode receber pedidos do site" checked={store.ecommerce_fulfillment_enabled} onChange={(v) => patch("ecommerce_fulfillment_enabled", v)} />
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(store)}>Salvar unidade</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-lg border p-3"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>;
}
