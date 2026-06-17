import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type IssueKey =
  | "no_barcode"
  | "no_image"
  | "no_category"
  | "no_price"
  | "no_manufacturer"
  | "no_description"
  | "no_sku"
  | "no_trier_id"
  | "stock_pos_inactive"
  | "active_no_stock";

const ISSUES: { key: IssueKey; label: string; description: string; apply: (q: any) => any }[] = [
  { key: "no_barcode", label: "Sem código de barras (EAN)", description: "barcode é null ou vazio", apply: (q) => q.or("barcode.is.null,barcode.eq.") },
  { key: "no_image", label: "Sem imagem", description: "image_url é null ou vazio", apply: (q) => q.or("image_url.is.null,image_url.eq.") },
  { key: "no_category", label: "Sem categoria", description: "category_id é null", apply: (q) => q.is("category_id", null) },
  { key: "no_price", label: "Sem preço (price <= 0)", description: "preço zerado ou nulo", apply: (q) => q.or("price.is.null,price.eq.0") },
  { key: "no_manufacturer", label: "Sem fabricante", description: "manufacturer é null ou vazio", apply: (q) => q.or("manufacturer.is.null,manufacturer.eq.") },
  { key: "no_description", label: "Sem descrição", description: "description é null ou vazio", apply: (q) => q.or("description.is.null,description.eq.") },
  { key: "no_sku", label: "Sem SKU", description: "sku é null ou vazio", apply: (q) => q.or("sku.is.null,sku.eq.") },
  { key: "no_trier_id", label: "Sem ID Trier", description: "trier_product_id é null", apply: (q) => q.is("trier_product_id", null) },
  { key: "stock_pos_inactive", label: "Estoque > 0 mas inativo", description: "estão fora do site mesmo com estoque", apply: (q) => q.gt("stock", 0).eq("active", false) },
  { key: "active_no_stock", label: "Ativo sem estoque", description: "aparecem no site mas sem estoque", apply: (q) => q.eq("active", true).lte("stock", 0) },
];

function useIssueCount(key: IssueKey, onlyWithStock: boolean) {
  return useQuery({
    queryKey: ["dq_count", key, onlyWithStock],
    queryFn: async () => {
      const issue = ISSUES.find((i) => i.key === key)!;
      let q = supabase.from("products").select("*", { count: "exact", head: true });
      q = issue.apply(q);
      if (onlyWithStock && key !== "stock_pos_inactive" && key !== "active_no_stock") q = q.gt("stock", 0);
      const { count, error } = await q;
      if (error) return -1;
      return count ?? 0;
    },
  });
}

