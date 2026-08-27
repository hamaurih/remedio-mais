import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Search, X, Upload, Star } from "lucide-react";
import { EntityPicker, type PickedEntity } from "@/components/admin/EntityPicker";
import { CampaignAutoBanner } from "@/components/CampaignAutoBanner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type Campaign = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  starts_at: string | null;
  ends_at: string | null;
  banner_image_url: string | null;
  banner_link: string | null;
  cta_text: string | null;
  visual_style: string;
  position: number;
  active: boolean;
  published: boolean;
  banner_mode?: string;
  banner_destination?: string;
  destination_category_id?: string | null;
  destination_product_id?: string | null;
  show_on_home?: boolean;
};

type CampaignProduct = {
  id: string;
  name: string;
  image_url: string | null;
  slug?: string | null;
  price?: number | null;
  promo_price?: number | null;
  featured_slot?: number | null;
};

const STYLES = [
  { value: "light", label: "Claro" },
  { value: "soft-pink", label: "Rosa suave" },
  { value: "soft-blue", label: "Azul suave" },
  { value: "soft-mint", label: "Verde suave" },
];

const BANNER_MODES = [
  { value: "auto_products", label: "Automático com produtos" },
  { value: "upload", label: "Upload de banner pronto" },
  { value: "manual_url", label: "URL manual (avançado)" },
  { value: "none", label: "Sem banner" },
];

