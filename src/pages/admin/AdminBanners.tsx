import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, ArrowUp, ArrowDown, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { HeroSlide as HeroSlidePreview, type HeroSlide as HeroSlideType } from "@/components/HeroSlider";
import { EntityPicker, type PickedEntity, type PickerKind } from "@/components/admin/EntityPicker";

const PLACEMENTS = [
  { v: "hero", l: "Hero principal" },
  { v: "mosaico", l: "Mosaico" },
  { v: "secundario", l: "Banner secundário" },
  { v: "receita", l: "Receita" },
  { v: "rodape", l: "Rodapé" },
];

const BANNER_TYPES = [
  { v: "image", l: "Imagem completa" },
  { v: "auto_product", l: "Banner automático com produto" },
  { v: "campaign_pro", l: "Banner campanha profissional" },
];

const VISUAL_STYLES = [
  { v: "light-neutral", l: "Claro neutro" },
  { v: "light", l: "Claro" },
  { v: "red-soft", l: "Vermelho suave" },
  { v: "beige-health", l: "Bege saúde" },
  { v: "yellow-offer", l: "Amarelo oferta" },
  { v: "wine-premium", l: "Vinho premium" },
  { v: "blue-health", l: "Azul saúde" },
];

const PRODUCT_SIZES = [
  { v: "small", l: "Pequeno" },
  { v: "medium", l: "Médio" },
  { v: "large", l: "Grande" },
  { v: "xlarge", l: "Extra grande" },
];

const ANIMATIONS = [
  { v: "none", l: "Sem animação" },
  { v: "float", l: "Produto flutuando" },
  { v: "shine", l: "Brilho suave" },
  { v: "slide-in", l: "Entrada lateral" },
  { v: "zoom", l: "Zoom leve" },
  { v: "confetti", l: "Confete leve" },
];

const POSITIONS = [
  { v: "left", l: "Esquerda" },
  { v: "center", l: "Centro" },
  { v: "right", l: "Direita" },
];

const LINK_KINDS = [
  { v: "manual", l: "Link manual" },
  { v: "product", l: "Produto" },
  { v: "category", l: "Categoria" },
  { v: "campaign", l: "Campanha" },
];

const empty: any = {
  id: "", title: "", subtitle: "", cta_text: "confira", image_url: "", mobile_image_url: "",
  link: "", position: 0, placement: "hero", active: true, start_date: null, end_date: null,
  banner_type: "image", published: true, support_text: "", legal_text: "",
  discount_percent: null, discount_prefix: "com até", discount_suffix: "de desconto",
  product_image_url: "", background_image_url: "", background_color: "", accent_color: "", button_color: "",
  product_position: "center", text_position: "left", visual_style: "red-soft",
  linked_entity_type: "manual", linked_entity_id: null, linked_entity_slug: "",
  animation_type: "float", show_text_over_image: false, image_fit: "cover",
  product_size: "large", show_side_shapes: true, side_shapes_color: "",
};

