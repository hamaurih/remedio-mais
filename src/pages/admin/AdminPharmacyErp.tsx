import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Boxes,
  Building2,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  Landmark,
  PackageSearch,
  Pill,
  Plug,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type MigrationRow = {
  domain: string;
  migration_state: "external_primary" | "shadow" | "dual_write" | "internal_primary" | "building" | "retired";
  external_provider: string | null;
  notes: string | null;
  updated_at: string;
};

type Metric = {
  products: number;
  prices: number;
  balances: number;
  suppliers: number;
  purchaseOrders: number;
  fiscalDocuments: number;
  regulatoryPending: number;
};

const LABELS: Record<string, string> = {
  catalog: "Catálogo",
  inventory: "Estoque",
  pricing: "Preços",
  orders: "Pedidos",
  payments: "Pagamentos",
  prescriptions: "Receitas",
  pos: "PDV",
  fiscal: "NF-e / NFC-e",
  sngpc: "SNGPC",
  sncr: "SNCR",
};

const ICONS: Record<string, any> = {
  catalog: PackageSearch,
  inventory: Boxes,
  pricing: ReceiptText,
  orders: ShoppingCart,
  payments: Landmark,
  prescriptions: Pill,
  pos: Building2,
  fiscal: FileCheck2,
  sngpc: ShieldCheck,
  sncr: ShieldCheck,
};

const STATE: Record<MigrationRow["migration_state"], { label: string; className: string; progress: number }> = {
  external_primary: { label: "Ainda depende do ERP", className: "bg-red-100 text-red-800 border-red-200", progress: 15 },
  building: { label: "Em construção", className: "bg-amber-100 text-amber-800 border-amber-200", progress: 30 },
  shadow: { label: "Nosso sistema em paralelo", className: "bg-blue-100 text-blue-800 border-blue-200", progress: 55 },
  dual_write: { label: "Dupla gravação", className: "bg-violet-100 text-violet-800 border-violet-200", progress: 75 },
  internal_primary: { label: "Nosso sistema é principal", className: "bg-emerald-100 text-emerald-800 border-emerald-200", progress: 95 },
  retired: { label: "ERP externo desligado", className: "bg-emerald-600 text-white border-emerald-600", progress: 100 },
};

export default function AdminPharmacyErp() {
  const [rows, setRows] = useState<MigrationRow[]>([]);
  const [metrics, setMetrics] = useState<Metric>({
    products: 0,
    prices: 0,
    balances: 0,
    suppliers: 0,
    purchaseOrders: 0,
    fiscalDocuments: 0,
    regulatoryPending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const db = supabase as any;

    const [status, products, prices, balances, suppliers, purchases, fiscal, regulatory] = await Promise.all([
      db.from("saas_migration_status").select("domain,migration_state,external_provider,notes,updated_at").order("domain"),
      db.from("tenant_products").select("product_id", { count: "exact", head: true }),
      db.from("store_product_prices").select("product_id", { count: "exact", head: true }),
      db.from("inventory_balances").select("product_id", { count: "exact", head: true }),
      db.from("suppliers").select("id", { count: "exact", head: true }),
      db.from("purchase_orders").select("id", { count: "exact", head: true }),
      db.from("fiscal_documents").select("id", { count: "exact", head: true }),
      db.from("regulatory_submissions").select("id", { count: "exact", head: true }).in("status", ["pending", "retry", "sending"]),
    ]);

    if (status.error) {
      setError("A Central ERP ainda não está disponível neste ambiente. Use a homologação do novo backend.");
      setRows([]);
    } else {
      setRows((status.data || []) as MigrationRow[]);
    }

    setMetrics({
      products: products.count || 0,
      prices: prices.count || 0,
      balances: balances.count || 0,
      suppliers: suppliers.count || 0,
      purchaseOrders: purchases.count || 0,
      fiscalDocuments: fiscal.count || 0,
      regulatoryPending: regulatory.count || 0,
    });
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const independence = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round(rows.reduce((sum, r) => sum + STATE[r.migration_state].progress, 0) / rows.length);
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">ERP Farmacêutico próprio</p>
          <h1 className="text-2xl md:text-3xl font-extrabold">Central do Ecossistema</h1>
          <p className="text-sm text-muted-foreground max-w-3xl mt-1">
            Acompanhe a migração módulo a módulo. O Trier fica como conector temporário até cada domínio estar validado e apto a operar sozinho.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <Plug className="h-4 w-4" />
          <AlertTitle>Backend de homologação necessário</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>Independência estimada</CardDescription>
            <CardTitle className="text-4xl">{independence}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${independence}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Percentual técnico por estágio dos módulos, não um indicador regulatório.</p>
          </CardContent>
        </Card>

        <MetricCard title="Produtos próprios" value={metrics.products} icon={PackageSearch} />
        <MetricCard title="Saldos por loja" value={metrics.balances} icon={Boxes} />
        <MetricCard title="Preços por loja" value={metrics.prices} icon={ReceiptText} />
      </div>

      <div>
        <h2 className="font-extrabold text-lg mb-3">Migração por domínio</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const cfg = STATE[row.migration_state];
            const Icon = ICONS[row.domain] || CircleDashed;
            const finished = row.migration_state === "internal_primary" || row.migration_state === "retired";
            return (
              <Card key={row.domain} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
                  </div>
                  <CardTitle className="text-lg mt-2 flex items-center gap-2">
                    {LABELS[row.domain] || row.domain}
                    {finished && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  </CardTitle>
                  <CardDescription>{row.notes}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${cfg.progress}%` }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-2">
                    {row.external_provider ? `Conector atual: ${row.external_provider}` : "Sem ERP externo como fonte principal"}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="font-extrabold text-lg mb-3">Módulos próprios já estruturados</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleCard icon={Truck} title="Fornecedores e Compras" description={`${metrics.suppliers} fornecedores · ${metrics.purchaseOrders} pedidos de compra`} />
          <ModuleCard icon={Boxes} title="Recebimento e Lotes" description="Entrada por lote, validade, custo e ledger de estoque." />
          <ModuleCard icon={ShieldCheck} title="Regulatório" description={`${metrics.regulatoryPending} transmissões SNGPC/SNCR pendentes na fila.`} />
          <ModuleCard icon={FileCheck2} title="Fiscal" description={`${metrics.fiscalDocuments} documentos NF-e/NFC-e na base própria.`} />
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Regra de corte</AlertTitle>
        <AlertDescription>
          Nenhum módulo muda para “ERP externo desligado” sem reconciliação, teste E2E, trilha de auditoria e plano de rollback. O site continua vendendo durante toda a migração.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon }: { title: string; value: number; icon: any }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{title}</CardDescription>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-2xl">{value.toLocaleString("pt-BR")}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ModuleCard({ title, description, icon: Icon }: { title: string; description: string; icon: any }) {
  return (
    <Card>
      <CardHeader>
        <Icon className="h-6 w-6 text-primary mb-1" />
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