const DESTINATIONS = [
  { value: "campaign", label: "Página da campanha" },
  { value: "category", label: "Categoria" },
  { value: "product", label: "Produto" },
  { value: "manual", label: "Link manual" },
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminCampaigns() {
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
  const [list, setList] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [products, setProducts] = useState<CampaignProduct[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CampaignProduct[]>([]);
  const [destEntity, setDestEntity] = useState<PickedEntity | null>(null);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("campaigns")
      .select("*")
      .order("position");
    setList((data ?? []) as Campaign[]);
  };

  useEffect(() => {
    load();
  }, []);

  const loadProducts = async (cid: string) => {
    const { data } = await (supabase as any)
      .from("campaign_products")
      .select(
        "position, featured_slot, product_id, products:product_id(id,name,slug,image_url,price,promo_price)",
      )
      .eq("campaign_id", cid)
      .order("position");
    setProducts(
      ((data ?? []) as any[])
        .map((r) => r.products && { ...r.products, featured_slot: r.featured_slot })
        .filter(Boolean),
    );
  };

  const hydrateDestEntity = async (c: Campaign) => {
    if (c.banner_destination === "category" && c.destination_category_id) {
      const { data } = await (supabase as any)
        .from("categories")
        .select("id,name,slug,image_url,description")
        .eq("id", c.destination_category_id)
        .maybeSingle();
      if (data)
        setDestEntity({
          id: data.id,
          name: data.name,
          slug: data.slug,
          image_url: data.image_url,
          subtitle: data.description,
          raw: data,
        });
    } else if (c.banner_destination === "product" && c.destination_product_id) {
      const { data } = await (supabase as any)
        .from("products")
        .select("id,name,slug,image_url,laboratory")
        .eq("id", c.destination_product_id)
        .maybeSingle();
      if (data)
        setDestEntity({
          id: data.id,
          name: data.name,
          slug: data.slug,
          image_url: data.image_url,
          subtitle: data.laboratory,
          raw: data,
        });
    } else {
      setDestEntity(null);
    }
  };

  const startEdit = async (c: Campaign | null) => {
    setEditing(c);
    setProducts([]);
    setSearch("");
    setSearchResults([]);
    setDestEntity(null);
    if (c) {
      await loadProducts(c.id);
      await hydrateDestEntity(c);
    }
  };

  const createCampaign = async () => {
    const name = "Nova campanha";
    const { data, error } = await (supabase as any)
      .from("campaigns")
      .insert({
        name,
        slug: `nova-${Date.now()}`,
        visual_style: "soft-pink",
        position: (list[list.length - 1]?.position ?? 0) + 1,
        banner_mode: "auto_products",
        banner_destination: "campaign",
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    await load();
    await startEdit(data as Campaign);
  };

  const computeBannerLink = (c: Campaign): string | null => {
    const dest = c.banner_destination || "campaign";
    if (dest === "campaign") return `/campanha/${c.slug}`;
    if (dest === "category" && destEntity?.slug) return `/categoria/${destEntity.slug}`;
    if (dest === "product" && destEntity?.slug) return `/produto/${destEntity.slug}`;
    if (dest === "manual") return c.banner_link;
    return c.banner_link;
  };

  const save = async () => {
    if (!editing) return;

    const mode = editing.banner_mode || "manual_url";
    if (mode === "auto_products" && products.length === 0) {
      return toast.error("Vincule ao menos um produto para gerar o banner automático.");
    }
    if (mode === "upload" && !editing.banner_image_url) {
      return toast.error("Envie uma imagem de banner ou altere o modo.");
    }
    if (editing.banner_destination === "manual" && !editing.banner_link) {
      return toast.error("Informe o link manual de destino.");
    }

    const computedLink = computeBannerLink(editing);
    const { id, ...rest } = editing;
    const payload = {
      ...rest,
      slug: rest.slug || slugify(rest.name),
      position: Number(rest.position) || 0,
      starts_at: rest.starts_at || null,
      ends_at: rest.ends_at || null,
      banner_link: computedLink,
    };
    const { error } = await (supabase as any)
      .from("campaigns")
      .update(payload)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campanha salva");
    load();
  };

  const remove = async (id: string) => {
    const campaign = list.find((c) => c.id === id);
    const approved = await confirmAction({
      title: "Excluir campanha?",
      description: campaign?.name
        ? `A campanha \"${campaign.name}\" será excluída. Os produtos do catálogo não serão excluídos, mas deixarão de estar associados a esta campanha.`
        : "A campanha será excluída. Os produtos do catálogo não serão excluídos, mas deixarão de estar associados a esta campanha.",
      confirmLabel: "Excluir campanha",
      destructive: true,
    });
    if (!approved) return;
    const { error } = await (supabase as any).from("campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setEditing(null);
    toast.success("Campanha excluída");
    load();
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search || search.length < 2) {
        setSearchResults([]);
        return;
      }
      const term = `%${search}%`;
      const { data } = await (supabase as any)
        .from("products")
        .select("id,name,slug,image_url,price,promo_price")
        .eq("active", true)
        .or(`name.ilike.${term},sku.ilike.${term},barcode.ilike.${term}`)
        .limit(10);
      setSearchResults((data ?? []) as any[]);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const addProduct = async (p: CampaignProduct) => {
    if (!editing) return;
    if (products.find((x) => x.id === p.id)) return;
    const { error } = await (supabase as any).from("campaign_products").insert({
      campaign_id: editing.id,
      product_id: p.id,
      position: products.length,
    });
    if (error) return toast.error(error.message);
    setProducts((arr) => [...arr, p]);
    setSearch("");
    setSearchResults([]);
  };

  const removeProduct = async (productId: string) => {
    if (!editing) return;
    const { error } = await (supabase as any)
      .from("campaign_products")
      .delete()
      .eq("campaign_id", editing.id)
      .eq("product_id", productId);
    if (error) return toast.error(error.message);
    setProducts((p) => p.filter((x) => x.id !== productId));
  };

  const setFeaturedSlot = async (productId: string, slot: number | null) => {
    if (!editing) return;
    if (slot != null) {
      await (supabase as any)
        .from("campaign_products")
        .update({ featured_slot: null })
        .eq("campaign_id", editing.id)
        .eq("featured_slot", slot);
    }
    const { error } = await (supabase as any)
      .from("campaign_products")
      .update({ featured_slot: slot })
      .eq("campaign_id", editing.id)
      .eq("product_id", productId);
    if (error) return toast.error(error.message);
    setProducts((arr) =>
      arr.map((p) => ({
        ...p,
        featured_slot:
          p.id === productId ? slot : slot != null && p.featured_slot === slot ? null : p.featured_slot,
      })),
    );
  };

  const handleBannerUpload = async (file: File) => {
    if (!editing) return;
    const ext = file.name.split(".").pop() || "png";
    const path = `campaigns/${editing.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("banners").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("banners").getPublicUrl(path);
    setEditing({ ...editing, banner_image_url: data.publicUrl });
    toast.success("Banner enviado");
  };

  const featuredForPreview = (() => {
    if (!products.length) return [];
    const slotted = products
      .filter((p) => p.featured_slot)
      .sort((a, b) => (a.featured_slot ?? 99) - (b.featured_slot ?? 99));
    if (slotted.length > 0) return slotted.slice(0, 3);
    return products.filter((p) => p.image_url).slice(0, 3);
  })();

  return (
    <div className="p-6 max-w-6xl">
      {confirmDialog}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Crie campanhas comerciais e vincule produtos. Use banner automático ou faça upload.
          </p>
        </div>
        <Button onClick={createCampaign}>
          <Plus className="h-4 w-4 mr-2" /> Nova campanha
        </Button>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        <aside className="space-y-1 bg-card border rounded-xl p-2 h-fit">
          {list.length === 0 && <div className="text-sm text-muted-foreground p-3">Nenhuma campanha.</div>}
          {list.map((c) => (
            <button key={c.id} onClick={() => startEdit(c)} className={`w-full text-left px-3 py-2 rounded-md text-sm ${editing?.id === c.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              <div className="font-bold truncate">{c.name}</div>
              <div className={`text-xs ${editing?.id === c.id ? "opacity-80" : "text-muted-foreground"}`}>
                {c.active ? "Ativa" : "Inativa"} · {c.published ? "Publicada" : "Rascunho"}
              </div>
            </button>
          ))}
        </aside>

        <section className="bg-card border rounded-xl p-4">
          {!editing ? (
            <div className="text-sm text-muted-foreground py-10 text-center">Selecione uma campanha à esquerda ou crie uma nova.</div>
          ) : (
            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  <Label>Slug</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} />
                  <Label>Subtítulo</Label><Textarea rows={2} value={editing.subtitle ?? ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Início</Label><Input type="datetime-local" value={editing.starts_at?.slice(0, 16) ?? ""} onChange={(e) => setEditing({ ...editing, starts_at: e.target.value || null })} /></div>
                    <div><Label>Fim</Label><Input type="datetime-local" value={editing.ends_at?.slice(0, 16) ?? ""} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value || null })} /></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Texto do botão</Label><Input value={editing.cta_text ?? ""} onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Estilo visual</Label><Select value={editing.visual_style} onValueChange={(v) => setEditing({ ...editing, visual_style: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STYLES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Posição</Label><Input type="number" value={editing.position} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} /></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><span className="text-sm">Ativa</span></div>
                    <div className="flex items-center gap-2"><Switch checked={editing.published} onCheckedChange={(v) => setEditing({ ...editing, published: v })} /><span className="text-sm">Publicada</span></div>
                    <div className="flex items-center gap-2"><Switch checked={!!editing.show_on_home} onCheckedChange={(v) => setEditing({ ...editing, show_on_home: v })} /><span className="text-sm">Exibir na home</span></div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-base font-bold">Imagem/Banner da campanha</Label>
                  <Select value={editing.banner_mode || "manual_url"} onValueChange={(v) => setEditing({ ...editing, banner_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BANNER_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {editing.banner_mode === "upload" && (
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm hover:bg-accent"><Upload className="h-4 w-4" />Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBannerUpload(f); }} /></label>
                      {editing.banner_image_url && <img src={editing.banner_image_url} alt="" className="h-12 w-20 object-cover rounded border" />}
                    </div>
                  )}
                  {editing.banner_mode === "manual_url" && <><Input placeholder="https://…" value={editing.banner_image_url ?? ""} onChange={(e) => setEditing({ ...editing, banner_image_url: e.target.value })} /><p className="text-xs text-muted-foreground">Use apenas se a imagem já estiver hospedada. Preferencialmente, use upload.</p></>}
                  {editing.banner_mode === "auto_products" && <p className="text-xs text-muted-foreground">O banner será montado automaticamente com até 3 produtos vinculados. Marque produtos como Destaque 1/2/3 abaixo para escolher quais aparecem.</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-base font-bold">Destino do banner</Label>
                  <Select value={editing.banner_destination || "campaign"} onValueChange={(v) => { setEditing({ ...editing, banner_destination: v, destination_category_id: null, destination_product_id: null, banner_link: v === "manual" ? editing.banner_link : null }); setDestEntity(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DESTINATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {editing.banner_destination === "category" && <EntityPicker kind="category" value={destEntity} onPick={(e) => { setDestEntity(e); setEditing({ ...editing, destination_category_id: e?.id || null }); }} placeholder="Buscar categoria…" />}
                  {editing.banner_destination === "product" && <EntityPicker kind="product" value={destEntity} onPick={(e) => { setDestEntity(e); setEditing({ ...editing, destination_product_id: e?.id || null }); }} placeholder="Buscar produto…" />}
                  {editing.banner_destination === "manual" && <Input placeholder="https://…" value={editing.banner_link ?? ""} onChange={(e) => setEditing({ ...editing, banner_link: e.target.value })} />}
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-base font-bold">Produtos vinculados</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar produto pelo nome, SKU ou código de barras…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
                      {searchResults.map((r) => <button key={r.id} onClick={() => addProduct(r)} className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left text-sm">{r.image_url && <img src={r.image_url} alt="" className="h-8 w-8 object-contain" />}<span className="truncate">{r.name}</span></button>)}
                    </div>
                  )}
                </div>
                <div className="mt-3 grid sm:grid-cols-2 gap-2">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 border rounded-md p-2 bg-background">
                      {p.image_url && <img src={p.image_url} alt="" className="h-10 w-10 object-contain shrink-0" />}
                      <span className="text-xs flex-1 truncate">{p.name}</span>
                      <div className="flex items-center gap-1">
                        {[1,2,3].map((slot) => <button key={slot} type="button" onClick={() => setFeaturedSlot(p.id, p.featured_slot === slot ? null : slot)} className={`h-6 w-6 rounded text-[10px] font-bold border flex items-center justify-center ${p.featured_slot === slot ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`} title={`Marcar como destaque ${slot}`}>{p.featured_slot === slot ? <Star className="h-3 w-3" /> : slot}</button>)}
                        <button onClick={() => removeProduct(p.id)} className="text-muted-foreground hover:text-destructive ml-1" aria-label="Remover"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                  {products.length === 0 && <div className="col-span-full text-xs text-muted-foreground">Nenhum produto vinculado.</div>}
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-base font-bold">Preview</Label>
                <div className="mt-2">
                  {editing.banner_mode === "auto_products" ? (
                    <CampaignAutoBanner name={editing.name} subtitle={editing.subtitle} ctaText={editing.cta_text || "Aproveitar agora"} visualStyle={editing.visual_style} products={featuredForPreview} />
                  ) : editing.banner_image_url && (editing.banner_mode === "upload" || editing.banner_mode === "manual_url") ? (
                    <img src={editing.banner_image_url} alt={editing.name} className="w-full max-h-72 object-cover rounded-2xl border" />
                  ) : (
                    <div className="bg-muted/30 border rounded-2xl p-6 text-sm text-muted-foreground">{editing.banner_mode === "none" ? "Modo sem banner — a campanha terá apenas título, subtítulo e produtos." : "Banner ainda não configurado."}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <Button variant="outline" onClick={() => remove(editing.id)}><Trash2 className="h-4 w-4 mr-2" /> Excluir</Button>
                <Button onClick={save}>Salvar</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}