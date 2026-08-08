import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Download,
  ExternalLink,
  Loader2,
  CheckCircle2,
  EyeOff,
  ShieldAlert,
  Pencil,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  computeQualityScore,
  getPublicationStatus,
  hasOwnImage,
  hasDisplayImage,
  usesPlaceholderImage,
  isSellable,
  effectiveStock,
  suggestedEditTab,
  STATUS_META,
  scoreTone,
  DEFAULT_QUALITY_SETTINGS,
  DEFAULT_PLACEHOLDER,
  type QualitySettings,
  type QualityProduct,
  type StrictMode,
} from "@/lib/productQuality";

const SELECT_FIELDS =
  "id,slug,name,price,stock,stock_quantity,active,trier_active,manual_disabled,publish_even_incomplete,image_url,gallery_images,barcode,short_description,description,manufacturer,laboratory,category_id,category_name,active_ingredient,seo_title,seo_description,tags,requires_prescription,controlled,updated_at";

type Scope = "sellable" | "out_of_stock" | "inactive";

type FilterKey =
  | "sellable_all"
  | "sellable_incomplete"
  | "sellable_published"
  | "placeholder_image"
  | "no_image_at_all"
  | "no_category"
  | "no_description"
  | "no_barcode"
  | "no_price"
  | "score_low";

const FILTER_LABEL: Record<FilterKey, string> = {
  sellable_all: "Todos com estoque",
  sellable_incomplete: "Com estoque e cadastro incompleto",
  sellable_published: "Publicados no site",
  placeholder_image: "Usando imagem padrão",
  no_image_at_all: "Sem nenhuma imagem",
  no_category: "Sem categoria",
  no_description: "Sem descrição",
  no_barcode: "Sem EAN",
  no_price: "Sem preço",
  score_low: "Score < 50%",
};

type SortKey = "score_asc" | "score_desc" | "stock_desc" | "stock_asc";
const SORT_LABEL: Record<SortKey, string> = {
  score_asc: "Menor score primeiro",
  score_desc: "Maior score primeiro",
  stock_desc: "Maior estoque",
  stock_asc: "Menor estoque",
};

