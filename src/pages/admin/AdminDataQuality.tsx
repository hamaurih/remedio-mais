import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Download,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  ShieldAlert,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  computeQualityScore,
  getPublicationStatus,
  hasOwnImage,
  effectiveStock,
  STATUS_META,
  scoreTone,
  DEFAULT_QUALITY_SETTINGS,
  type QualitySettings,
  type QualityProduct,
  type PublicationStatus,
  type StrictMode,
} from "@/lib/productQuality";

const SELECT_FIELDS =
  "id,slug,name,price,stock,stock_quantity,active,trier_active,manual_disabled,publish_even_incomplete,image_url,gallery_images,barcode,short_description,description,manufacturer,laboratory,category_id,category_name,active_ingredient,seo_title,seo_description,tags,requires_prescription,controlled,updated_at";

type FilterKey =
  | "all"
  | "published"
  | "published_warning"
  | "hidden"
  | "out_of_stock"
  | "no_image"
  | "no_category"
  | "no_description"
  | "no_barcode"
  | "score_low"
  | "score_mid"
  | "score_high"
  | "critical";

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "Todos",
  published: "Publicados",
  published_warning: "Publicados c/ alerta",
  hidden: "Ocultos",
  out_of_stock: "Sem estoque",
  no_image: "Sem imagem própria",
  no_category: "Sem categoria",
  no_description: "Sem descrição",
  no_barcode: "Sem EAN",
  score_low: "Score < 50%",
  score_mid: "Score 50–80%",
  score_high: "Score > 80%",
  critical: "Cadastro crítico",
};

type SortKey = "score_asc" | "score_desc" | "recent" | "stock_desc" | "stock_asc";

const SORT_LABEL: Record<SortKey, string> = {
  score_asc: "Menor score primeiro",
  score_desc: "Maior score primeiro",
  recent: "Mais recentes",
  stock_desc: "Maior estoque",
  stock_asc: "Menor estoque",
};

