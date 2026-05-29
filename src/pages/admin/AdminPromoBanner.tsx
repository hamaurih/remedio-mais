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
import { toast } from "sonner";
import type { PromoBlock } from "@/components/PromoBanner";
import { Trash2, Plus, Upload } from "lucide-react";

const VARIANTS = [
  { value: "anniversary", label: "Aniversário (com confete)" },
  { value: "leve-pague", label: "Leve X Pague Y" },
  { value: "default", label: "Padrão (preço)" },
  { value: "desconto-2", label: "Desconto na 2ª unidade" },
  { value: "generico", label: "Especial do Genérico (escuro)" },
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
    const payload = {
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
      });
    if (error) toast.error(error.message);
    else load();
  };

  const uploadImage = async (id: string, file: File) => {
    const ext = file.name.split(".").pop();
    const path = `promo-banner/${id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("banners").upload(path, file, {
      upsert: true,
    });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("banners").getPublicUrl(path);
    update(id, { image_url: data.publicUrl });
    toast.success("Imagem enviada — clique em Salvar bloco");
  };

  if (loading) return <div className="p-6">Carregando...</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Mini Banners Promocionais</h1>
          <p className="text-sm text-muted-foreground">
            Faixa de mini banners exibida abaixo do menu. O 1º bloco (menor posição) aparece como destaque (maior). Faça upload da arte pronta em image_url para usar como banner inteiro; sem imagem, mostra fallback com título, preço e CTA.
          </p>
        </div>
        <Button onClick={add}>
          <Plus className="h-4 w-4" /> Novo bloco
        </Button>
      </div>

      <div className="space-y-4">
        {blocks.map((b) => (
          <div key={b.id} className="bg-card border rounded-xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-1 rounded bg-muted">
                  Posição #{b.position}
                </span>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={b.active}
                    onChange={(e) => update(b.id, { active: e.target.checked })}
                  />
                  Ativo
                </label>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(b.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Variante visual</Label>
                <Select
                  value={b.variant}
                  onValueChange={(v) => update(b.id, { variant: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIANTS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Posição</Label>
                <Input
                  type="number"
                  value={b.position}
                  onChange={(e) =>
                    update(b.id, { position: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Modo da imagem</Label>
                <Select
                  value={(b as any).image_mode ?? "product"}
                  onValueChange={(v) => update(b.id, { image_mode: v } as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Produto (texto + preço + CTA + imagem ao lado)</SelectItem>
                    <SelectItem value="full_banner">Banner inteiro (a imagem ocupa todo o card)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Badge (texto pequeno)</Label>
                <Input
                  value={b.badge_text ?? ""}
                  onChange={(e) => update(b.id, { badge_text: e.target.value })}
                  placeholder="LEVE 3 PAGUE 2"
                />
              </div>
              <div className="space-y-1">
                <Label>Título</Label>
                <Input
                  value={b.title ?? ""}
                  onChange={(e) => update(b.id, { title: e.target.value })}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
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
                  type="number"
                  step="0.01"
                  value={b.old_price ?? ""}
                  onChange={(e) =>
                    update(b.id, {
                      old_price: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Preço novo (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={b.new_price ?? ""}
                  onChange={(e) =>
                    update(b.id, {
                      new_price: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Sufixo de preço (ex.: "a partir de", "cada")</Label>
                <Input
                  value={b.price_suffix ?? ""}
                  onChange={(e) => update(b.id, { price_suffix: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>CTA — texto</Label>
                <Input
                  value={b.cta_text ?? ""}
                  onChange={(e) => update(b.id, { cta_text: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>CTA — link</Label>
                <Input
                  value={b.cta_url ?? ""}
                  onChange={(e) => update(b.id, { cta_url: e.target.value })}
                  placeholder="/categoria/ofertas"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Imagem do produto (PNG transparente recomendado)</Label>
                <div className="flex items-center gap-3">
                  {b.image_url && (
                    <img
                      src={b.image_url}
                      alt=""
                      className="h-16 w-16 object-contain bg-primary rounded p-1"
                    />
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
        ))}
      </div>
    </div>
  );
}
