import { productAvailabilityStatus } from "@/lib/availability";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, X, Power, AlertTriangle, Search, Upload, Star, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/store";
import { ProductVariantsManager } from "@/components/admin/ProductVariantsManager";
import { RelatedProductsPicker } from "@/components/admin/RelatedProductsPicker";
import { BestsellersReorderDialog } from "@/components/admin/BestsellersReorderDialog";
import { CommercialClassificationTab } from "@/components/admin/CommercialClassificationTab";

const SHELVES = [
  { slug: "ofertas-da-semana", label: "Ofertas da Semana" },
  { slug: "mais-vendidos", label: "Mais Vendidos" },
  { slug: "medicamentos-populares", label: "Medicamentos Populares" },
  { slug: "higiene-e-beleza", label: "Higiene e Beleza" },
  { slug: "mamaes-e-bebes", label: "Mamães e Bebês" },
  { slug: "vitaminas-e-suplementos", label: "Vitaminas e Suplementos" },
  { slug: "primeiros-socorros", label: "Primeiros Socorros" },
];

const BADGES = ["", "oferta", "mais-vendido", "generico", "novo", "leve-mais"];
const TARJAS = ["", "vermelha", "preta"];

const empty: any = {
  id: "", name: "", slug: "", category_id: "", short_description: "", description: "",
  price: 0, promo_price: null, on_sale: false, promotion_start: null, promotion_end: null,
  image_url: "", gallery_images: [] as string[],
  manufacturer: "", active_ingredient: "", sku: "", barcode: "",
  stock: 0, minimum_stock: 5, featured: false,
  requires_prescription: false, controlled: false, tarja: "", custom_warning: "",
  product_badge: "", seo_title: "", seo_description: "", seo_keywords: "",
  active: true, shelves: [] as string[],
  bestseller_rank: null, is_generic: false, generic_equivalent_id: null,
  price_base: null, site_price: null, whatsapp_price: null,
  site_promo_price: null, whatsapp_promo_price: null,
  use_channel_pricing: false, channel_price_notes: "",
  site_discount_percentage: null, whatsapp_discount_percentage: null, lock_channel_discount: false,
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const loadAdminProductDetail = async (id: string) => {
  const { data, error } = await (supabase as any).rpc("admin_product_detail", { _id: id });
  if (error) throw error;
  return data;
};

export default function AdminProducts() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [activeTab, setActiveTab] = useState<string>("basic");
  // valor digitado do desconto (%) — permite decimais como 14,5 / 14,25
  const [pctInput, setPctInput] = useState<string | null>(null);

  const [mainFile, setMainFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [catFilter, setCatFilter] = useState(searchParams.get("category") || "all");
  const [manuFilter, setManuFilter] = useState(searchParams.get("manufacturer") || "all");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Reset to page 1 whenever filters change
  useMemo(() => { setPage(1); }, [search, catFilter, manuFilter, statusFilter, pageSize]);

  const { data: productsResp } = useQuery({
    queryKey: ["admin_products", { search, catFilter, manuFilter, statusFilter, page, pageSize }],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_products_list", {
        _search: search || null,
        _category_id: catFilter === "all" ? null : catFilter,
        _manufacturer: manuFilter === "all" ? null : manuFilter,
        _status: statusFilter,
        _page: page,
        _page_size: pageSize,
      });
      if (error) throw error;
      const rows = (data?.rows || []).map((r: any) => ({
        ...r,
        categories: r.categories ?? (r.category_display_name ? { name: r.category_display_name } : null),
      }));
      return { rows, count: data?.total ?? data?.count ?? 0 };
    },
  });
  const products = productsResp?.rows || [];
  const totalCount = productsResp?.count || 0;

  const { data: cats } = useQuery({
    queryKey: ["admin_cats_list"],
    queryFn: async () => (await supabase.from("categories").select("*").order("position")).data || [],
  });

  // Distinct manufacturers (fetched separately so it stays stable across pages)
  const { data: manufacturers = [] } = useQuery({
    queryKey: ["admin_manufacturers"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("manufacturer").not("manufacturer", "is", null).limit(5000);
      const s = new Set<string>();
      (data || []).forEach((p: any) => { if (p.manufacturer) s.add(p.manufacturer); });
      return Array.from(s).sort((a, b) => a.localeCompare(b));
    },
  });

  // Reajustes de preço vindos do Trier nos últimos 7 dias (para sinalizar na lista)
  const { data: trierAdjust = {} } = useQuery({
    queryKey: ["recent_trier_price_changes"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await (supabase as any)
        .from("product_price_history")
        .select("product_id,old_price,new_price,changed_at,change_type,source")
        .eq("source", "trier")
        .gte("changed_at", since)
        .order("changed_at", { ascending: false })
        .limit(3000);
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { if (r.product_id && !map[r.product_id]) map[r.product_id] = r; });
      return map as Record<string, any>;
    },
    staleTime: 60_000,
  });


  const isAdjustFilter = statusFilter.startsWith("readjusted");
  const adjustIds = useMemo(() => Object.keys(trierAdjust || {}), [trierAdjust]);

  // Produtos reajustados pelo Trier (7d) — filtro dedicado, paginado no cliente
  const { data: adjustedRows = [] } = useQuery({
    queryKey: ["admin_products_readjusted", adjustIds.length, statusFilter],
    enabled: isAdjustFilter && adjustIds.length > 0,
    queryFn: async () => {
      const out: any[] = [];
      for (let i = 0; i < adjustIds.length; i += 300) {
        const chunk = adjustIds.slice(i, i + 300);
        const { data, error } = await (supabase as any)
          .from("products")
          .select("*, categories(name)")
          .in("id", chunk);
        if (error) throw error;
        out.push(...(data || []));
      }
      return out;
    },
    staleTime: 60_000,
  });

  // Local-only refinement for "low stock" (needs minimum_stock comparison)
  const filtered = useMemo(() => {
    if (isAdjustFilter) {
      const term = search.trim().toLowerCase();
      return adjustedRows.filter((p: any) => {
        const adj = (trierAdjust as Record<string, any>)[p.id];
        if (!adj) return false;
        const diff = Number(adj.new_price ?? 0) - Number(adj.old_price ?? 0);
        if (statusFilter === "readjusted_up" && diff <= 0) return false;
        if (statusFilter === "readjusted_down" && diff >= 0) return false;
        if (catFilter !== "all" && p.category_id !== catFilter) return false;
        if (manuFilter !== "all" && p.manufacturer !== manuFilter) return false;
        if (term && !`${p.name ?? ""} ${p.barcode ?? ""} ${p.sku ?? ""}`.toLowerCase().includes(term)) return false;
        return true;
      });
    }
    if (statusFilter !== "low") return products;
    return products.filter((p: any) => p.stock <= (p.minimum_stock ?? 5));
  }, [products, statusFilter, isAdjustFilter, adjustedRows, trierAdjust, search, catFilter, manuFilter]);

  const effTotal = isAdjustFilter ? filtered.length : totalCount;
  const effTotalPages = Math.max(1, Math.ceil(effTotal / pageSize));
  const pageRows = isAdjustFilter ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;



  const openNew = () => { setEditing(empty); setMainFile(null); setGalleryFiles([]); setPctInput(null); setOpen(true); };
  const openEdit = (p: any, tab: string = "basic") => {
    setEditing({ ...empty, ...p, category_id: p.category_id || "", shelves: p.shelves || [], gallery_images: p.gallery_images || [] });
    setMainFile(null); setGalleryFiles([]); setPctInput(null);
    setActiveTab(tab);
    setOpen(true);
  };

  // Deep link: /admin/produtos?edit=<id>&tab=<tab>
  useEffect(() => {
    const editId = searchParams.get("edit");
    const tab = searchParams.get("tab") || "basic";
    if (!editId) return;
    if (editing?.id === editId && open) return;
    (async () => {
      try {
        const data = await loadAdminProductDetail(editId);
        if (data) openEdit(data, tab);
        else toast.error("Produto não encontrado");
      } catch (e: any) {
        toast.error(e?.message || "Erro ao carregar produto");
      } finally {
        // limpa a URL após abrir para não reabrir em cada re-render
        const next = new URLSearchParams(searchParams);
        next.delete("edit"); next.delete("tab");
        setSearchParams(next, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const toggleShelf = (slug: string) => {
    const cur: string[] = editing.shelves || [];
    setEditing({ ...editing, shelves: cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug] });
  };

  const removeGallery = (url: string) =>
    setEditing({ ...editing, gallery_images: (editing.gallery_images || []).filter((u: string) => u !== url) });

  const uploadOne = async (file: File) => {
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error } = await supabase.storage.from("products").upload(path, file);
    if (error) throw error;
    return supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
  };

  const save = async (keepOpen = false) => {
    try {
      if (!editing.name?.trim()) { toast.error("Nome é obrigatório"); return; }
      if (!editing.price || Number(editing.price) <= 0) { toast.error("Preço deve ser maior que zero"); return; }
      const slug = editing.slug || slugify(editing.name);
      let image_url = editing.image_url;
      if (mainFile) image_url = await uploadOne(mainFile);
      const gallery_images = [...(editing.gallery_images || [])];
      for (const f of galleryFiles) gallery_images.push(await uploadOne(f));

      const shelvesArr: string[] = editing.shelves || [];
      const hasOffersShelf = shelvesArr.includes("ofertas-da-semana");
      const promoNum = editing.promo_price ? Number(editing.promo_price) : null;
      const autoOnSale = hasOffersShelf && promoNum != null && promoNum < Number(editing.price);

      const toNumOrNull = (v: any) => (v === "" || v == null ? null : Number(v));
      const payload: any = {
        ...editing, slug, image_url, gallery_images,
        category_id: editing.category_id || null,
        price: Number(editing.price),
        promo_price: promoNum,
        on_sale: autoOnSale ? true : !!editing.on_sale,
        stock: Number(editing.stock || 0),
        minimum_stock: Number(editing.minimum_stock || 0),
        promotion_start: editing.promotion_start || null,
        promotion_end: editing.promotion_end || null,
        tarja: editing.tarja || null,
        product_badge: editing.product_badge || null,
        pix_discount_percentage: editing.pix_discount_percentage ? Number(editing.pix_discount_percentage) : null,
        cart_quantity_limit: editing.cart_quantity_limit ? Number(editing.cart_quantity_limit) : null,
        price_base: toNumOrNull(editing.price_base),
        site_price: toNumOrNull(editing.site_price),
        whatsapp_price: toNumOrNull(editing.whatsapp_price),
        site_promo_price: toNumOrNull(editing.site_promo_price),
        whatsapp_promo_price: toNumOrNull(editing.whatsapp_promo_price),
        use_channel_pricing: !!editing.use_channel_pricing,
        lock_channel_discount: !!editing.lock_channel_discount,
        site_discount_percentage: toNumOrNull(editing.site_discount_percentage),
        whatsapp_discount_percentage: toNumOrNull(editing.whatsapp_discount_percentage),
        channel_price_notes: editing.channel_price_notes || null,
        // Travas separadas: a promoção é protegida contra o Trier; o preço normal
        // continua sincronizando, exceto se o admin travar explicitamente.
        lock_base_price: !!editing.lock_base_price,
        lock_promotion: promoNum != null ? true : !!editing.lock_promotion,
        promotion_source: promoNum != null ? (editing.promotion_source && editing.promotion_source !== "none" ? editing.promotion_source : "manual") : "none",
        lock_manual_price: false,
      };
      delete payload.categories;
      delete payload.category_display_name; // vem da RPC admin_products_list (alias do JOIN)
      delete payload.discount_percentage; // generated column

      let saved;
      if (editing.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
        saved = await loadAdminProductDetail(editing.id);
      } else {
        delete payload.id;
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        saved = await loadAdminProductDetail(data.id);
      }
      toast.success("Produto salvo");
      qc.invalidateQueries({ queryKey: ["admin_products"] });
      qc.invalidateQueries({ queryKey: ["shelf"] });
      if (keepOpen) {
        setEditing({ ...empty, ...saved, shelves: saved.shelves || [], gallery_images: saved.gallery_images || [] });
        setMainFile(null); setGalleryFiles([]);
      } else setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleActive = async (p: any) => {
    const { error } = await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success(p.active ? "Desativado" : "Ativado"); qc.invalidateQueries({ queryKey: ["admin_products"] }); }
  };

  // Override do admin: mantém o produto disponível mesmo se o Trier marcar como inativo.
  const toggleForceActive = async (p: any) => {
    const next = !p.force_active;
    const stock = Number(p.stock_quantity ?? p.stock ?? 0);
    const { error } = await supabase
      .from("products")
      .update({ force_active: next, active: next ? stock > 0 && !p.manual_disabled && !p.archived_at : false })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else {
      toast.success(next ? "Ativação forçada — o Trier não vai mais desativar este produto" : "Ativação forçada removida");
      qc.invalidateQueries({ queryKey: ["admin_products"] });
    }
  };

  const [bulkBusy, setBulkBusy] = useState(false);
  const forceActivateAllTrierInactive = async () => {
    if (!confirm("Forçar ativação de TODOS os produtos com estoque que estão inativos no Trier?")) return;
    setBulkBusy(true);
    const { data, error } = await supabase
      .from("products")
      .update({ force_active: true, active: true })
      .eq("trier_active", false)
      .eq("manual_disabled", false)
      .is("archived_at", null)
      .gt("stock", 0)
      .select("id");
    setBulkBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(`${data?.length ?? 0} produto(s) ativados`); qc.invalidateQueries({ queryKey: ["admin_products"] }); }
  };


  const remove = async (id: string) => {
    if (!confirm("Excluir produto definitivamente?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["admin_products"] }); }
  };

  const discountPct = useMemo(() => {
    const p = Number(editing.price), pp = Number(editing.promo_price);
    if (!p || !pp || pp >= p) return 0;
    // mantém casas decimais (ex.: 14,5% / 14,25%) sem arredondar para inteiro
    return Number(((1 - pp / p) * 100).toFixed(2));
  }, [editing.price, editing.promo_price]);


  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-extrabold">Produtos</h1>
        <div className="flex gap-2">
          <Button variant="outline" disabled={bulkBusy} onClick={forceActivateAllTrierInactive}><Zap className="h-4 w-4 mr-2" /> {bulkBusy ? "Ativando..." : "Ativar inativos no Trier"}</Button>
          <Button variant="outline" onClick={() => setReorderOpen(true)}><Star className="h-4 w-4 mr-2" /> Organizar Mais Vendidos</Button>
          <Button variant="outline" asChild><Link to="/admin/produtos/reconciliar"><Upload className="h-4 w-4 mr-2" /> Reconciliar</Link></Button>
          <Button variant="outline" asChild><Link to="/admin/produtos/importar"><Upload className="h-4 w-4 mr-2" /> Importar produtos</Link></Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo Produto</Button>
        </div>
      </div>
      <BestsellersReorderDialog open={reorderOpen} onOpenChange={setReorderOpen} />

      <div className="bg-card border rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {cats?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={manuFilter} onValueChange={setManuFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Fabricante" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Todos fabricantes</SelectItem>
            {manufacturers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="sale">Em oferta</SelectItem>
            <SelectItem value="low">Estoque baixo</SelectItem>
            <SelectItem value="negative_stock">Estoque negativo (&lt; 0)</SelectItem>
            <SelectItem value="stock_inactive">Stock&gt;0 mas inativos</SelectItem>
            <SelectItem value="no_barcode_stock">Sem EAN + stock&gt;0</SelectItem>
            <SelectItem value="no_image_stock">Sem imagem + stock&gt;0</SelectItem>
            <SelectItem value="readjusted">Reajuste do Trier (7d)</SelectItem>
            <SelectItem value="readjusted_up">Reajuste ▲ (aumentou)</SelectItem>
            <SelectItem value="readjusted_down">Reajuste ▼ (baixou)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="p-3">Foto</th><th className="p-3">Nome</th><th className="p-3">Categoria</th>
              <th className="p-3">Fabricante</th><th className="p-3">Preço</th><th className="p-3">Promo</th>
              <th className="p-3">Estoque</th><th className="p-3">Vitrines</th><th className="p-3">Status</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p: any) => {
              const low = p.stock <= (p.minimum_stock ?? 5);
              const onSale = p.on_sale || p.promo_price;
              const adj = (trierAdjust as Record<string, any>)[p.id];
              const adjDiff = adj ? Number(adj.new_price ?? 0) - Number(adj.old_price ?? 0) : 0;
              const adjPct = adj && Number(adj.old_price ?? 0) > 0 ? (adjDiff / Number(adj.old_price)) * 100 : 0;
              return (
                <tr key={p.id} className={`border-t hover:bg-secondary/40 ${adj ? "bg-amber-50/60 dark:bg-amber-500/5" : ""}`}>
                  <td className="p-2">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-10 h-10 object-contain rounded border" /> : <div className="w-10 h-10 bg-secondary rounded" />}</td>
                  <td className="p-3 font-medium max-w-[220px]">
                    {p.name}
                    {adj && (
                      <span
                        title={`Reajuste do Trier em ${new Date(adj.changed_at).toLocaleString("pt-BR")}: ${formatBRL(adj.old_price)} → ${formatBRL(adj.new_price)}`}
                        className="ml-2 inline-flex items-center gap-1 rounded bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 align-middle"
                      >
                        REAJUSTE {adjDiff > 0 ? "▲" : "▼"} {Math.abs(adjPct).toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{p.categories?.name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{p.manufacturer || "—"}</td>
                  <td className="p-3">{formatBRL(p.price)}</td>
                  <td className="p-3">{p.promo_price ? <span className="text-primary font-bold">{formatBRL(p.promo_price)}</span> : "—"}</td>

                  <td className={`p-3 font-semibold ${low ? "text-primary" : ""}`}>
                    {low && <AlertTriangle className="inline h-3 w-3 mr-1" />}{p.stock}
                  </td>
                  <td className="p-3 text-xs">{(p.shelves || []).length} {onSale && <span className="ml-1 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px]">OFERTA</span>}</td>
                  <td className="p-3">
                    {(() => {
                      const st = productAvailabilityStatus(p);
                      return st.available
                        ? <span className="text-whatsapp text-xs font-semibold">Disponível</span>
                        : <span className="text-muted-foreground text-xs">{st.label}</span>;
                    })()}
                    {p.force_active && <span className="block text-[10px] font-bold text-highlight-foreground bg-highlight rounded px-1 mt-1 w-fit">ATIVAÇÃO FORÇADA</span>}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {(p.trier_active === false || p.force_active) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleForceActive(p)}
                        title={p.force_active ? "Remover ativação forçada" : "Forçar ativação (ignorar inativo no Trier)"}
                      >
                        <Zap className={`h-4 w-4 ${p.force_active ? "text-highlight" : "text-amber-500"}`} />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => toggleActive(p)} title={p.active ? "Desativar" : "Ativar"}><Power className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhum produto encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <div className="text-sm text-muted-foreground">
          {effTotal > 0 ? (
            <>Mostrando <strong>{(page - 1) * pageSize + 1}</strong>–<strong>{Math.min(page * pageSize, effTotal)}</strong> de <strong>{effTotal}</strong> produtos</>
          ) : "Sem resultados"}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Por página:</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
          <span className="text-sm px-2">Página <strong>{page}</strong> de <strong>{effTotalPages}</strong></span>
          <Button variant="outline" size="sm" disabled={page >= effTotalPages} onClick={() => setPage((p) => Math.min(effTotalPages, p + 1))}>Próxima</Button>
          <Button variant="outline" size="sm" disabled={page >= effTotalPages} onClick={() => setPage(effTotalPages)}>»</Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="basic">Básico</TabsTrigger>
              <TabsTrigger value="images">Imagens</TabsTrigger>
              <TabsTrigger value="price">Preço</TabsTrigger>
              <TabsTrigger value="stock">Estoque</TabsTrigger>
              <TabsTrigger value="variants">Variações</TabsTrigger>
              <TabsTrigger value="shelf">Exibição na Home</TabsTrigger>
              <TabsTrigger value="generic">Genérico</TabsTrigger>
              <TabsTrigger value="related">Relacionados</TabsTrigger>
              <TabsTrigger value="commercial">Comercial</TabsTrigger>
              <TabsTrigger value="reg">Regulatório</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1"><Label>Nome *</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Slug (auto se vazio)</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder={editing.name && slugify(editing.name)} /></div>
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <Select value={editing.category_id} onValueChange={(v) => setEditing({ ...editing, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{cats?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Fabricante / Laboratório</Label><Input value={editing.manufacturer || ""} onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })} /></div>
                <div className="space-y-1"><Label>Princípio ativo</Label><Input value={editing.active_ingredient || ""} onChange={(e) => setEditing({ ...editing, active_ingredient: e.target.value })} /></div>
                <div className="space-y-1"><Label>SKU</Label><Input value={editing.sku || ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} /></div>
                <div className="space-y-1"><Label>Código de barras</Label><Input value={editing.barcode || ""} onChange={(e) => setEditing({ ...editing, barcode: e.target.value })} /></div>
                <div className="col-span-2 space-y-1"><Label>Descrição curta</Label><Input value={editing.short_description || ""} onChange={(e) => setEditing({ ...editing, short_description: e.target.value })} placeholder="Aparece em destaques" /></div>
                <div className="col-span-2 space-y-1"><Label>Descrição completa</Label><Textarea rows={4} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              </div>
            </TabsContent>

            <TabsContent value="images" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label>Imagem principal</Label>
                {editing.image_url && <img src={editing.image_url} alt="" className="w-32 h-32 object-contain border rounded" />}
                <Input type="file" accept="image/*" onChange={(e) => setMainFile(e.target.files?.[0] || null)} />
                {mainFile && <div className="text-xs text-muted-foreground">Nova imagem: {mainFile.name}</div>}
              </div>
              <div className="space-y-2 border-t pt-3">
                <Label>Galeria de imagens</Label>
                <div className="flex flex-wrap gap-2">
                  {(editing.gallery_images || []).map((u: string) => (
                    <div key={u} className="relative">
                      <img src={u} alt="" className="w-20 h-20 object-contain border rounded" />
                      <button onClick={() => removeGallery(u)} className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
                <Input type="file" accept="image/*" multiple onChange={(e) => setGalleryFiles(Array.from(e.target.files || []))} />
                {galleryFiles.length > 0 && <div className="text-xs text-muted-foreground">{galleryFiles.length} nova(s) imagem(ns)</div>}
              </div>
            </TabsContent>

            <TabsContent value="price" className="space-y-3 pt-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-secondary/40">
                  <input type="checkbox" className="mt-0.5" checked={!!editing.lock_base_price} onChange={(e) => setEditing({ ...editing, lock_base_price: e.target.checked })} />
                  <span>
                    <span className="font-medium">Travar preço normal</span>
                    <span className="block text-xs text-muted-foreground">Impede o sistema da farmácia de atualizar o preço normal. Deixe desmarcado para manter o preço sempre sincronizado.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-secondary/40">
                  <input type="checkbox" className="mt-0.5" checked={editing.promo_price != null ? true : !!editing.lock_promotion} disabled={editing.promo_price != null} onChange={(e) => setEditing({ ...editing, lock_promotion: e.target.checked })} />
                  <span>
                    <span className="font-medium">Proteger promoção</span>
                    <span className="block text-xs text-muted-foreground">Protege a <strong>base de desconto (%)</strong>: se o sistema da farmácia mudar o preço normal, o preço promocional é recalculado mantendo o mesmo percentual. A oferta nunca é apagada pela sincronização.</span>
                  </span>
                </label>
              </div>
              {editing.promo_price != null && Number(editing.promo_price) >= Number(editing.price || 0) && Number(editing.price || 0) > 0 && (
                <div className="text-xs rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-3">
                  Promoção inconsistente: o preço promocional está maior ou igual ao preço normal. O desconto não aparece no site até você corrigir.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Preço normal (R$) *</Label><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></div>
                <div className="space-y-1"><Label>Preço promocional (R$)</Label><Input type="number" step="0.01" value={editing.promo_price ?? ""} onChange={(e) => setEditing({ ...editing, promo_price: e.target.value || null })} /></div>
                <div className="space-y-1">
                  <Label>Desconto (%)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="ex.: 14,5"
                    value={pctInput ?? (discountPct ? String(discountPct).replace(".", ",") : "")}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setPctInput(raw);
                      const pct = Number(raw.replace(",", "."));
                      const base = Number(editing.price);
                      if (!raw.trim()) {
                        setEditing({ ...editing, promo_price: null });
                      } else if (!isNaN(pct) && pct > 0 && pct < 100 && base > 0) {
                        const promo = +(base * (1 - pct / 100)).toFixed(2);
                        setEditing({ ...editing, promo_price: promo, on_sale: true });
                      }
                    }}
                    onBlur={() => setPctInput(null)}
                  />
                  <p className="text-[11px] text-muted-foreground">Aceita casas decimais (ex.: 14,5% ou 14,25%).</p>
                </div>

                <div className="flex items-center gap-2 mt-6"><Switch checked={editing.on_sale} onCheckedChange={(v) => setEditing({ ...editing, on_sale: v })} /><Label>Em promoção</Label></div>
                <div className="space-y-1"><Label>Início da promoção</Label><Input type="datetime-local" value={editing.promotion_start?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, promotion_start: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>Fim da promoção</Label><Input type="datetime-local" value={editing.promotion_end?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, promotion_end: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>Desconto Pix do produto (%)</Label><Input type="number" step="0.01" min="0" max="100" value={editing.pix_discount_percentage ?? ""} onChange={(e) => setEditing({ ...editing, pix_discount_percentage: e.target.value || null })} placeholder="usa o global se vazio" /></div>
                <div className="space-y-1"><Label>Limite por carrinho</Label><Input type="number" min="1" value={editing.cart_quantity_limit ?? ""} onChange={(e) => setEditing({ ...editing, cart_quantity_limit: e.target.value || null })} placeholder="sem limite" /></div>
              </div>

              <div className="border-t pt-4 mt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-bold">Preços por canal</Label>
                    <p className="text-xs text-muted-foreground">Defina preço específico para o site e para o WhatsApp/loja. Em branco = usa o preço normal acima.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!editing.use_channel_pricing} onCheckedChange={(v) => setEditing({ ...editing, use_channel_pricing: v })} />
                    <Label className="text-xs">Usar preço por canal</Label>
                  </div>
                </div>

                <label className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-secondary/40">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={!!editing.lock_channel_discount}
                    onChange={(e) => setEditing({ ...editing, lock_channel_discount: e.target.checked })}
                  />
                  <span>
                    <span className="font-medium">Travar desconto (%) por canal</span>
                    <span className="block text-xs text-muted-foreground">
                      Com a trava ativa, o que vale é o <strong>percentual</strong>: sempre que o preço normal mudar (inclusive pelo sistema da farmácia), os preços do site e do WhatsApp/loja são recalculados automaticamente com o mesmo desconto.
                    </span>
                  </span>
                </label>

                {(() => {
                  const base = Number(editing.price_base || editing.price || 0);
                  const setPct = (pctField: string, priceField: string, raw: string) => {
                    if (!raw) { setEditing({ ...editing, [pctField]: null }); return; }
                    const pct = Number(raw.replace(",", "."));
                    const next: any = { ...editing, [pctField]: raw.replace(",", ".") };
                    if (base > 0 && pct > 0 && pct < 100) {
                      next[priceField] = +(base * (1 - pct / 100)).toFixed(2);
                    }
                    setEditing(next);
                  };

                  const setPrice = (pctField: string, priceField: string, raw: string) => {
                    const next: any = { ...editing, [priceField]: raw || null };
                    const val = Number(raw);
                    if (base > 0 && val > 0 && val < base) {
                      next[pctField] = +((1 - val / base) * 100).toFixed(2);
                    } else if (!raw) {
                      next[pctField] = null;
                    }
                    setEditing(next);
                  };
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>Preço base (Trier) R$</Label><Input type="number" step="0.01" value={editing.price_base ?? ""} onChange={(e) => setEditing({ ...editing, price_base: e.target.value || null })} placeholder="ex: vindo da Trier" /></div>
                      <div className="hidden sm:block" />
                      <div className="space-y-1">
                        <Label>Desconto do site (%)</Label>
                        <Input type="text" inputMode="decimal" placeholder="ex.: 10,5" value={editing.site_discount_percentage ?? ""} onChange={(e) => setPct("site_discount_percentage", "site_price", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Preço do site R$</Label>
                        <Input type="number" step="0.01" value={editing.site_price ?? ""} onChange={(e) => setPrice("site_discount_percentage", "site_price", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Desconto WhatsApp/loja (%)</Label>
                        <Input type="text" inputMode="decimal" placeholder="ex.: 15,25" value={editing.whatsapp_discount_percentage ?? ""} onChange={(e) => setPct("whatsapp_discount_percentage", "whatsapp_price", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Preço WhatsApp/loja R$</Label>
                        <Input type="number" step="0.01" value={editing.whatsapp_price ?? ""} onChange={(e) => setPrice("whatsapp_discount_percentage", "whatsapp_price", e.target.value)} />
                      </div>
                      <div className="space-y-1"><Label>Preço promo do site R$</Label><Input type="number" step="0.01" value={editing.site_promo_price ?? ""} onChange={(e) => setEditing({ ...editing, site_promo_price: e.target.value || null })} /></div>
                      <div className="space-y-1"><Label>Preço promo WhatsApp R$</Label><Input type="number" step="0.01" value={editing.whatsapp_promo_price ?? ""} onChange={(e) => setEditing({ ...editing, whatsapp_promo_price: e.target.value || null })} /></div>
                      <div className="col-span-2 space-y-1"><Label>Observação interna de preço</Label><Input value={editing.channel_price_notes || ""} onChange={(e) => setEditing({ ...editing, channel_price_notes: e.target.value })} placeholder="visível apenas no admin" /></div>
                    </div>
                  );
                })()}

                {(() => {
                  const num = (v: any) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
                  const base = num(editing.price_base) ?? num(editing.price);
                  const effSite = num(editing.site_promo_price) ?? num(editing.site_price) ?? num(editing.promo_price) ?? base;
                  const effWa = num(editing.whatsapp_promo_price) ?? num(editing.whatsapp_price) ?? num(editing.site_promo_price) ?? num(editing.site_price) ?? num(editing.promo_price) ?? base;
                  const fmt = (n: number | null) => n == null ? "—" : `R$ ${n.toFixed(2).replace(".", ",")}`;
                  const differ = effSite != null && effWa != null && effSite !== effWa;
                  return (
                    <div className="text-xs bg-secondary/40 border rounded p-2 space-y-1">
                      <div>Preço usado no <strong>site</strong>: <span className="font-semibold">{fmt(effSite)}</span></div>
                      <div>Preço usado no <strong>WhatsApp/loja</strong>: <span className="font-semibold">{fmt(effWa)}</span></div>
                      {differ && <div className="text-primary font-semibold">⚠ Este produto possui preço diferente para WhatsApp/loja.</div>}
                    </div>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="stock" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Quantidade em estoque</Label><Input type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} /></div>
                <div className="space-y-1"><Label>Estoque mínimo (alerta)</Label><Input type="number" value={editing.minimum_stock} onChange={(e) => setEditing({ ...editing, minimum_stock: e.target.value })} /></div>
                <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Produto disponível (ativo)</Label></div>
              </div>
              {Number(editing.stock) <= Number(editing.minimum_stock || 0) && (
                <div className="bg-primary/10 text-primary text-sm p-2 rounded flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Estoque baixo!</div>
              )}
              <TrierStockSyncButton
                productId={editing.id}
                barcode={editing.barcode}
                onUpdated={(newStock) => setEditing((prev: any) => ({ ...prev, stock: newStock }))}
              />
            </TabsContent>


            <TabsContent value="variants" className="pt-3">
              {editing.id ? (
                <ProductVariantsManager productId={editing.id} />
              ) : (
                <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                  Salve o produto primeiro (botão <strong>Salvar e continuar</strong>) para cadastrar variações como tamanhos, sabores ou volumes.
                </div>
              )}
            </TabsContent>



            <TabsContent value="shelf" className="space-y-3 pt-3">
              <div className="flex items-center gap-2"><Switch checked={editing.featured} onCheckedChange={(v) => setEditing({ ...editing, featured: v })} /><Label>Destaque na home</Label></div>
              <div>
                <Label className="font-bold text-base">Exibição na Home</Label>
                <p className="text-xs text-muted-foreground mb-2">Marque em quais prateleiras este produto deve aparecer na home.</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SHELVES.map((s) => (
                    <label key={s.slug} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-secondary border">
                      <input type="checkbox" className="h-4 w-4 accent-primary" checked={(editing.shelves || []).includes(s.slug)} onChange={() => toggleShelf(s.slug)} />
                      Mostrar em {s.label}
                    </label>
                  ))}
                </div>
                {(editing.shelves || []).includes("ofertas-da-semana") && !editing.promo_price && (
                  <div className="mt-3 bg-primary/10 text-primary text-xs p-2 rounded flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Para aparecer em "Ofertas da Semana" com desconto, defina um preço promocional na aba Preço.</div>
                )}
              </div>
              <div className="space-y-1 pt-2 border-t">
                <Label>Selo do produto</Label>
                <Select value={editing.product_badge || "none"} onValueChange={(v) => setEditing({ ...editing, product_badge: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {BADGES.filter(Boolean).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 pt-2 border-t">
                <Label className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" /> Posição em "Mais Vendidos"</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Vazio = não aparece"
                  value={editing.bestseller_rank ?? ""}
                  onChange={(e) => setEditing({ ...editing, bestseller_rank: e.target.value ? Number(e.target.value) : null })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Menor número aparece primeiro. Use o botão <strong>Organizar Mais Vendidos</strong> no topo para arrastar e ordenar visualmente.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="generic" className="space-y-4 pt-3">
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-emerald-50">
                <Switch
                  checked={!!editing.is_generic}
                  onCheckedChange={(v) => setEditing({ ...editing, is_generic: v, generic_equivalent_id: v ? null : editing.generic_equivalent_id })}
                />
                <div>
                  <Label className="font-semibold">Este produto é um genérico</Label>
                  <p className="text-[11px] text-muted-foreground">Marque para que ele possa ser sugerido como alternativa mais barata em produtos de marca.</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Princípio ativo</Label>
                <Input value={editing.active_ingredient || ""} onChange={(e) => setEditing({ ...editing, active_ingredient: e.target.value })} placeholder="Ex.: Paracetamol 500mg" />
                <p className="text-[11px] text-muted-foreground">
                  Usado para sugerir genéricos automaticamente quando dois produtos têm o mesmo princípio ativo.
                </p>
              </div>

              {!editing.is_generic && (
                <div className="space-y-1 pt-3 border-t">
                  <Label>Genérico equivalente (manual)</Label>
                  <GenericEquivalentPicker
                    currentId={editing.generic_equivalent_id}
                    selfId={editing.id}
                    onPick={(id) => setEditing({ ...editing, generic_equivalent_id: id })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Quando definido, este vínculo tem prioridade sobre a busca automática por princípio ativo.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="related" className="pt-3">
              {editing.id ? (
                <RelatedProductsPicker productId={editing.id} />
              ) : (
                <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                  Salve o produto primeiro (botão <strong>Salvar e continuar</strong>) para definir produtos relacionados.
                </div>
              )}
            </TabsContent>

            <TabsContent value="commercial" className="pt-3">
              <CommercialClassificationTab productId={editing.id || null} />
            </TabsContent>




            <TabsContent value="reg" className="space-y-3 pt-3">
              <div className="flex items-center gap-2"><Switch checked={editing.requires_prescription} onCheckedChange={(v) => setEditing({ ...editing, requires_prescription: v })} /><Label>Exige receita</Label></div>
              <div className="flex items-center gap-2"><Switch checked={editing.controlled} onCheckedChange={(v) => setEditing({ ...editing, controlled: v })} /><Label>Medicamento controlado</Label></div>
              <div className="space-y-1">
                <Label>Tarja</Label>
                <Select value={editing.tarja || "none"} onValueChange={(v) => setEditing({ ...editing, tarja: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Sem tarja</SelectItem>{TARJAS.filter(Boolean).map((t) => <SelectItem key={t} value={t}>Tarja {t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Aviso personalizado</Label><Textarea rows={2} value={editing.custom_warning || ""} onChange={(e) => setEditing({ ...editing, custom_warning: e.target.value })} /></div>
            </TabsContent>

            <TabsContent value="seo" className="space-y-3 pt-3">
              <div className="space-y-1"><Label>Título SEO</Label><Input value={editing.seo_title || ""} onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })} /></div>
              <div className="space-y-1"><Label>Descrição SEO</Label><Textarea rows={3} value={editing.seo_description || ""} onChange={(e) => setEditing({ ...editing, seo_description: e.target.value })} /></div>
              <div className="space-y-1"><Label>Palavras-chave</Label><Input value={editing.seo_keywords || ""} onChange={(e) => setEditing({ ...editing, seo_keywords: e.target.value })} placeholder="medicamento, farmácia, ..." /></div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap gap-2 pt-4 border-t mt-4">
            <Button onClick={() => save(false)} className="flex-1">Salvar</Button>
            <Button variant="outline" onClick={() => save(true)}>Salvar e continuar</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            {editing.id && <Button variant="ghost" className="text-primary" onClick={() => { remove(editing.id); setOpen(false); }}><Trash2 className="h-4 w-4 mr-1" />Excluir</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GenericEquivalentPicker({ currentId, selfId, onPick }: { currentId: string | null; selfId: string; onPick: (id: string | null) => void }) {
  const [current, setCurrent] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (!currentId) { setCurrent(null); return; }
    supabase.from("products").select("id,name,manufacturer,image_url,price,promo_price").eq("id", currentId).maybeSingle().then(({ data }) => setCurrent(data));
  }, [currentId]);

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,manufacturer,image_url,price,promo_price")
        .eq("is_generic", true)
        .eq("active", true)
        .ilike("name", `%${search}%`)
        .neq("id", selfId || "00000000-0000-0000-0000-000000000000")
        .limit(8);
      setResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, selfId]);

  if (current) {
    return (
      <div className="flex items-center gap-2 border rounded-md p-2 bg-background">
        {current.image_url && <img src={current.image_url} alt="" className="h-10 w-10 object-contain" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{current.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {current.manufacturer || "—"} · {formatBRL(Number(current.promo_price ?? current.price))}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => onPick(null)}><X className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
      <Input className="pl-8" placeholder="Buscar genérico..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onPick(r.id); setCurrent(r); setSearch(""); setResults([]); }}
              className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left text-sm"
            >
              {r.image_url && <img src={r.image_url} alt="" className="h-8 w-8 object-contain shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.manufacturer || "—"} · {formatBRL(Number(r.promo_price ?? r.price))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {search.length >= 2 && results.length === 0 && (
        <div className="text-xs text-muted-foreground mt-2">
          Nenhum genérico encontrado. Marque produtos como "genérico" na própria aba para que apareçam aqui.
        </div>
      )}
    </div>
  );
}

function TrierStockSyncButton({
  productId,
  barcode,
  onUpdated,
}: {
  productId: string;
  barcode: string;
  onUpdated: (newStock: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const run = async () => {
    if (!productId) {
      toast.error("Salve o produto antes de sincronizar.");
      return;
    }
    if (!barcode) {
      toast.error("Cadastre o código de barras antes de sincronizar com o Trier.");
      return;
    }
    setLoading(true);
    setInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke("trier", {
        body: { action: "sync-stock-single", product_id: productId },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.error || "Falha ao sincronizar estoque");
        setInfo(data?.error || "Falha");
        return;
      }
      onUpdated(Number(data.stock_after ?? 0));
      toast.success(`Estoque atualizado: ${data.stock_before ?? "?"} → ${data.stock_after ?? 0}`);
      setInfo(
        `Trier código ${data.trier_id || "?"} · estoque loja ${data.trier_stock_quantity ?? "—"} · site ${data.stock_after}`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Erro ao chamar Trier");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-secondary/40 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <div className="font-semibold">Atualizar estoque pelo Trier</div>
          <div className="text-xs text-muted-foreground">
            Consulta o Trier pelo código de barras ({barcode || "sem EAN"}) e grava o estoque agora, sem esperar a sincronização automática.
          </div>
        </div>
        <Button type="button" size="sm" onClick={run} disabled={loading || !productId || !barcode}>
          {loading ? "Consultando Trier..." : "Atualizar estoque do Trier agora"}
        </Button>
      </div>
      {info && <div className="text-xs text-muted-foreground">{info}</div>}
    </div>
  );
}