export default function AdminDataQuality() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("score_asc");
  const [search, setSearch] = useState("");

  // ---- Load settings ----
  const settingsQuery = useQuery({
    queryKey: ["quality_settings"],
    queryFn: async (): Promise<QualitySettings> => {
      const { data } = await (supabase as any)
        .from("store_settings")
        .select("quality_strict_mode,quality_require_own_image")
        .limit(1)
        .maybeSingle();
      return {
        strict_mode: (data?.quality_strict_mode as StrictMode) ?? "off",
        require_own_image: !!data?.quality_require_own_image,
      };
    },
  });
  const settings = settingsQuery.data ?? DEFAULT_QUALITY_SETTINGS;

  // ---- Load products (all, to compute aggregates client-side) ----
  const productsQuery = useQuery({
    queryKey: ["quality_products"],
    queryFn: async () => {
      const rows: QualityProduct[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from("products")
          .select(SELECT_FIELDS)
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

  // ---- Compute per-product quality state ----
  const enriched = useMemo(() => {
    return products.map((p) => {
      const { score, missing } = computeQualityScore(p);
      const pub = getPublicationStatus(p, settings);
      return { p, score, missing, ...pub };
    });
  }, [products, settings]);

  // Simulated impact under the currently saved strict mode
  const simulated = useMemo(() => {
    const withDefault = enriched.length; // baseline
    const hiddenByStrict = enriched.filter(
      (e) => e.status === "hidden_missing_required" &&
        // it was hidden precisely because of strict/moderate/require_image
        (settings.strict_mode !== "off" || settings.require_own_image),
    ).length;
    return { total: withDefault, hiddenByStrict };
  }, [enriched, settings]);

  // ---- Aggregate cards ----
  const stats = useMemo(() => {
    const total = enriched.length;
    const by = (s: PublicationStatus) => enriched.filter((e) => e.status === s).length;
    const published = by("published") + by("published_with_warning");
    const withWarning = by("published_with_warning");
    const hiddenMissing = by("hidden_missing_required");
    const hiddenStock = by("hidden_out_of_stock");
    const hiddenManual = by("hidden_manual") + by("hidden_inactive");
    const noOwnImage = enriched.filter((e) => !hasOwnImage(e.p)).length;
    const avgScore = total ? Math.round(enriched.reduce((s, e) => s + e.score, 0) / total) : 0;
    const critical = enriched.filter((e) => e.score < 40).length;
    return { total, published, withWarning, hiddenMissing, hiddenStock, hiddenManual, noOwnImage, avgScore, critical };
  }, [enriched]);

  // ---- Apply filter + sort ----
  const list = useMemo(() => {
    let rows = enriched;
    if (search.trim()) {
      const t = search.trim().toLowerCase();
      rows = rows.filter((e) => (e.p.name ?? "").toLowerCase().includes(t));
    }
    rows = rows.filter((e) => {
      switch (filter) {
        case "all": return true;
        case "published": return e.status === "published" || e.status === "published_with_warning";
        case "published_warning": return e.status === "published_with_warning";
        case "hidden": return e.status.startsWith("hidden_");
        case "out_of_stock": return e.status === "hidden_out_of_stock";
        case "no_image": return !hasOwnImage(e.p);
        case "no_category": return !e.p.category_id && !e.p.category_name;
        case "no_description": return !(e.p.description ?? "").trim();
        case "no_barcode": return !(e.p.barcode ?? "").trim();
        case "score_low": return e.score < 50;
        case "score_mid": return e.score >= 50 && e.score <= 80;
        case "score_high": return e.score > 80;
        case "critical": return e.score < 40;
      }
    });
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "score_asc": return a.score - b.score;
        case "score_desc": return b.score - a.score;
        case "recent": return String(b.p as any).localeCompare(String(a.p as any));
        case "stock_desc": return effectiveStock(b.p) - effectiveStock(a.p);
        case "stock_asc": return effectiveStock(a.p) - effectiveStock(b.p);
      }
    });
    return rows.slice(0, 500);
  }, [enriched, filter, sort, search]);

  // ---- Actions ----
  const saveSettings = async (patch: Partial<QualitySettings>) => {
    const next = { ...settings, ...patch };
    const { data: existing } = await (supabase as any)
      .from("store_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    const payload: any = {
      quality_strict_mode: next.strict_mode,
      quality_require_own_image: next.require_own_image,
    };
    let error;
    if (existing?.id) {
      ({ error } = await (supabase as any).from("store_settings").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await (supabase as any).from("store_settings").insert(payload));
    }
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração salva" });
      settingsQuery.refetch();
    }
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
    const header = ["id", "name", "score", "status", "reason", "price", "stock", "barcode", "manufacturer", "has_image", "category"];
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
    a.href = url;
    a.download = `qualidade-${filter}.csv`;
    a.click();
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
          Priorize correções de cadastro sem derrubar vendas. Produtos com dados mínimos continuam publicados; incompletos aparecem com alerta aqui.
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
        <Stat label="Cadastrados" value={stats.total} />
        <Stat label="Publicados" value={stats.published} tone="text-emerald-700" />
        <Stat label="Publicados c/ alerta" value={stats.withWarning} tone="text-amber-700" />
        <Stat label="Ocultos p/ falta de dados" value={stats.hiddenMissing} tone="text-rose-700" />
        <Stat label="Sem estoque" value={stats.hiddenStock} />
        <Stat label="Ocultos manualmente / inativos" value={stats.hiddenManual} />
        <Stat label="Sem imagem própria" value={stats.noOwnImage} />
        <Stat label="Score médio" value={`${stats.avgScore}%`} tone={stats.avgScore >= 70 ? "text-emerald-700" : "text-amber-700"} />
      </div>

      {/* Strict mode + simulator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Modo rigoroso de publicação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Modo</Label>
              <Select
                value={settings.strict_mode}
                onValueChange={(v: StrictMode) => saveSettings({ strict_mode: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Desligado — publica com mínimos (recomendado)</SelectItem>
                  <SelectItem value="moderate">Moderado — exige imagem própria + EAN</SelectItem>
                  <SelectItem value="strict">Rigoroso — só publica com score 100%</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                O modo escolhido não é aplicado ao catálogo público automaticamente até você validar o impacto abaixo.
              </p>
            </div>
            <div className="flex items-start gap-3 pt-6">
              <Switch
                checked={settings.require_own_image}
                onCheckedChange={(v) => saveSettings({ require_own_image: v })}
              />
              <div>
                <div className="font-medium text-sm">Exigir imagem própria</div>
                <p className="text-xs text-muted-foreground">Se ligado, produtos sem imagem própria são ocultados. Caso contrário, aparecem com placeholder e alerta.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="font-semibold mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Simulação de impacto
            </div>
            Com as configurações atuais: <b>{stats.published}</b> aparecem no site e <b>{stats.hiddenMissing + stats.hiddenStock + stats.hiddenManual}</b> ficam ocultos
            {" "}(dos quais <b>{stats.hiddenMissing}</b> por falta de dados). Ajuste o modo com cuidado — desligar mantém o comportamento antigo.
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Produtos ({list.length}{list.length === 500 ? " — limite" : ""})</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input placeholder="Buscar por nome…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
              <Select value={filter} onValueChange={(v: FilterKey) => setFilter(v)}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => (
                    <SelectItem key={k} value={k}>{FILTER_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    return (
                      <tr key={e.p.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-2">
                          {hasOwnImage(e.p) ? (
                            <img src={e.p.image_url!} alt="" className="w-10 h-10 object-contain rounded border" />
                          ) : (
                            <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
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
                        <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[220px] truncate" title={e.reason}>{e.reason}</td>
                        <td className="py-2 pr-2 tabular-nums">{e.p.price ? `R$ ${Number(e.p.price).toFixed(2)}` : <span className="text-destructive">—</span>}</td>
                        <td className="py-2 pr-2 tabular-nums">{effectiveStock(e.p)}</td>
                        <td className="py-2 pr-2">
                          <Switch
                            checked={!!e.p.publish_even_incomplete}
                            onCheckedChange={(v) => toggleWhitelist(e.p.id!, v)}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Switch
                            checked={!!e.p.manual_disabled}
                            onCheckedChange={(v) => toggleBlacklist(e.p.id!, v)}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <Link to={`/admin/produtos?search=${encodeURIComponent(e.p.name ?? "")}`}>
                              <Button size="sm" variant="ghost">Editar</Button>
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
          <p><b>Campos obrigatórios</b> (bloqueiam publicação): nome, preço, categoria, estoque &gt; 0, ativo.</p>
          <p><b>Campos desejáveis</b> (compõem o score): imagem própria, EAN, descrições, SEO, princípio ativo, laboratório, tags, galeria etc.</p>
          <p><b>Whitelist</b> mantém publicado mesmo incompleto (respeitando os obrigatórios). <b>Ocultar</b> tira do site independentemente do cadastro.</p>
          <p><b>Modo rigoroso</b> é opcional e desligado por padrão para não derrubar vendas.</p>
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
