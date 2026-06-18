import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { PromoBlock } from "@/components/PromoBanner";
import { PromoBlockPreview, resolveBlockType, resolveImageMode } from "@/components/PromoBanner";
import { Trash2, Plus, Upload, AlertCircle } from "lucide-react";

const VARIANTS = [
  { value: "anniversary", label: "Aniversário" },
  { value: "leve-pague", label: "Leve X Pague Y" },
  { value: "default", label: "Padrão" },
  { value: "desconto-2", label: "Desconto 2ª unidade" },
  { value: "generico", label: "Especial Genérico" },
];

const BLOCK_TYPES = [
  { value: "destaque_grande", label: "Destaque grande (420px)" },
  { value: "card_medio", label: "Card médio (250px)" },
  { value: "card_pequeno", label: "Card pequeno (210px)" },
  { value: "banner_completo", label: "Banner completo (imagem ocupa tudo)" },
];

const IMAGE_MODES = [
  { value: "produto_sem_fundo", label: "Produto sem fundo (PNG transparente)" },
  { value: "arte_completa", label: "Arte completa (imagem como banner)" },
];

const IMAGE_POSITIONS = [
  { value: "direita", label: "Direita" },
  { value: "esquerda", label: "Esquerda" },
  { value: "centro", label: "Centro" },
  { value: "fundo", label: "Fundo" },
];

const IMAGE_SIZES = [
  { value: "pequeno", label: "Pequeno" },
  { value: "medio", label: "Médio" },
  { value: "grande", label: "Grande" },
];

const BG_COLORS = [
  { value: "azul_claro", label: "Azul claro" },
  { value: "vermelho_claro", label: "Vermelho claro" },
  { value: "branco", label: "Branco" },
  { value: "personalizado", label: "Personalizado" },
];

const CTA_COLORS = [
  { value: "vermelho", label: "Vermelho" },
  { value: "azul", label: "Azul" },
  { value: "amarelo", label: "Amarelo" },
];

const ANIMATION_TYPES = [
  { value: "none", label: "Sem animação" },
  { value: "float", label: "Produto flutuando" },
  { value: "slide-in", label: "Produto entrando pela direita" },
  { value: "soft-zoom", label: "Zoom suave no produto" },
  { value: "badge-pulse", label: "Selo pulsando" },
  { value: "shine", label: "Brilho passando" },
  { value: "cta-pulse", label: "CTA pulsando leve" },
  { value: "confetti", label: "Confete leve" },
  { value: "hover", label: "Card com hover animado" },
];

