import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Star, Trash2, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductVariantsManager } from "@/components/admin/ProductVariantsManager";
import { RelatedProductsPicker } from "@/components/admin/RelatedProductsPicker";
import { BestsellersReorderDialog } from "@/components/admin/BestsellersReorderDialog";
import { CommercialClassificationTab } from "@/components/admin/CommercialClassificationTab";
import { AdminProductsListView } from "@/components/admin/products/AdminProductsListView";
import { AdminProductBasicTab } from "@/components/admin/products/editor/AdminProductBasicTab";
import { AdminProductImagesTab } from "@/components/admin/products/editor/AdminProductImagesTab";
import { AdminProductPriceTab } from "@/components/admin/products/editor/AdminProductPriceTab";
import { AdminProductStockTab } from "@/components/admin/products/editor/AdminProductStockTab";
import { AdminProductDisplayTab } from "@/components/admin/products/editor/AdminProductDisplayTab";
import { AdminProductGenericTab } from "@/components/admin/products/editor/AdminProductGenericTab";
import { AdminProductRegulatoryTab } from "@/components/admin/products/editor/AdminProductRegulatoryTab";
import { AdminProductSeoTab } from "@/components/admin/products/editor/AdminProductSeoTab";
import { useAdminProductsList } from "@/hooks/admin/useAdminProductsList";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

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

const slugify = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const loadAdminProductDetail = async (id: string) => {
  const { data, error } = await (supabase as any).rpc("admin_product_detail", { _id: id });
  if (error) throw error;
  return data;
};