export default function AdminDataQuality() {
  const [selected, setSelected] = useState<IssueKey>("no_barcode");
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [search, setSearch] = useState("");

  const list = useQuery({
    queryKey: ["dq_list", selected, onlyWithStock, search],
    queryFn: async () => {
      const issue = ISSUES.find((i) => i.key === selected)!;
      let q = supabase
        .from("products")
        .select("id,slug,name,sku,barcode,image_url,price,stock,active,manufacturer,category_id,trier_product_id,description")
        .order("stock", { ascending: false })
        .limit(500);
      q = issue.apply(q);
      if (onlyWithStock && selected !== "stock_pos_inactive" && selected !== "active_no_stock") q = q.gt("stock", 0);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const exportCsv = async () => {
    if (!list.data || list.data.length === 0) return;
    const header = ["id", "trier_product_id", "sku", "barcode", "name", "manufacturer", "price", "stock", "active", "has_image"];
    const csv = [
      header.join(","),
      ...list.data.map((r: any) =>
        [
          r.id,
          r.trier_product_id ?? "",
          r.sku ?? "",
          r.barcode ?? "",
          `"${String(r.name ?? "").replace(/"/g, '""')}"`,
          `"${String(r.manufacturer ?? "").replace(/"/g, '""')}"`,
          r.price ?? 0,
          r.stock ?? 0,
          r.active ? "1" : "0",
          r.image_url ? "1" : "0",
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qualidade-${selected}${onlyWithStock ? "-com-estoque" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exportados ${list.data.length} produtos`, description: a.download });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-extrabold">Qualidade de Dados</h1>
        <p className="text-sm text-muted-foreground">
          Veja exatamente quais produtos têm dados faltando (EAN, imagem, categoria, preço, etc) para você ir corrigindo aos poucos.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {ISSUES.map((i) => (
          <IssueCard key={i.key} issue={i} active={selected === i.key} onClick={() => setSelected(i.key)} onlyWithStock={onlyWithStock} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{ISSUES.find((i) => i.key === selected)?.label}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{ISSUES.find((i) => i.key === selected)?.description}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Buscar por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
              <Button
                variant={onlyWithStock ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyWithStock((v) => !v)}
                disabled={selected === "stock_pos_inactive" || selected === "active_no_stock"}
              >
                {onlyWithStock ? "✓ Só com estoque" : "Só com estoque"}
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!list.data?.length}>
                <Download className="h-4 w-4 mr-1" /> Exportar CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : !list.data?.length ? (
            <div className="text-sm text-emerald-700 font-semibold">Nenhum produto com este problema 🎉</div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-3">
                Mostrando {list.data.length} produto(s){list.data.length === 500 ? " (limite de 500 — refine com busca ou exporte CSV para ver todos)" : ""}.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-2">Foto</th>
                      <th className="py-2 pr-2">Nome</th>
                      <th className="py-2 pr-2">SKU</th>
                      <th className="py-2 pr-2">EAN</th>
                      <th className="py-2 pr-2">Trier</th>
                      <th className="py-2 pr-2">Preço</th>
                      <th className="py-2 pr-2">Estoque</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((p: any) => (
                      <tr key={p.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-2">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="w-10 h-10 object-contain rounded border" />
                          ) : (
                            <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
                              <AlertCircle className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2 font-medium max-w-[280px] truncate" title={p.name}>{p.name}</td>
                        <td className="py-2 pr-2 font-mono text-xs">{p.sku || <span className="text-destructive">—</span>}</td>
                        <td className="py-2 pr-2 font-mono text-xs">{p.barcode || <span className="text-destructive">—</span>}</td>
                        <td className="py-2 pr-2 font-mono text-xs">{p.trier_product_id || <span className="text-destructive">—</span>}</td>
                        <td className="py-2 pr-2 tabular-nums">{p.price ? `R$ ${Number(p.price).toFixed(2)}` : <span className="text-destructive">—</span>}</td>
                        <td className="py-2 pr-2 tabular-nums">{p.stock ?? 0}</td>
                        <td className="py-2 pr-2">
                          {p.active ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <Link to={`/admin/produtos?search=${encodeURIComponent(p.name)}`}>
                              <Button size="sm" variant="ghost">Editar</Button>
                            </Link>
                            {p.slug && (
                              <a href={`/produto/${p.slug}`} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Como usar</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. Clique em um dos cards acima para filtrar os produtos com aquele problema.</p>
          <p>2. Use <strong>Só com estoque</strong> para priorizar o que está vendendo agora.</p>
          <p>3. Clique em <strong>Editar</strong> para abrir o produto no admin e corrigir, ou <strong>Exportar CSV</strong> para corrigir em massa na Trier e depois resincronizar.</p>
          <p>4. Para EAN/preço/estoque que vêm da Trier: corrija lá e use a resincronização. Para imagem/descrição/categoria: corrija direto no admin.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function IssueCard({ issue, active, onClick, onlyWithStock }: { issue: typeof ISSUES[number]; active: boolean; onClick: () => void; onlyWithStock: boolean }) {
  const { data, isLoading } = useIssueCount(issue.key, onlyWithStock);
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition-all hover:shadow-md ${active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "bg-card"}`}
    >
      <div className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]">{issue.label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : data === -1 ? "—" : data?.toLocaleString("pt-BR")}
      </div>
    </button>
  );
}