export default function AdminDataQuality() {
  const [scope, setScope] = useState<Scope>("sellable");
  const [filter, setFilter] = useState<FilterKey>("sellable_incomplete");
  const [sort, setSort] = useState<SortKey>("score_asc");
  const [search, setSearch] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["quality_settings"],
    queryFn: async (): Promise<QualitySettings> => {
      const { data } = await (supabase as any)
        .from("store_settings")
        .select("quality_strict_mode")
        .limit(1)
        .maybeSingle();
      return {
        strict_mode: (data?.quality_strict_mode as StrictMode) ?? "off",
        default_image_url: DEFAULT_PLACEHOLDER,
      };
    },
  });
  const settings = settingsQuery.data ?? DEFAULT_QUALITY_SETTINGS;

  const productsQuery = useQuery({
    queryKey: ["quality_products"],
    queryFn: async () => {
      const rows: QualityProduct[] = [];
      const pageSize = 1000;
      // Só produtos vivos (não arquivados). Arquivados não vão ao site e não
      // entram na análise de qualidade — evita varrer o catálogo histórico inteiro.
      for (let from = 0; from < 20_000; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from("products")
          .select(SELECT_FIELDS)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...(data as QualityProduct[]));
        if (data.length < pageSize) break;
      }
      return rows;
    },
    staleTime: 60_000,
  });
  const products = productsQuery.data ?? [];

  const enriched = useMemo(() => {
    return products.map((p) => {
      const sellable = isSellable(p);
      const { score, missing } = computeQualityScore(p);
      const pub = getPublicationStatus(p, settings);
      return { p, score, missing, sellable, ...pub };
    });
  }, [products, settings]);

  const sellable = enriched.filter((e) => e.sellable);
  const outOfStock = enriched.filter(
    (e) => e.p.active !== false && e.p.trier_active !== false && !e.p.manual_disabled && effectiveStock(e.p) <= 0,
  );
  const inactive = enriched.filter(
    (e) => e.p.active === false || e.p.trier_active === false || e.p.manual_disabled === true,
  );

  const stats = useMemo(() => {
    const totalSellable = sellable.length;
    const published = sellable.filter((e) => e.status === "published").length;
    const publishedWithWarning = sellable.filter((e) => e.status === "published_with_warning").length;
    const incomplete = sellable.filter((e) => e.status !== "published").length;
    const placeholderImg = sellable.filter((e) => usesPlaceholderImage(e.p, settings)).length;
    const noImageAtAll = sellable.filter((e) => !(e.p.image_url ?? "").trim()).length;
    const noCategory = sellable.filter((e) => !e.p.category_id && !e.p.category_name).length;
    const noPrice = sellable.filter((e) => !(Number(e.p.price) > 0)).length;
    const noDesc = sellable.filter((e) => !(e.p.description ?? "").trim()).length;
    const noBarcode = sellable.filter((e) => !(e.p.barcode ?? "").trim()).length;
    const avgScore = totalSellable
      ? Math.round(sellable.reduce((s, e) => s + e.score, 0) / totalSellable)
      : 0;
    return {
      totalSellable,
      published,
      publishedWithWarning,
      incomplete,
      placeholderImg,
      noImageAtAll,
      noCategory,
      noPrice,
      noDesc,
      noBarcode,
      avgScore,
      outOfStock: outOfStock.length,
      inactive: inactive.length,
    };
  }, [sellable, outOfStock.length, inactive.length, settings]);

  const scoped = scope === "sellable" ? sellable : scope === "out_of_stock" ? outOfStock : inactive;

  const list = useMemo(() => {
    let rows = scoped;
    if (search.trim()) {
      const t = search.trim().toLowerCase();
      rows = rows.filter((e) => (e.p.name ?? "").toLowerCase().includes(t));
    }
    if (scope === "sellable") {
      rows = rows.filter((e) => {
        switch (filter) {
          case "sellable_all": return true;
          case "sellable_incomplete": return e.status !== "published";
          case "sellable_published": return e.status === "published" || e.status === "published_with_warning";
          case "placeholder_image": return usesPlaceholderImage(e.p, settings);
          case "no_image_at_all": return !(e.p.image_url ?? "").trim();
          case "no_category": return !e.p.category_id && !e.p.category_name;
          case "no_description": return !(e.p.description ?? "").trim();
          case "no_barcode": return !(e.p.barcode ?? "").trim();
          case "no_price": return !(Number(e.p.price) > 0);
          case "score_low": return e.score < 50;
        }
      });
    }
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "score_asc": return a.score - b.score;
        case "score_desc": return b.score - a.score;
        case "stock_desc": return effectiveStock(b.p) - effectiveStock(a.p);
        case "stock_asc": return effectiveStock(a.p) - effectiveStock(b.p);
      }
    });
    return rows.slice(0, 500);
  }, [scoped, filter, sort, search, scope, settings]);

  const saveSettings = async (patch: Partial<QualitySettings>) => {
    const next = { ...settings, ...patch };
    const { data: existing } = await (supabase as any)
      .from("store_settings").select("id").limit(1).maybeSingle();
    const payload: any = { quality_strict_mode: next.strict_mode };
    const q = existing?.id
      ? (supabase as any).from("store_settings").update(payload).eq("id", existing.id)
      : (supabase as any).from("store_settings").insert(payload);
    const { error } = await q;
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    else { toast({ title: "Configuração salva" }); settingsQuery.refetch(); }
  };

  const toggleWhitelist = async (id: string, next: boolean) => {
    const { error } = await (supabase as any).from("products").update({ publish_even_incomplete: next }).eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    productsQuery.refetch();
  };
  const toggleBlacklist = async (id: string, next: boolean) => {
    const { error } = await (supabase as any).from("products").update({ manual_disabled: next }).eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    productsQuery.refetch();
  };

  const exportCsv = () => {
    if (!list.length) return;
    const header = ["id", "name", "score", "status", "reason", "price", "stock", "barcode", "manufacturer", "has_own_image", "category"];
    const csv = [
      header.join(","),
      ...list.map((e) =>
        [
          e.p.id,
          `"${String(e.p.name ?? "").replace(/"/g, '""')}"`,
          e.score,
          e.status,
          `"${e.reason.replace(/"/g, '""')}"`,
          e.p.price ?? 0,
          effectiveStock(e.p),
          e.p.barcode ?? "",
          `"${String(e.p.manufacturer ?? "").replace(/"/g, '""')}"`,
          hasOwnImage(e.p) ? "1" : "0",
          `"${String(e.p.category_name ?? "").replace(/"/g, '""')}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `qualidade-${scope}-${filter}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (productsQuery.isLoading) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analisando catálogo…</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-extrabold">Qualidade de Dados</h1>
        <p className="text-sm text-muted-foreground">
          A análise principal foca apenas em produtos vendáveis (ativos e com estoque). Produtos sem estoque não aparecem no site
          e são listados separadamente. Imagem padrão é aceitável — só bloqueia se não houver nenhuma imagem exibível.
        </p>
      </div>

      {/* Overview cards — restritos a produtos vendáveis */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={`Analisando produtos com estoque`} value={stats.totalSellable} tone="text-primary" />
        <Stat label="Publicados (cadastro bom)" value={stats.published} tone="text-emerald-700" />
        <Stat label="Publicados c/ alerta" value={stats.publishedWithWarning} tone="text-amber-700" />
        <Stat label="Vendáveis com cadastro incompleto" value={stats.incomplete} tone="text-rose-700" />
        <Stat label="Usando imagem padrão" value={stats.placeholderImg} />
        <Stat label="Sem nenhuma imagem" value={stats.noImageAtAll} tone={stats.noImageAtAll > 0 ? "text-rose-700" : ""} />
        <Stat label="Sem categoria" value={stats.noCategory} />
        <Stat label="Sem preço" value={stats.noPrice} tone={stats.noPrice > 0 ? "text-rose-700" : ""} />
        <Stat label="Sem descrição" value={stats.noDesc} />
        <Stat label="Sem EAN" value={stats.noBarcode} />
        <Stat label="Sem estoque (ignorados)" value={stats.outOfStock} tone="text-muted-foreground" />
        <Stat label="Inativos / desativados" value={stats.inactive} tone="text-muted-foreground" />
      </div>

      <div className="text-xs text-muted-foreground">
        Score médio dos vendáveis: <b className={stats.avgScore >= 70 ? "text-emerald-700" : "text-amber-700"}>{stats.avgScore}%</b>
      </div>

      {/* Modo rigoroso — sempre desligado por padrão */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Modo rigoroso (opcional)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <Switch
              checked={settings.strict_mode === "strict"}
              onCheckedChange={(v) => saveSettings({ strict_mode: v ? "strict" : "off" })}
            />
            <div>
              <Label className="text-sm font-medium">Só publicar produtos com cadastro 100% completo</Label>
              <p className="text-xs text-muted-foreground">
                Desligado por padrão. Ligue apenas se preferir esconder tudo que não estiver 100% preenchido — pode derrubar vendas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Escopo + Filtros */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              <ScopeBtn active={scope === "sellable"} onClick={() => { setScope("sellable"); setFilter("sellable_incomplete"); }}>
                Com estoque ({sellable.length})
              </ScopeBtn>
              <ScopeBtn active={scope === "out_of_stock"} onClick={() => setScope("out_of_stock")}>
                Sem estoque ({outOfStock.length})
              </ScopeBtn>
              <ScopeBtn active={scope === "inactive"} onClick={() => setScope("inactive")}>
                Inativos / desativados ({inactive.length})
              </ScopeBtn>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input placeholder="Buscar por nome…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
              {scope === "sellable" && (
                <Select value={filter} onValueChange={(v: FilterKey) => setFilter(v)}>
                  <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => (
                      <SelectItem key={k} value={k}>{FILTER_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={sort} onValueChange={(v: SortKey) => setSort(v)}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!list.length}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <div className="text-sm text-emerald-700 font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Nenhum produto neste filtro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-2">Foto</th>
                    <th className="py-2 pr-2">Nome</th>
                    <th className="py-2 pr-2">Score</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Motivo</th>
                    <th className="py-2 pr-2">Preço</th>
                    <th className="py-2 pr-2">Estoque</th>
                    <th className="py-2 pr-2">Whitelist</th>
                    <th className="py-2 pr-2">Ocultar</th>
                    <th className="py-2 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => {
                    const meta = STATUS_META[e.status];
                    const tab = suggestedEditTab(e.p);
                    return (
                      <tr key={e.p.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-2">
                          {hasOwnImage(e.p) ? (
                            <img src={e.p.image_url!} alt="" className="w-10 h-10 object-contain rounded border" />
                          ) : (
                            <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center" title="Sem imagem própria — usa placeholder">
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2 font-medium max-w-[240px] truncate" title={e.p.name ?? ""}>{e.p.name}</td>
                        <td className="py-2 pr-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${scoreTone(e.score)}`}>{e.score}%</span>
                        </td>
                        <td className="py-2 pr-2">
                          <span className={`px-2 py-0.5 rounded border text-xs font-medium ${meta.tone}`}>{meta.label}</span>
                        </td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[240px] truncate" title={e.reason}>{e.reason}</td>
                        <td className="py-2 pr-2 tabular-nums">{e.p.price ? `R$ ${Number(e.p.price).toFixed(2)}` : <span className="text-destructive">—</span>}</td>
                        <td className="py-2 pr-2 tabular-nums">{effectiveStock(e.p)}</td>
                        <td className="py-2 pr-2">
                          <Switch checked={!!e.p.publish_even_incomplete} onCheckedChange={(v) => toggleWhitelist(e.p.id!, v)} />
                        </td>
                        <td className="py-2 pr-2">
                          <Switch checked={!!e.p.manual_disabled} onCheckedChange={(v) => toggleBlacklist(e.p.id!, v)} />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <Link to={`/admin/produtos?edit=${e.p.id}&tab=${tab}`}>
                              <Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
                            </Link>
                            {e.p.slug && (
                              <a href={`/produto/${e.p.slug}`} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Como funciona</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p><b>Mínimos para venda:</b> nome, preço &gt; 0, categoria, estoque &gt; 0, ativo e uma imagem exibível (própria ou padrão).</p>
          <p><b>Imagem padrão</b> é aceitável — o produto continua vendável, apenas aparece com alerta leve no admin.</p>
          <p><b>Sem estoque</b> não é erro de cadastro — o produto simplesmente não aparece no site e fica no aba "Sem estoque".</p>
          <p><b>Modo rigoroso</b> é opcional e desligado por padrão.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${tone ?? ""}`}>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</div>
    </div>
  );
}

function ScopeBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}
