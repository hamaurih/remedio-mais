import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, ImageOff, PackageCheck, Search, Sparkles, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

type ProductRow = {
  id: string;
  name: string | null;
  image_url: string | null;
  manufacturer: string | null;
  laboratory: string | null;
  barcode: string | null;
  trier_product_id: string | null;
  price: number | null;
  promo_price: number | null;
  whatsapp_price: number | null;
  whatsapp_promo_price: number | null;
  stock: number | null;
  stock_quantity: number | null;
  active: boolean | null;
  archived_at: string | null;
  manual_disabled: boolean | null;
  trier_active: boolean | null;
  department_name: string | null;
  category_name: string | null;
};

type AICatalogItem = {
  sku: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  stock: number;
  brand: string;
  barcode: string;
  department: string;
  category: string;
  active: true;
};

const PAGE_SIZE = 1000;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value: unknown): number | null {
  const n = num(value);
  return n != null && n > 0 ? n : null;
}

function effectiveAIPrice(p: ProductRow): number | null {
  const base = positive(p.price);
  const generalPromo = positive(p.promo_price);
  const aiPrice = positive(p.whatsapp_price);
  const aiPromo = positive(p.whatsapp_promo_price);

  if (aiPromo != null && (aiPrice == null || aiPromo < aiPrice)) return aiPromo;
  if (aiPrice != null) return aiPrice;
  if (generalPromo != null && (base == null || generalPromo < base)) return generalPromo;
  return base;
}

function effectiveStock(p: ProductRow): number {
  return Math.max(Number(p.stock || 0), Number(p.stock_quantity || 0), 0);
}

function toCatalogItem(p: ProductRow): AICatalogItem | null {
  const price = effectiveAIPrice(p);
  const stock = effectiveStock(p);
  const name = String(p.name || "").trim();
  if (!name || !price || price <= 0 || stock <= 0 || p.active !== true || p.archived_at || p.manual_disabled === true || p.trier_active === false) return null;

  const brand = String(p.manufacturer || p.laboratory || "").trim();
  const sku = String(p.trier_product_id || p.barcode || p.id).trim();
  const description = [brand ? `Marca/Laboratório: ${brand}` : "", p.category_name ? `Categoria: ${p.category_name}` : ""]
    .filter(Boolean)
    .join(" · ");

  return {
    sku,
    name,
    description,
    price: Number(price.toFixed(2)),
    image_url: String(p.image_url || "").trim(),
    stock: Math.floor(stock),
    brand,
    barcode: String(p.barcode || "").trim(),
    department: String(p.department_name || "").trim(),
    category: String(p.category_name || "").trim(),
    active: true,
  };
}