export default function AdminPromoBanner() {
  const [blocks, setBlocks] = useState<PromoBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("promo_banner_blocks")
      .select("*")
      .order("position");
    setBlocks((data ?? []) as PromoBlock[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const update = (id: string, patch: Partial<PromoBlock>) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const saveOne = async (b: PromoBlock) => {
    setSaving(true);
    const { id, ...rest } = b;
    const payload: any = {
      ...rest,
      old_price: rest.old_price === null || rest.old_price === ("" as any) ? null : Number(rest.old_price),
      new_price: rest.new_price === null || rest.new_price === ("" as any) ? null : Number(rest.new_price),
      position: Number(rest.position) || 0,
    };
    const { error } = await (supabase as any)
      .from("promo_banner_blocks")
      .update(payload)
      .eq("id", id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Bloco salvo");
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este bloco?")) return;
    const { error } = await (supabase as any)
      .from("promo_banner_blocks")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      load();
    }
  };

  const add = async () => {
    const { error } = await (supabase as any)
      .from("promo_banner_blocks")
      .insert({
        position: (blocks[blocks.length - 1]?.position ?? 0) + 1,
        variant: "default",
        title: "Novo bloco",
        active: true,
        block_type: "card_medio",
        animation_type: "float",
      });
    if (error) toast.error(error.message);
    else load();
  };

  const uploadImage = async (id: string, file: File) => {
    const ext = file.name.split(".").pop();
    const path = `promo-banner/${id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("banners").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("banners").getPublicUrl(path);
    update(id, { image_url: data.publicUrl });
    toast.success("Imagem enviada — clique em Salvar bloco");
  };

  if (loading) return <div className="p-6">Carregando...</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Mini Banners Promocionais</h1>
          <p className="text-sm text-muted-foreground">
            Configure cada bloco com tipo, imagem, cor e conteúdo. Use Destaque grande para a peça principal e cards menores para campanhas de apoio.
          </p>
        </div>
        <Button onClick={add}>
          <Plus className="h-4 w-4" /> Novo bloco
        </Button>
      </div>

      <div className="space-y-6">
        {blocks.map((b, idx) => {
          const type = resolveBlockType(b, idx);
          const mode = resolveImageMode(b);
          const titleLen = (b.title ?? "").length;
          const warnSmallText = type === "card_pequeno" && titleLen > 22;

          return (
            <div key={b.id} className="bg-card border rounded-xl p-5 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded bg-muted">Posição #{b.position}</span>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={b.active}
                      onChange={(e) => update(b.id, { active: e.target.checked })}
                    />
                    Ativo
                  </label>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(b.id)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* PREVIEW */}
              <div className="mb-5 p-4 rounded-lg bg-gradient-to-b from-[#eaf7ff] to-white border border-sky-100 flex justify-center">
                <PromoBlockPreview block={b} index={idx} />
              </div>

              {/* WARNINGS */}
              <div className="space-y-2 mb-4">
                {warnSmallText && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    Texto longo para card pequeno. Recomendado usar título mais curto ou trocar para card médio.
                  </div>
                )}
                {mode === "produto_sem_fundo" && (
                  <div className="flex items-start gap-2 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded px-3 py-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    Recomendado usar PNG transparente do produto.
                  </div>
                )}
                {mode === "arte_completa" && (
                  <div className="flex items-start gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-3 py-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    Este modo usa a imagem como banner completo e pode ocultar textos.
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Tipo de bloco</Label>
                  <Select
                    value={b.block_type ?? (idx === 0 ? "destaque_grande" : "card_medio")}
                    onValueChange={(v) => update(b.id, { block_type: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BLOCK_TYPES.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Posição</Label>
                  <Input
                    type="number"
                    value={b.position}
                    onChange={(e) => update(b.id, { position: Number(e.target.value) })}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Variante visual</Label>
                  <Select value={b.variant} onValueChange={(v) => update(b.id, { variant: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VARIANTS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Modo da imagem</Label>
                  <Select
                    value={mode}
                    onValueChange={(v) => update(b.id, { image_mode: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMAGE_MODES.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Posição da imagem</Label>
                  <Select
                    value={b.image_position ?? "direita"}
                    onValueChange={(v) => update(b.id, { image_position: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMAGE_POSITIONS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Tamanho da imagem</Label>
                  <Select
                    value={b.image_size ?? "medio"}
                    onValueChange={(v) => update(b.id, { image_size: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMAGE_SIZES.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Cor de fundo</Label>
                  <Select
                    value={b.bg_color ?? "azul_claro"}
                    onValueChange={(v) => update(b.id, { bg_color: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BG_COLORS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {b.bg_color === "personalizado" && (
                  <div className="space-y-1">
                    <Label>Fundo personalizado (CSS)</Label>
                    <Input
                      value={b.bg_custom ?? ""}
                      onChange={(e) => update(b.id, { bg_custom: e.target.value })}
                      placeholder="#fff ou linear-gradient(...)"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label>Cor do CTA</Label>
                  <Select
                    value={b.cta_color ?? "vermelho"}
                    onValueChange={(v) => update(b.id, { cta_color: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CTA_COLORS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Tipo de animação</Label>
                  <Select
                    value={b.animation_type ?? "float"}
                    onValueChange={(v) => update(b.id, { animation_type: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ANIMATION_TYPES.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Microanimação leve. Respeita "reduzir movimento" do sistema.</p>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={b.show_text ?? true} onCheckedChange={(v) => update(b.id, { show_text: v })} />
                  <Label className="cursor-pointer">Mostrar texto</Label>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={b.show_price ?? true} onCheckedChange={(v) => update(b.id, { show_price: v })} />
                  <Label className="cursor-pointer">Mostrar preço</Label>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={b.show_cta ?? true} onCheckedChange={(v) => update(b.id, { show_cta: v })} />
                  <Label className="cursor-pointer">Mostrar CTA</Label>
                </div>

                <div className="space-y-1 md:col-span-1">
                  <Label>Badge</Label>
                  <Input
                    value={b.badge_text ?? ""}
                    onChange={(e) => update(b.id, { badge_text: e.target.value })}
                    placeholder="LEVE 3 PAGUE 2"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Título</Label>
                  <Input
                    value={b.title ?? ""}
                    onChange={(e) => update(b.id, { title: e.target.value })}
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>Subtítulo</Label>
                  <Textarea
                    rows={2}
                    value={b.subtitle ?? ""}
                    onChange={(e) => update(b.id, { subtitle: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Preço antigo (R$)</Label>
                  <Input
                    type="number" step="0.01"
                    value={b.old_price ?? ""}
                    onChange={(e) => update(b.id, { old_price: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Preço novo (R$)</Label>
                  <Input
                    type="number" step="0.01"
                    value={b.new_price ?? ""}
                    onChange={(e) => update(b.id, { new_price: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sufixo de preço</Label>
                  <Input
                    value={b.price_suffix ?? ""}
                    onChange={(e) => update(b.id, { price_suffix: e.target.value })}
                    placeholder="a partir de"
                  />
                </div>
                <div className="space-y-1">
                  <Label>CTA — texto</Label>
                  <Input
                    value={b.cta_text ?? ""}
                    onChange={(e) => update(b.id, { cta_text: e.target.value })}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>CTA — link</Label>
                  <Input
                    value={b.cta_url ?? ""}
                    onChange={(e) => update(b.id, { cta_url: e.target.value })}
                    placeholder="/categoria/ofertas"
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>Imagem</Label>
                  <div className="flex items-center gap-3">
                    {b.image_url && (
                      <img src={b.image_url} alt="" className="h-16 w-16 object-contain bg-muted rounded p-1" />
                    )}
                    <Input
                      value={b.image_url ?? ""}
                      onChange={(e) => update(b.id, { image_url: e.target.value })}
                      placeholder="https://..."
                    />
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadImage(b.id, f);
                        }}
                      />
                      <span className="inline-flex items-center gap-1 text-sm border rounded-md px-3 py-2 hover:bg-accent">
                        <Upload className="h-4 w-4" /> Upload
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <Button className="mt-4" onClick={() => saveOne(b)} disabled={saving}>
                Salvar bloco
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
