import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminProductBasicTab } from "@/components/admin/products/editor/AdminProductBasicTab";
import { AdminProductImagesTab } from "@/components/admin/products/editor/AdminProductImagesTab";
import { AdminProductPriceTab } from "@/components/admin/products/editor/AdminProductPriceTab";
import { AdminProductStockTab } from "@/components/admin/products/editor/AdminProductStockTab";
import { AdminProductDisplayTab } from "@/components/admin/products/editor/AdminProductDisplayTab";
import { AdminProductGenericTab } from "@/components/admin/products/editor/AdminProductGenericTab";
import { AdminProductRegulatoryTab } from "@/components/admin/products/editor/AdminProductRegulatoryTab";
import { AdminProductSeoTab } from "@/components/admin/products/editor/AdminProductSeoTab";

const slugify = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const initialValue: any = {
  id: "",
  name: "Produto de validação",
  slug: "",
  category_id: "",
  short_description: "",
  description: "",
  image_url: "",
  gallery_images: [],
  manufacturer: "",
  active_ingredient: "",
  sku: "",
  barcode: "",
  price: 100,
  promo_price: null,
  on_sale: false,
  promotion_start: null,
  promotion_end: null,
  pix_discount_percentage: null,
  cart_quantity_limit: null,
  price_base: 100,
  site_price: null,
  whatsapp_price: null,
  site_promo_price: null,
  whatsapp_promo_price: null,
  use_channel_pricing: false,
  channel_price_notes: "",
  site_discount_percentage: null,
  whatsapp_discount_percentage: null,
  lock_channel_discount: false,
  lock_base_price: false,
  lock_promotion: false,
  stock: 10,
  minimum_stock: 5,
  active: true,
  featured: false,
  shelves: [],
  product_badge: "",
  bestseller_rank: null,
  is_generic: false,
  generic_equivalent_id: null,
  requires_prescription: false,
  controlled: false,
  tarja: "",
  custom_warning: "",
  seo_title: "",
  seo_description: "",
  seo_keywords: "",
};

export default function AdminProductEditorCanary() {
  const [editing, setEditing] = useState<any>(initialValue);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-5 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Editor de produto — validação modular</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Ambiente canário da Etapa 6. Os campos abaixo usam estado local. Salvar produto, gravar estoque e alterar o cadastro oficial estão desativados nesta tela.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <Tabs defaultValue="basic">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="basic">Básico</TabsTrigger>
            <TabsTrigger value="images">Imagens</TabsTrigger>
            <TabsTrigger value="price">Preço</TabsTrigger>
            <TabsTrigger value="stock">Estoque</TabsTrigger>
            <TabsTrigger value="display">Exibição/Home</TabsTrigger>
            <TabsTrigger value="generic">Genérico</TabsTrigger>
            <TabsTrigger value="regulatory">Regulatório</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="pt-4">
            <AdminProductBasicTab value={editing} categories={[]} onChange={setEditing} slugify={slugify} />
          </TabsContent>

          <TabsContent value="images" className="pt-4">
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

          <TabsContent value="display" className="pt-1">
            <AdminProductDisplayTab editing={editing} setEditing={setEditing} />
          </TabsContent>

          <TabsContent value="generic" className="pt-1">
            <AdminProductGenericTab editing={editing} setEditing={setEditing} />
          </TabsContent>

          <TabsContent value="regulatory" className="pt-1">
            <AdminProductRegulatoryTab editing={editing} setEditing={setEditing} />
          </TabsContent>

          <TabsContent value="seo" className="pt-1">
            <AdminProductSeoTab editing={editing} setEditing={setEditing} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
