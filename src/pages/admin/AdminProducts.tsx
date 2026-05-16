import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, X, Power, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/store";

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
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function AdminProducts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () =>
      (await supabase.from("products").select("*, categories(name)").order("created_at", { ascending: false })).data || [],
  });
  const { data: cats } = useQuery({
    queryKey: ["admin_cats_list"],
    queryFn: async () => (await supabase.from("categories").select("*").order("position")).data || [],
  });

  const filtered = useMemo(() => {
    return (products || []).filter((p: any) => {
      if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (catFilter !== "all" && p.category_id !== catFilter) return false;
      if (statusFilter === "active" && !p.active) return false;
      if (statusFilter === "inactive" && p.active) return false;
      if (statusFilter === "sale" && !(p.on_sale || p.promo_price)) return false;
      if (statusFilter === "low" && !(p.stock <= (p.minimum_stock ?? 5))) return false;
      return true;
    });
  }, [products, search, catFilter, statusFilter]);

  const openNew = () => { setEditing(empty); setMainFile(null); setGalleryFiles([]); setOpen(true); };
  const openEdit = (p: any) => {
    setEditing({ ...empty, ...p, category_id: p.category_id || "", shelves: p.shelves || [], gallery_images: p.gallery_images || [] });
    setMainFile(null); setGalleryFiles([]); setOpen(true);
  };

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
      let gallery_images = [...(editing.gallery_images || [])];
      for (const f of galleryFiles) gallery_images.push(await uploadOne(f));

      const payload: any = {
        ...editing, slug, image_url, gallery_images,
        category_id: editing.category_id || null,
        price: Number(editing.price),
        promo_price: editing.promo_price ? Number(editing.promo_price) : null,
        stock: Number(editing.stock || 0),
        minimum_stock: Number(editing.minimum_stock || 0),
        promotion_start: editing.promotion_start || null,
        promotion_end: editing.promotion_end || null,
        tarja: editing.tarja || null,
        product_badge: editing.product_badge || null,
      };
      delete payload.categories;
      delete payload.discount_percentage; // generated column

      let saved;
      if (editing.id) {
        const { data, error } = await supabase.from("products").update(payload).eq("id", editing.id).select().single();
        if (error) throw error; saved = data;
      } else {
        delete payload.id;
        const { data, error } = await supabase.from("products").insert(payload).select().single();
        if (error) throw error; saved = data;
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

  const remove = async (id: string) => {
    if (!confirm("Excluir produto definitivamente?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["admin_products"] }); }
  };

  const discountPct = useMemo(() => {
    const p = Number(editing.price), pp = Number(editing.promo_price);
    if (!p || !pp || pp >= p) return 0;
    return Math.round((1 - pp / p) * 100);
  }, [editing.price, editing.promo_price]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-extrabold">Produtos</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo Produto</Button>
      </div>

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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="sale">Em oferta</SelectItem>
            <SelectItem value="low">Estoque baixo</SelectItem>
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
            {filtered.map((p: any) => {
              const low = p.stock <= (p.minimum_stock ?? 5);
              const onSale = p.on_sale || p.promo_price;
              return (
                <tr key={p.id} className="border-t hover:bg-secondary/40">
                  <td className="p-2">{p.image_url ? <img src={p.image_url} alt="" className="w-10 h-10 object-contain rounded border" /> : <div className="w-10 h-10 bg-secondary rounded" />}</td>
                  <td className="p-3 font-medium max-w-[220px]">{p.name}</td>
                  <td className="p-3 text-muted-foreground">{p.categories?.name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{p.manufacturer || "—"}</td>
                  <td className="p-3">{formatBRL(p.price)}</td>
                  <td className="p-3">{p.promo_price ? <span className="text-primary font-bold">{formatBRL(p.promo_price)}</span> : "—"}</td>
                  <td className={`p-3 font-semibold ${low ? "text-primary" : ""}`}>
                    {low && <AlertTriangle className="inline h-3 w-3 mr-1" />}{p.stock}
                  </td>
                  <td className="p-3 text-xs">{(p.shelves || []).length} {onSale && <span className="ml-1 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px]">OFERTA</span>}</td>
                  <td className="p-3">{p.active ? <span className="text-whatsapp text-xs font-semibold">Ativo</span> : <span className="text-muted-foreground text-xs">Inativo</span>}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => toggleActive(p)} title={p.active ? "Desativar" : "Ativar"}><Power className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhum produto encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>

          <Tabs defaultValue="basic">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="basic">Básico</TabsTrigger>
              <TabsTrigger value="images">Imagens</TabsTrigger>
              <TabsTrigger value="price">Preço</TabsTrigger>
              <TabsTrigger value="stock">Estoque</TabsTrigger>
              <TabsTrigger value="shelf">Vitrine</TabsTrigger>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Preço normal (R$) *</Label><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></div>
                <div className="space-y-1"><Label>Preço promocional (R$)</Label><Input type="number" step="0.01" value={editing.promo_price ?? ""} onChange={(e) => setEditing({ ...editing, promo_price: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>Desconto</Label><Input value={discountPct ? `${discountPct}%` : "—"} disabled /></div>
                <div className="flex items-center gap-2 mt-6"><Switch checked={editing.on_sale} onCheckedChange={(v) => setEditing({ ...editing, on_sale: v })} /><Label>Em promoção</Label></div>
                <div className="space-y-1"><Label>Início da promoção</Label><Input type="datetime-local" value={editing.promotion_start?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, promotion_start: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>Fim da promoção</Label><Input type="datetime-local" value={editing.promotion_end?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, promotion_end: e.target.value || null })} /></div>
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
            </TabsContent>

            <TabsContent value="shelf" className="space-y-3 pt-3">
              <div className="flex items-center gap-2"><Switch checked={editing.featured} onCheckedChange={(v) => setEditing({ ...editing, featured: v })} /><Label>Destaque na home</Label></div>
              <div>
                <Label className="font-bold">Aparece nas vitrines da home</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SHELVES.map((s) => (
                    <label key={s.slug} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-secondary">
                      <input type="checkbox" className="h-4 w-4 accent-primary" checked={(editing.shelves || []).includes(s.slug)} onChange={() => toggleShelf(s.slug)} />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t">
                <Label>Selo do produto</Label>
                <Select value={editing.product_badge || ""} onValueChange={(v) => setEditing({ ...editing, product_badge: v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>{BADGES.map((b) => <SelectItem key={b || "none"} value={b || "none"}>{b || "Nenhum"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
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