async function fetchEligibleProducts(): Promise<ProductRow[]> {
  const rows: ProductRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase as any)
      .from("products")
      .select("id,name,image_url,manufacturer,laboratory,barcode,trier_product_id,price,promo_price,whatsapp_price,whatsapp_promo_price,stock,stock_quantity,active,archived_at,manual_disabled,trier_active,department_name,category_name")
      .eq("active", true)
      .is("archived_at", null)
      .order("name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const batch = (data || []) as ProductRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminAICatalog() {
  const [search, setSearch] = useState("");
  const [onlyWithImage, setOnlyWithImage] = useState(false);

  const query = useQuery({
    queryKey: ["admin-ai-catalog"],
    queryFn: fetchEligibleProducts,
    staleTime: 60_000,
  });

  const catalog = useMemo(() => (query.data || []).map(toCatalogItem).filter(Boolean) as AICatalogItem[], [query.data]);
  const withImage = useMemo(() => catalog.filter((p) => !!p.image_url).length, [catalog]);
  const withoutImage = catalog.length - withImage;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((p) => {
      if (onlyWithImage && !p.image_url) return false;
      if (!q) return true;
      return [p.name, p.sku, p.barcode, p.brand, p.department, p.category].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [catalog, search, onlyWithImage]);

  const exportRows = useMemo(() => onlyWithImage ? catalog.filter((p) => !!p.image_url) : catalog, [catalog, onlyWithImage]);

  const exportCSV = () => {
    if (!exportRows.length) return toast.error("Nenhum produto disponível para exportar.");
    const headers = ["sku", "name", "description", "price", "image_url", "stock", "brand", "barcode", "department", "category", "active"];
    const lines = [headers.join(",")];
    for (const p of exportRows) {
      lines.push([
        p.sku,
        p.name,
        p.description,
        p.price.toFixed(2),
        p.image_url,
        p.stock,
        p.brand,
        p.barcode,
        p.department,
        p.category,
        "true",
      ].map(csvEscape).join(","));
    }
    downloadBlob("\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8", `catalogo-ia-aes-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`${exportRows.length.toLocaleString("pt-BR")} produtos exportados em CSV.`);
  };

  const exportJSON = () => {
    if (!exportRows.length) return toast.error("Nenhum produto disponível para exportar.");
    downloadBlob(JSON.stringify(exportRows, null, 2), "application/json;charset=utf-8", `catalogo-ia-aes-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success(`${exportRows.length.toLocaleString("pt-BR")} produtos exportados em JSON.`);
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold">Catálogo da IA</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Exportação limpa para o catálogo do agente A&S Business. Entram somente produtos ativos, não bloqueados, com estoque e preço válidos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportJSON} disabled={query.isLoading || !exportRows.length}>
            <FileJson className="h-4 w-4 mr-2" /> Exportar JSON
          </Button>
          <Button onClick={exportCSV} disabled={query.isLoading || !exportRows.length}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar CSV para A&S
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Produtos disponíveis para IA</CardTitle></CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-3xl font-extrabold">{query.isLoading ? "—" : catalog.length.toLocaleString("pt-BR")}</div>
            <PackageCheck className="h-7 w-7 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Com foto</CardTitle></CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-3xl font-extrabold">{query.isLoading ? "—" : withImage.toLocaleString("pt-BR")}</div>
            <Download className="h-7 w-7 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Sem foto</CardTitle></CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-3xl font-extrabold">{query.isLoading ? "—" : withoutImage.toLocaleString("pt-BR")}</div>
            <ImageOff className="h-7 w-7 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome, código, marca, categoria..." className="pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={onlyWithImage} onCheckedChange={(v) => setOnlyWithImage(v === true)} />
              Exportar somente produtos com foto
            </label>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Regra do preço da IA:</strong> promoção IA/WhatsApp → preço IA/WhatsApp → promoção geral → preço normal. O preço do site e o preço do balcão não são misturados no arquivo.
          </div>

          {query.isError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar o catálogo: {(query.error as Error)?.message || "erro desconhecido"}
            </div>
          )}

          <div className="overflow-auto border rounded-lg max-h-[58vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b z-10">
                <tr className="text-left">
                  <th className="p-3 min-w-[280px]">Produto</th>
                  <th className="p-3">Código</th>
                  <th className="p-3">Marca/Lab.</th>
                  <th className="p-3 text-right">Preço IA</th>
                  <th className="p-3 text-right">Estoque</th>
                  <th className="p-3">Foto</th>
                </tr>
              </thead>
              <tbody>
                {query.isLoading ? (
                  <tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>Carregando produtos elegíveis...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>Nenhum produto encontrado com esses filtros.</td></tr>
                ) : filtered.slice(0, 500).map((p) => (
                  <tr key={p.sku} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.sku}</td>
                    <td className="p-3">{p.brand || "—"}</td>
                    <td className="p-3 text-right font-semibold">R$ {p.price.toFixed(2).replace(".", ",")}</td>
                    <td className="p-3 text-right">{p.stock}</td>
                    <td className="p-3">{p.image_url ? <Badge variant="secondary">Com foto</Badge> : <Badge variant="outline">Sem foto</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 500 && <p className="text-xs text-muted-foreground">Pré-visualização limitada aos primeiros 500 itens. A exportação inclui todos os {exportRows.length.toLocaleString("pt-BR")} produtos elegíveis.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