export default function AdminProductsIntegrated() {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [activeTab, setActiveTab] = useState("basic");
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [catFilter, setCatFilter] = useState(searchParams.get("category") || "all");
  const [manuFilter, setManuFilter] = useState(searchParams.get("manufacturer") || "all");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search, catFilter, manuFilter, statusFilter, pageSize]);

  const {
    cats,
    manufacturers,
    trierAdjust,
    pageRows,
    effTotal,
    effTotalPages,
  } = useAdminProductsList({ search, catFilter, manuFilter, statusFilter, page, pageSize });

  const refreshProducts = () => qc.invalidateQueries({ queryKey: ["admin_products"] });

  const openNew = () => {
    setEditing(empty);
    setMainFile(null);
    setGalleryFiles([]);
    setOpen(true);
  };

  const openEdit = (product: any, tab = "basic") => {
    setEditing({
      ...empty,
      ...product,
      category_id: product.category_id || "",
      shelves: product.shelves || [],
      gallery_images: product.gallery_images || [],
    });
    setMainFile(null);
    setGalleryFiles([]);
    setActiveTab(tab);
    setOpen(true);
  };

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
      } catch (error: any) {
        toast.error(error?.message || "Erro ao carregar produto");
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("edit");
        next.delete("tab");
        setSearchParams(next, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const uploadOne = async (file: File) => {
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error } = await supabase.storage.from("products").upload(path, file);
    if (error) throw error;
    return supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
  };

  const save = async (keepOpen = false) => {
    try {
      if (!editing.name?.trim()) {
        toast.error("Nome é obrigatório");
        return;
      }
      if (!editing.price || Number(editing.price) <= 0) {
        toast.error("Preço deve ser maior que zero");
        return;
      }

      const slug = editing.slug || slugify(editing.name);
      let image_url = editing.image_url;
      if (mainFile) image_url = await uploadOne(mainFile);

      const gallery_images = [...(editing.gallery_images || [])];
      for (const file of galleryFiles) gallery_images.push(await uploadOne(file));

      const shelvesArr: string[] = editing.shelves || [];
      const hasOffersShelf = shelvesArr.includes("ofertas-da-semana");
      const promoNum = editing.promo_price ? Number(editing.promo_price) : null;
      const autoOnSale = hasOffersShelf && promoNum != null && promoNum < Number(editing.price);
      const toNumOrNull = (value: any) => (value === "" || value == null ? null : Number(value));

      const payload: any = {
        ...editing,
        slug,
        image_url,
        gallery_images,
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
        lock_base_price: !!editing.lock_base_price,
        lock_promotion: promoNum != null ? true : !!editing.lock_promotion,
        promotion_source: promoNum != null
          ? (editing.promotion_source && editing.promotion_source !== "none" ? editing.promotion_source : "manual")
          : "none",
        lock_manual_price: false,
      };

      delete payload.categories;
      delete payload.category_display_name;
      delete payload.discount_percentage;

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
      refreshProducts();
      qc.invalidateQueries({ queryKey: ["shelf"] });

      if (keepOpen) {
        setEditing({
          ...empty,
          ...saved,
          shelves: saved.shelves || [],
          gallery_images: saved.gallery_images || [],
        });
        setMainFile(null);
        setGalleryFiles([]);
      } else {
        setOpen(false);
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleActive = async (product: any) => {
    const { error } = await supabase.from("products").update({ active: !product.active }).eq("id", product.id);
    if (error) toast.error(error.message);
    else {
      toast.success(product.active ? "Desativado" : "Ativado");
      refreshProducts();
    }
  };

  const toggleForceActive = async (product: any) => {
    const next = !product.force_active;
    const stock = Number(product.stock_quantity ?? product.stock ?? 0);
    const { error } = await supabase
      .from("products")
      .update({
        force_active: next,
        active: next ? stock > 0 && !product.manual_disabled && !product.archived_at : false,
      })
      .eq("id", product.id);

    if (error) toast.error(error.message);
    else {
      toast.success(next
        ? "Ativação forçada — o Trier não vai mais desativar este produto"
        : "Ativação forçada removida");
      refreshProducts();
    }
  };

  const forceActivateAllTrierInactive = async () => {
    const approved = await confirmAction({
      title: "Ativar produtos inativos no Trier?",
      description: "Todos os produtos com estoque maior que zero, marcados como inativos no Trier e sem bloqueio manual serão forçados como ativos no site. Esta ação pode afetar muitos produtos de uma vez.",
      confirmLabel: "Ativar produtos",
    });
    if (!approved) return;

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
    else {
      toast.success(`${data?.length ?? 0} produto(s) ativados`);
      refreshProducts();
    }
  };

  const remove = async (id: string) => {
    const approved = await confirmAction({
      title: "Excluir produto definitivamente?",
      description: "O produto será removido do banco de dados. Esta ação é destrutiva e pode afetar vínculos, vitrines, campanhas e histórico operacional associado ao cadastro.",
      confirmLabel: "Excluir produto",
      destructive: true,
    });
    if (!approved) return false;

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }

    toast.success("Excluído");
    refreshProducts();
    return true;
  };

  return (
    <div className="p-6">
      {confirmDialog}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-extrabold">Produtos</h1>
        <div className="flex gap-2">
          <Button variant="outline" disabled={bulkBusy} onClick={forceActivateAllTrierInactive}>
            <Zap className="h-4 w-4 mr-2" /> {bulkBusy ? "Ativando..." : "Ativar inativos no Trier"}
          </Button>
          <Button variant="outline" onClick={() => setReorderOpen(true)}>
            <Star className="h-4 w-4 mr-2" /> Organizar Mais Vendidos
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/produtos/reconciliar"><Upload className="h-4 w-4 mr-2" /> Reconciliar</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/produtos/importar"><Upload className="h-4 w-4 mr-2" /> Importar produtos</Link>
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo Produto</Button>
        </div>
      </div>

      <BestsellersReorderDialog open={reorderOpen} onOpenChange={setReorderOpen} />

      <AdminProductsListView
        search={search}
        onSearchChange={setSearch}
        catFilter={catFilter}
        onCatFilterChange={setCatFilter}
        manuFilter={manuFilter}
        onManuFilterChange={setManuFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        cats={cats}
        manufacturers={manufacturers}
        pageRows={pageRows}
        trierAdjust={trierAdjust}
        page={page}
        pageSize={pageSize}
        effTotal={effTotal}
        effTotalPages={effTotalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onToggleForceActive={toggleForceActive}
        onToggleActive={toggleActive}
        onEdit={openEdit}
        onRemove={remove}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>

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

            <TabsContent value="basic" className="pt-3">
              <AdminProductBasicTab value={editing} categories={cats} onChange={setEditing} slugify={slugify} />
            </TabsContent>

            <TabsContent value="images" className="pt-3">
              <AdminProductImagesTab
                value={editing}
                mainFile={mainFile}
                galleryFiles={galleryFiles}
                onMainFileChange={setMainFile}
                onGalleryFilesChange={setGalleryFiles}
                onChange={setEditing}
              />
            </TabsContent>

            <TabsContent value="price" className="pt-1">
              <AdminProductPriceTab editing={editing} setEditing={setEditing} />
            </TabsContent>

            <TabsContent value="stock" className="pt-1">
              <AdminProductStockTab editing={editing} setEditing={setEditing} />
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

            <TabsContent value="shelf" className="pt-1">
              <AdminProductDisplayTab editing={editing} setEditing={setEditing} />
            </TabsContent>

            <TabsContent value="generic" className="pt-1">
              <AdminProductGenericTab editing={editing} setEditing={setEditing} />
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

            <TabsContent value="reg" className="pt-1">
              <AdminProductRegulatoryTab editing={editing} setEditing={setEditing} />
            </TabsContent>

            <TabsContent value="seo" className="pt-1">
              <AdminProductSeoTab editing={editing} setEditing={setEditing} />
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap gap-2 pt-4 border-t mt-4">
            <Button onClick={() => save(false)} className="flex-1">Salvar</Button>
            <Button variant="outline" onClick={() => save(true)}>Salvar e continuar</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            {editing.id && (
              <Button
                variant="ghost"
                className="text-primary"
                onClick={async () => {
                  const removed = await remove(editing.id);
                  if (removed) setOpen(false);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />Excluir
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