export default function AdminBanners() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [picked, setPicked] = useState<PickedEntity | null>(null);

  const { data } = useQuery({
    queryKey: ["admin_banners"],
    queryFn: async () => (await (supabase as any).from("banners").select("*").order("placement").order("position")).data || [],
  });

  const upload = async (f: File) => {
    const path = `${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error } = await supabase.storage.from("banners").upload(path, f);
    if (error) throw error;
    return supabase.storage.from("banners").getPublicUrl(path).data.publicUrl;
  };

  const save = async () => {
    try {
      let image_url = editing.image_url;
      let mobile_image_url = editing.mobile_image_url;
      let product_image_url = editing.product_image_url;
      let background_image_url = editing.background_image_url;
      if (file) image_url = await upload(file);
      if (mobileFile) mobile_image_url = await upload(mobileFile);
      if (productFile) product_image_url = await upload(productFile);
      if (bgFile) background_image_url = await upload(bgFile);

      const payload: any = {
        ...editing,
        image_url, mobile_image_url, product_image_url, background_image_url,
        position: Number(editing.position) || 0,
        discount_percent: editing.discount_percent === "" || editing.discount_percent == null ? null : Number(editing.discount_percent),
        start_date: editing.start_date || null,
        end_date: editing.end_date || null,
      };
      if (payload.id) {
        const id = payload.id;
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        const { error } = await (supabase as any).from("banners").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await (supabase as any).from("banners").insert(payload);
        if (error) throw error;
      }
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["admin_banners"] });
      setOpen(false);
      setFile(null); setMobileFile(null); setProductFile(null); setBgFile(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const reorder = async (b: any, delta: number) => {
    await (supabase as any).from("banners").update({ position: Math.max(0, (b.position || 0) + delta) }).eq("id", b.id);
    qc.invalidateQueries({ queryKey: ["admin_banners"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir banner?")) return;
    const { error } = await (supabase as any).from("banners").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["admin_banners"] }); }
  };

  // Picker effect: when picked entity changes, hydrate auto fields
  const onPick = (e: PickedEntity | null) => {
    setPicked(e);
    if (!e) {
      setEditing((cur: any) => ({ ...cur, linked_entity_id: null, linked_entity_slug: "" }));
      return;
    }
    setEditing((cur: any) => {
      const next: any = { ...cur, linked_entity_id: e.id, linked_entity_slug: e.slug };
      if (cur.banner_type === "auto_product" && cur.linked_entity_type === "product") {
        next.product_image_url = e.image_url || cur.product_image_url;
        next.title = cur.title || e.name;
        if (e.raw?.promo_price && Number(e.raw.promo_price) < Number(e.raw.price)) {
          const pct = Math.round((1 - Number(e.raw.promo_price) / Number(e.raw.price)) * 100);
          if (!cur.discount_percent) next.discount_percent = pct;
        }
      }
      return next;
    });
  };

  const preview: HeroSlideType = useMemo(() => {
    const localImg = (f: File | null) => (f ? URL.createObjectURL(f) : null);
    return {
      id: editing.id || "preview",
      ...editing,
      image_url: localImg(file) || editing.image_url,
      product_image_url: localImg(productFile) || editing.product_image_url,
      background_image_url: localImg(bgFile) || editing.background_image_url,
    } as HeroSlideType;
  }, [editing, file, productFile, bgFile]);

  const showCampaignFields = editing.banner_type === "campaign_pro" || editing.banner_type === "auto_product";
  const pickerKind: PickerKind | null =
    editing.linked_entity_type === "product" ? "product"
      : editing.linked_entity_type === "category" ? "category"
        : editing.linked_entity_type === "campaign" ? "campaign" : null;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold">Banners</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/banners/gerador"><Wand2 className="h-4 w-4 mr-2" /> Gerador de Banner</Link>
          </Button>
          <Button onClick={() => { setEditing(empty); setPicked(null); setFile(null); setMobileFile(null); setProductFile(null); setBgFile(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo
          </Button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((b: any) => (
          <div key={b.id} className="bg-card border rounded-xl p-4 shadow-card">
            {b.image_url && <img src={b.image_url} alt={b.title} className="w-full h-32 object-cover rounded-md mb-3" />}
            <div className="text-[10px] uppercase font-bold text-primary mb-1 flex items-center gap-2">
              <span>{PLACEMENTS.find((p) => p.v === b.placement)?.l || b.placement}</span>
              <span className="text-muted-foreground">·</span>
              <span>{BANNER_TYPES.find((t) => t.v === (b.banner_type || "image"))?.l}</span>
            </div>
            <div className="font-bold">{b.title}</div>
            <div className="text-xs text-muted-foreground">{b.subtitle}</div>
            <div className="text-xs mt-1">Ordem: {b.position} · {b.active ? "Ativo" : "Inativo"}{b.published === false ? " · Rascunho" : ""}</div>
            <div className="flex gap-1 mt-3 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => { setEditing({ ...empty, ...b }); setPicked(null); setFile(null); setMobileFile(null); setProductFile(null); setBgFile(null); setOpen(true); }}>
                <Edit className="h-3 w-3 mr-1" /> Editar
              </Button>
              <Button size="icon" variant="ghost" onClick={() => reorder(b, -1)}><ArrowUp className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" onClick={() => reorder(b, 1)}><ArrowDown className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Novo"} banner</DialogTitle></DialogHeader>

          {/* Live preview — same component & sizing as public */}
          <div className="rounded-xl border overflow-hidden bg-white">
            <div className="relative h-[440px] md:h-[380px] lg:h-[420px] xl:h-[440px]">
              <HeroSlidePreview s={preview} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tipo de banner</Label>
                <Select value={editing.banner_type} onValueChange={(v) => setEditing({ ...editing, banner_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BANNER_TYPES.map((b) => <SelectItem key={b.v} value={b.v}>{b.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1"><Label>{showCampaignFields ? "Frase principal da campanha" : "Título principal"}</Label><Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder={showCampaignFields ? "Abasteça sua farmacinha" : ""} /></div>
              <div className="space-y-1"><Label>Subtítulo</Label><Input value={editing.subtitle || ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} /></div>
              {showCampaignFields && (
                <div className="space-y-1"><Label>Texto de apoio</Label><Input value={editing.support_text || ""} onChange={(e) => setEditing({ ...editing, support_text: e.target.value })} placeholder="Cuidado completo para sua saúde" /></div>
              )}

              <div className="space-y-1"><Label>Texto do botão (CTA)</Label><Input value={editing.cta_text || ""} onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })} /></div>

              <div className="space-y-1">
                <Label>Vincular a</Label>
                <Select value={editing.linked_entity_type || "manual"} onValueChange={(v) => { setEditing({ ...editing, linked_entity_type: v, linked_entity_id: null, linked_entity_slug: "" }); setPicked(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LINK_KINDS.map((l) => <SelectItem key={l.v} value={l.v}>{l.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {pickerKind ? (
                <EntityPicker kind={pickerKind} value={picked} onPick={onPick} placeholder={`Buscar ${pickerKind === "product" ? "produto" : pickerKind === "category" ? "categoria" : "campanha"}…`} />
              ) : (
                <div className="space-y-1"><Label>Link manual</Label><Input value={editing.link || ""} onChange={(e) => setEditing({ ...editing, link: e.target.value })} placeholder="/categoria/ofertas" /></div>
              )}

              {showCampaignFields && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1 col-span-1"><Label>Antes</Label><Input value={editing.discount_prefix || ""} onChange={(e) => setEditing({ ...editing, discount_prefix: e.target.value })} /></div>
                    <div className="space-y-1 col-span-1"><Label>% desconto</Label><Input type="number" value={editing.discount_percent ?? ""} onChange={(e) => setEditing({ ...editing, discount_percent: e.target.value })} /></div>
                    <div className="space-y-1 col-span-1"><Label>Depois</Label><Input value={editing.discount_suffix || ""} onChange={(e) => setEditing({ ...editing, discount_suffix: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label>Texto legal pequeno</Label><Textarea rows={2} value={editing.legal_text || ""} onChange={(e) => setEditing({ ...editing, legal_text: e.target.value })} /></div>
                </>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Posição (placement)</Label>
                <Select value={editing.placement} onValueChange={(v) => setEditing({ ...editing, placement: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLACEMENTS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {showCampaignFields && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Estilo visual</Label>
                      <Select value={editing.visual_style} onValueChange={(v) => setEditing({ ...editing, visual_style: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{VISUAL_STYLES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Animação</Label>
                      <Select value={editing.animation_type} onValueChange={(v) => setEditing({ ...editing, animation_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ANIMATIONS.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Posição do texto</Label>
                      <Select value={editing.text_position} onValueChange={(v) => setEditing({ ...editing, text_position: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{POSITIONS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Posição do produto</Label>
                      <Select value={editing.product_position} onValueChange={(v) => setEditing({ ...editing, product_position: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{POSITIONS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1"><Label>Cor fundo</Label><Input type="color" value={editing.background_color || "#ffffff"} onChange={(e) => setEditing({ ...editing, background_color: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Cor destaque</Label><Input type="color" value={editing.accent_color || "#d4213d"} onChange={(e) => setEditing({ ...editing, accent_color: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Cor botão</Label><Input type="color" value={editing.button_color || "#d4213d"} onChange={(e) => setEditing({ ...editing, button_color: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1">
                    <Label>Imagem dos produtos (PNG/WEBP recortado, sem fundo)</Label>
                    {editing.product_image_url && <img src={editing.product_image_url} className="h-20 object-contain mb-1" />}
                    <Input type="file" accept="image/*" onChange={(e) => setProductFile(e.target.files?.[0] || null)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Tamanho do produto no banner</Label>
                      <Select value={editing.product_size || "large"} onValueChange={(v) => setEditing({ ...editing, product_size: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PRODUCT_SIZES.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Cor das formas laterais</Label>
                      <Input type="color" value={editing.side_shapes_color || "#E5253E"} onChange={(e) => setEditing({ ...editing, side_shapes_color: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={editing.show_side_shapes !== false} onCheckedChange={(v) => setEditing({ ...editing, show_side_shapes: v })} />
                    <Label>Mostrar formas decorativas laterais</Label>
                  </div>
                  <div className="space-y-1">
                    <Label>Imagem de fundo opcional</Label>
                    {editing.background_image_url && <img src={editing.background_image_url} className="h-20 object-cover w-full rounded mb-1" />}
                    <Input type="file" accept="image/*" onChange={(e) => setBgFile(e.target.files?.[0] || null)} />
                  </div>
                </>
              )}

              {editing.banner_type === "image" && (
                <>
                  <div className="space-y-1">
                    <Label>Imagem desktop</Label>
                    {editing.image_url && <img src={editing.image_url} className="w-full h-24 object-cover rounded mb-1" />}
                    <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Imagem mobile</Label>
                    {editing.mobile_image_url && <img src={editing.mobile_image_url} className="w-32 h-24 object-cover rounded mb-1" />}
                    <Input type="file" accept="image/*" onChange={(e) => setMobileFile(e.target.files?.[0] || null)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Ajuste da imagem</Label>
                      <Select value={editing.image_fit} onValueChange={(v) => setEditing({ ...editing, image_fit: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cover">Cobrir (cover)</SelectItem>
                          <SelectItem value="contain">Conter (contain)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2"><Switch checked={!!editing.show_text_over_image} onCheckedChange={(v) => setEditing({ ...editing, show_text_over_image: v })} /><Label>Texto sobre imagem</Label></div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Início</Label><Input type="datetime-local" value={editing.start_date?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, start_date: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>Fim</Label><Input type="datetime-local" value={editing.end_date?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, end_date: e.target.value || null })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div className="space-y-1"><Label>Ordem</Label><Input type="number" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></div>
                <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
                <div className="flex items-center gap-2"><Switch checked={editing.published !== false} onCheckedChange={(v) => setEditing({ ...editing, published: v })} /><Label>Publicado</Label></div>
              </div>
            </div>
          </div>

          <Button className="w-full mt-4" onClick={save}>Salvar</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
