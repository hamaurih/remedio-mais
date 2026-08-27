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
import { Plus, Edit, Trash2, ArrowUp, ArrowDown, Wand2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { HeroSlide as HeroSlidePreview, type HeroSlide as HeroSlideType } from "@/components/HeroSlider";
import { HeroSlideImage } from "@/components/hero/HeroSlideImage";
import { EntityPicker, type PickedEntity, type PickerKind } from "@/components/admin/EntityPicker";
import { HERO_SIZE_OPTIONS, HERO_SIZES, type HeroSizeVariant } from "@/lib/heroSizes";
import { HERO_VISUAL_MODEL_OPTIONS } from "@/lib/heroVisualModels";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

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

const TITLE_FONTS = [
  { v: "default", l: "Padrão do site" },
  { v: "inter", l: "Inter" },
  { v: "poppins", l: "Poppins" },
  { v: "montserrat", l: "Montserrat" },
  { v: "oswald", l: "Oswald (condensado)" },
  { v: "bebas-neue", l: "Bebas Neue (impacto)" },
  { v: "archivo", l: "Archivo Black" },
  { v: "playfair-display", l: "Playfair Display (serifa)" },
  { v: "dm-serif-display", l: "DM Serif Display (serifa)" },
];

const TITLE_SIZES = [
  { v: "sm", l: "Pequeno" },
  { v: "md", l: "Médio" },
  { v: "lg", l: "Grande" },
  { v: "xl", l: "Extra grande" },
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
  tablet_image_url: "", desktop_image_url: "", image_alt: "",
  link: "", position: 0, placement: "hero", active: true, start_date: null, end_date: null,
  banner_type: "image", published: true, support_text: "", legal_text: "",
  discount_percent: null, discount_prefix: "com até", discount_suffix: "de desconto",
  product_image_url: "", background_image_url: "", background_color: "", accent_color: "", button_color: "",
  product_position: "center", text_position: "left", visual_style: "red-soft",
  linked_entity_type: "manual", linked_entity_id: null, linked_entity_slug: "",
  animation_type: "float", show_text_over_image: false, image_fit: "cover", image_focus: "center",
  product_size: "large", show_side_shapes: true, side_shapes_color: "", side_shapes_size: "medium", background_intensity: "xsoft",
  title_font: "default", title_size: "lg", title_color: "", support_color: "", legal_color: "",
  visual_model: "auto", size_variant: "hero-grande", autoplay_delay: 4000, transition_type: "slide",
};

export default function AdminBanners() {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [tabletFile, setTabletFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [picked, setPicked] = useState<PickedEntity | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

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
      let tablet_image_url = editing.tablet_image_url;
      let product_image_url = editing.product_image_url;
      let background_image_url = editing.background_image_url;
      if (file) image_url = await upload(file);
      if (mobileFile) mobile_image_url = await upload(mobileFile);
      if (tabletFile) tablet_image_url = await upload(tabletFile);
      if (productFile) product_image_url = await upload(productFile);
      if (bgFile) background_image_url = await upload(bgFile);

      const payload: any = {
        ...editing,
        image_url,
        mobile_image_url,
        tablet_image_url,
        product_image_url,
        background_image_url,
        // Se um novo arquivo desktop foi enviado, ele SEMPRE substitui a imagem antiga
        desktop_image_url: file ? image_url : (editing.desktop_image_url || image_url || null),
        position: Number(editing.position) || 0,
        autoplay_delay: Math.max(2000, Number(editing.autoplay_delay) || 4000),
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
      setFile(null); setMobileFile(null); setTabletFile(null); setProductFile(null); setBgFile(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const reorder = async (b: any, delta: number) => {
    await (supabase as any).from("banners").update({ position: Math.max(0, (b.position || 0) + delta) }).eq("id", b.id);
    qc.invalidateQueries({ queryKey: ["admin_banners"] });
  };
  const remove = async (id: string) => {
    const banner = data?.find((b: any) => b.id === id);
    const approved = await confirmAction({
      title: "Excluir banner?",
      description: banner?.title
        ? `O banner \"${banner.title}\" será removido. Esta ação não exclui produtos, categorias ou campanhas vinculadas.`
        : "O banner será removido. Esta ação não exclui produtos, categorias ou campanhas vinculadas.",
      confirmLabel: "Excluir banner",
      destructive: true,
    });
    if (!approved) return;
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
      desktop_image_url: localImg(file) || editing.desktop_image_url || editing.image_url,
      tablet_image_url: localImg(tabletFile) || editing.tablet_image_url,
      mobile_image_url: localImg(mobileFile) || editing.mobile_image_url,
      product_image_url: localImg(productFile) || editing.product_image_url,
      background_image_url: localImg(bgFile) || editing.background_image_url,
    } as HeroSlideType;
  }, [editing, file, mobileFile, tabletFile, productFile, bgFile]);

  const size = HERO_SIZES[(editing.size_variant as HeroSizeVariant) || "hero-grande"];
  const deviceWidth = previewDevice === "mobile" ? 380 : previewDevice === "tablet" ? 768 : 1200;
  const isMobileDevice = previewDevice === "mobile";
  const previewAspect = isMobileDevice ? size.mobileAspect : size.desktopAspect;
  const previewMinH = isMobileDevice ? size.mobileMinHeight : size.minHeight;

  const showCampaignFields = editing.banner_type === "campaign_pro" || editing.banner_type === "auto_product";
  const pickerKind: PickerKind | null =
    editing.linked_entity_type === "product" ? "product"
      : editing.linked_entity_type === "category" ? "category"
        : editing.linked_entity_type === "campaign" ? "campaign" : null;

  return (
    <div className="p-6">
      {confirmDialog}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold">Banners</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/banners/gerador"><Wand2 className="h-4 w-4 mr-2" /> Gerador de Banner</Link>
          </Button>
          <Button onClick={() => { setEditing(empty); setPicked(null); setFile(null); setMobileFile(null); setTabletFile(null); setProductFile(null); setBgFile(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo
          </Button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((b: any) => (
          <div key={b.id} className="bg-card border rounded-xl p-4 shadow-card">
            {b.image_url && <img src={b.image_url} alt={b.title} loading="lazy" decoding="async" className="w-full h-32 object-cover rounded-md mb-3" />}
            <div className="text-[10px] uppercase font-bold text-primary mb-1 flex items-center gap-2">
              <span>{PLACEMENTS.find((p) => p.v === b.placement)?.l || b.placement}</span>
              <span className="text-muted-foreground">·</span>
              <span>{BANNER_TYPES.find((t) => t.v === (b.banner_type || "image"))?.l}</span>
            </div>
            <div className="font-bold">{b.title}</div>
            <div className="text-xs text-muted-foreground">{b.subtitle}</div>
            <div className="text-xs mt-1">Ordem: {b.position} · {b.active ? "Ativo" : "Inativo"}{b.published === false ? " · Rascunho" : ""}</div>
            {(b.banner_type || "image") === "image" && !b.desktop_image_url && !b.image_url && (
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Sem imagem desktop. No desktop vai aparecer com barras laterais vazias. Envie uma imagem horizontal (ex.: 1920×600).</span>
              </div>
            )}
            {(b.banner_type || "image") === "image" && !b.mobile_image_url && (b.desktop_image_url || b.image_url) && (
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Sem imagem mobile dedicada. Vai usar a versão desktop cortada no celular.</span>
              </div>
            )}
            <div className="flex gap-1 mt-3 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => { setEditing({ ...empty, ...b }); setPicked(null); setFile(null); setMobileFile(null); setTabletFile(null); setProductFile(null); setBgFile(null); setOpen(true); }}>
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

          {/* Device toggle */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Pré-visualizar em:</span>
            {(["desktop", "tablet", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPreviewDevice(d)}
                className={`px-3 py-1 rounded-full border ${previewDevice === d ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
              >
                {d === "desktop" ? "Desktop" : d === "tablet" ? "Tablet" : "Mobile"}
              </button>
            ))}
            <span className="ml-2 text-muted-foreground">
              Tamanho: {size.label} · {size.desktopAspect}
            </span>
          </div>

          {/* Live preview — aspect ratio real do size_variant escolhido */}
          <div className="rounded-xl border overflow-hidden bg-white flex justify-center py-3">
            <div
              className="relative overflow-hidden bg-white rounded-lg shadow"
              style={{
                width: `${deviceWidth}px`,
                maxWidth: "100%",
                aspectRatio: previewAspect,
                minHeight: `${previewMinH}px`,
              }}
            >
              {editing.banner_type === "image"
                ? <HeroSlideImage s={preview as any} eager />
                : <HeroSlidePreview s={preview} />}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-3">
              {/* --- Configurações do carrossel / hero --- */}
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg border bg-muted/30">
                <div className="space-y-1 col-span-2">
                  <Label>Modelo visual pronto</Label>
                  <Select value={editing.visual_model || "auto"} onValueChange={(v) => setEditing({ ...editing, visual_model: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HERO_VISUAL_MODEL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: o.swatch }} />
                            {o.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Tamanho do banner</Label>
                  <Select value={editing.size_variant || "hero-grande"} onValueChange={(v) => setEditing({ ...editing, size_variant: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HERO_SIZE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label} — {o.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Autoplay (ms)</Label>
                  <Input type="number" min={2000} step={500} value={editing.autoplay_delay ?? 4000} onChange={(e) => setEditing({ ...editing, autoplay_delay: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Transição</Label>
                  <Select value={editing.transition_type || "slide"} onValueChange={(v) => setEditing({ ...editing, transition_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slide">Slide</SelectItem>
                      <SelectItem value="fade">Fade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Fonte do título</Label>
                      <Select value={editing.title_font || "default"} onValueChange={(v) => setEditing({ ...editing, title_font: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TITLE_FONTS.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Tamanho do título</Label>
                      <Select value={editing.title_size || "lg"} onValueChange={(v) => setEditing({ ...editing, title_size: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TITLE_SIZES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1"><Label>Cor do título</Label><Input type="color" value={editing.title_color || "#111111"} onChange={(e) => setEditing({ ...editing, title_color: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Cor texto apoio</Label><Input type="color" value={editing.support_color || "#444444"} onChange={(e) => setEditing({ ...editing, support_color: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Cor texto legal</Label><Input type="color" value={editing.legal_color || "#666666"} onChange={(e) => setEditing({ ...editing, legal_color: e.target.value })} /></div>
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Tamanho das formas laterais</Label>
                      <Select value={editing.side_shapes_size || "medium"} onValueChange={(v) => setEditing({ ...editing, side_shapes_size: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Pequeno</SelectItem>
                          <SelectItem value="medium">Médio</SelectItem>
                          <SelectItem value="large">Grande</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Intensidade do fundo</Label>
                      <Select value={editing.background_intensity || "xsoft"} onValueChange={(v) => setEditing({ ...editing, background_intensity: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Desligado</SelectItem>
                          <SelectItem value="xsoft">Muito suave</SelectItem>
                          <SelectItem value="soft">Suave</SelectItem>
                          <SelectItem value="medium">Médio</SelectItem>
                        </SelectContent>
                      </Select>
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
                  <div className="p-3 rounded-lg border bg-muted/20 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Banner por imagem pronta
                    </div>
                    {!file && !editing.image_url && !editing.desktop_image_url && (
                      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold">Falta a imagem desktop.</div>
                          Sem ela, no desktop o banner aparece com grandes barras laterais vazias, porque a imagem mobile é retrato (vertical) e o hero é horizontal. Envie uma imagem horizontal (recomendado <strong>1920×600</strong>).
                        </div>
                      </div>
                    )}
                    {!mobileFile && !editing.mobile_image_url && (file || editing.image_url || editing.desktop_image_url) && (
                      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold">Sem imagem mobile dedicada.</div>
                          O celular vai usar a imagem desktop cortada, o que pode esconder texto importante. Envie uma versão vertical (recomendado <strong>1080×1350</strong>).
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Imagem desktop <span className="text-xs text-muted-foreground">(recomendado: 1920×600 · até 1.5MB · WEBP/PNG/JPG)</span></Label>
                      {editing.image_url && <img src={editing.image_url} className="w-full h-24 object-cover rounded mb-1" />}
                      <Input type="file" accept="image/*" onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setFile(f);
                        if (f && f.size > 1.5 * 1024 * 1024) toast.warning("Imagem desktop pesada (>1.5MB). Pode deixar o site lento.");
                      }} />
                    </div>
                    <div className="space-y-1">
                      <Label>Imagem tablet (opcional) <span className="text-xs text-muted-foreground">(1200×800)</span></Label>
                      {editing.tablet_image_url && <img src={editing.tablet_image_url} className="w-40 h-24 object-cover rounded mb-1" />}
                      <Input type="file" accept="image/*" onChange={(e) => setTabletFile(e.target.files?.[0] || null)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Imagem mobile (opcional) <span className="text-xs text-muted-foreground">(1080×1350 ou 1080×1080 · até 800KB)</span></Label>
                      {editing.mobile_image_url && <img src={editing.mobile_image_url} className="w-32 h-32 object-cover rounded mb-1" />}
                      <Input type="file" accept="image/*" onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setMobileFile(f);
                        if (f && f.size > 800 * 1024) toast.warning("Imagem mobile pesada (>800KB). Pode deixar o site lento.");
                      }} />
                    </div>
                    <div className="space-y-1">
                      <Label>Texto alternativo da imagem (acessibilidade)</Label>
                      <Input value={editing.image_alt || ""} onChange={(e) => setEditing({ ...editing, image_alt: e.target.value })} placeholder="Ex: Ofertas da semana com até 50% de desconto" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Encaixe da imagem</Label>
                        <Select value={editing.image_fit || "cover"} onValueChange={(v) => setEditing({ ...editing, image_fit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cover">Cobrir área</SelectItem>
                            <SelectItem value="contain">Conter imagem inteira</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Foco da imagem</Label>
                        <Select value={editing.image_focus || "center"} onValueChange={(v) => setEditing({ ...editing, image_focus: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="center">Centro</SelectItem>
                            <SelectItem value="left">Esquerda</SelectItem>
                            <SelectItem value="right">Direita</SelectItem>
                            <SelectItem value="top">Topo</SelectItem>
                            <SelectItem value="bottom">Base</SelectItem>
                            <SelectItem value="product-right">Produto à direita</SelectItem>
                            <SelectItem value="text-left">Texto à esquerda</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={!!editing.show_text_over_image} onCheckedChange={(v) => setEditing({ ...editing, show_text_over_image: v })} />
                      <Label>Texto sobre imagem (para artes que já não têm texto embutido)</Label>
                    </div>
                    <div className="space-y-1">
                      <Label>Link de destino</Label>
                      <Input value={editing.link || ""} onChange={(e) => setEditing({ ...editing, link: e.target.value })} placeholder="/categoria/ofertas" />
                    </div>
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