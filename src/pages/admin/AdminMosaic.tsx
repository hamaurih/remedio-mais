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
import { Plus, Trash2, Upload } from "lucide-react";
import { EntityPicker, type PickedEntity } from "@/components/admin/EntityPicker";
import type { MosaicTile } from "@/components/PromoMosaic";

const BG_OPTIONS = [
  { value: "soft-pink", label: "Rosa suave" },
  { value: "pink", label: "Rosa claro" },
  { value: "soft-blue", label: "Azul suave" },
  { value: "soft-mint", label: "Verde suave" },
  { value: "white", label: "Branco" },
  { value: "cream", label: "Creme" },
];

const BADGE_PRESETS = [
  "Promoção",
  "Oferta",
  "Até 30% OFF",
  "Leve 3 Pague 2",
  "Genéricos",
  "Mamães e Bebês",
  "Receita",
  "Controlado",
  "Novo",
  "Mais vendido",
  "Categoria",
  "Campanha",
];

type LinkType = "product" | "category" | "campaign" | "manual";
type ImageSource = "auto" | "upload" | "manual";

type ExtendedTile = MosaicTile & {
  link_type?: LinkType;
  product_id?: string | null;
  category_id?: string | null;
  campaign_id?: string | null;
  image_source?: ImageSource;
  custom_image_url?: string | null;
  manual_link?: string | null;
  badge_preset?: string | null;
};

export default function AdminMosaic() {
  const [tiles, setTiles] = useState<ExtendedTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickedEntities, setPickedEntities] = useState<Record<string, PickedEntity | null>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("home_mosaic_tiles")
      .select("*")
      .order("position");
    setTiles((data ?? []) as ExtendedTile[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Hydrate picked entities for tiles that already have a link
  useEffect(() => {
    (async () => {
      const updates: Record<string, PickedEntity | null> = {};
      for (const t of tiles) {
        if (pickedEntities[t.id] !== undefined) continue;
        if (t.link_type === "product" && t.product_id) {
          const { data } = await (supabase as any)
            .from("products")
            .select("id,name,slug,image_url,laboratory,category_name,short_description")
            .eq("id", t.product_id)
            .maybeSingle();
          if (data)
            updates[t.id] = {
              id: data.id,
              name: data.name,
              slug: data.slug,
              image_url: data.image_url,
              subtitle: data.laboratory || data.category_name,
              raw: data,
            };
        } else if (t.link_type === "category" && t.category_id) {
          const { data } = await (supabase as any)
            .from("categories")
            .select("id,name,slug,image_url,description")
            .eq("id", t.category_id)
            .maybeSingle();
          if (data)
            updates[t.id] = {
              id: data.id,
              name: data.name,
              slug: data.slug,
              image_url: data.image_url,
              subtitle: data.description,
              raw: data,
            };
        } else if (t.link_type === "campaign" && t.campaign_id) {
          const { data } = await (supabase as any)
            .from("campaigns")
            .select("id,name,slug,banner_image_url,subtitle")
            .eq("id", t.campaign_id)
            .maybeSingle();
          if (data)
            updates[t.id] = {
              id: data.id,
              name: data.name,
              slug: data.slug,
              image_url: data.banner_image_url,
              subtitle: data.subtitle,
              raw: data,
            };
        }
      }
      if (Object.keys(updates).length > 0) {
        setPickedEntities((s) => ({ ...s, ...updates }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  const update = (id: string, patch: Partial<ExtendedTile>) =>
    setTiles((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const onPickEntity = (tile: ExtendedTile, entity: PickedEntity | null) => {
    setPickedEntities((s) => ({ ...s, [tile.id]: entity }));
    if (!entity) {
      update(tile.id, {
        product_id: null,
        category_id: null,
        campaign_id: null,
      });
      return;
    }
    const t = tile.link_type;
    const patch: Partial<ExtendedTile> = {
      product_id: t === "product" ? entity.id : null,
      category_id: t === "category" ? entity.id : null,
      campaign_id: t === "campaign" ? entity.id : null,
    };
    // Pre-fill display fields only if currently empty (so admin overrides survive)
    if (!tile.title) patch.title = null; // keep null so resolved uses auto
    if (entity.raw) {
      // smart badge for products
      if (t === "product") {
        const p = entity.raw;
        if (p.on_sale) patch.badge_preset = patch.badge_preset || "Oferta";
        else if (p.controlled) patch.badge_preset = patch.badge_preset || "Controlado";
        else if (p.requires_prescription) patch.badge_preset = patch.badge_preset || "Receita";
      } else if (t === "category") {
        patch.badge_preset = patch.badge_preset || "Categoria";
      } else if (t === "campaign") {
        patch.badge_preset = patch.badge_preset || "Campanha";
      }
    }
    update(tile.id, patch);
  };

  const handleUpload = async (id: string, file: File) => {
    const ext = file.name.split(".").pop() || "png";
    const path = `mosaic/${id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("banners").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("banners").getPublicUrl(path);
    update(id, { custom_image_url: data.publicUrl, image_source: "upload" });
    toast.success("Imagem enviada");
  };

  const saveOne = async (t: ExtendedTile) => {
    const { id, ...rest } = t as any;
    const payload = {
      ...rest,
      position: Number(rest.position) || 0,
      link_type: rest.link_type || "manual",
      image_source: rest.image_source || "auto",
    };
    const { error } = await (supabase as any)
      .from("home_mosaic_tiles")
      .update(payload)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bloco salvo");
  };

  const addTile = async () => {
    const { data, error } = await (supabase as any)
      .from("home_mosaic_tiles")
      .insert({
        position: (tiles[tiles.length - 1]?.position ?? 0) + 1,
        size: "sm",
        title: "Novo bloco",
        bg_style: "soft-pink",
        active: true,
        link_type: "manual",
        image_source: "auto",
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setTiles((ts) => [...ts, data as ExtendedTile]);
  };

  const removeTile = async (id: string) => {
    if (!confirm("Remover este bloco?")) return;
    const { error } = await (supabase as any)
      .from("home_mosaic_tiles")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    setTiles((ts) => ts.filter((t) => t.id !== id));
  };

  if (loading) return <div className="p-6">Carregando…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold">Mosaico da Home</h1>
          <p className="text-sm text-muted-foreground">
            Vincule cada bloco a um produto, categoria ou campanha — ou use modo manual.
          </p>
        </div>
        <Button onClick={addTile}>
          <Plus className="h-4 w-4 mr-2" /> Novo bloco
        </Button>
      </div>

      <div className="space-y-6">
        {tiles.map((t) => {
          const linkType = (t.link_type || "manual") as LinkType;
          const imageSource = (t.image_source || "auto") as ImageSource;
          const picked = pickedEntities[t.id] ?? null;
          const isManualBadge =
            t.badge_preset === "__custom" ||
            (t.badge_preset && !BADGE_PRESETS.includes(t.badge_preset));

          return (
            <div key={t.id} className="bg-card border rounded-xl p-4 grid md:grid-cols-2 gap-4">
              {/* Coluna 1: vínculo + identidade */}
              <div className="space-y-3">
                <div>
                  <Label>Tipo de vínculo</Label>
                  <Select
                    value={linkType}
                    onValueChange={(v) =>
                      update(t.id, {
                        link_type: v as LinkType,
                        product_id: null,
                        category_id: null,
                        campaign_id: null,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">Produto</SelectItem>
                      <SelectItem value="category">Categoria</SelectItem>
                      <SelectItem value="campaign">Campanha</SelectItem>
                      <SelectItem value="manual">Link manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {linkType !== "manual" && (
                  <div>
                    <Label>
                      Selecionar{" "}
                      {linkType === "product"
                        ? "produto"
                        : linkType === "category"
                        ? "categoria"
                        : "campanha"}
                    </Label>
                    <EntityPicker
                      kind={linkType}
                      value={picked}
                      onPick={(e) => onPickEntity(t, e)}
                      placeholder={
                        linkType === "product"
                          ? "Buscar por nome, SKU, código de barras, lab…"
                          : "Buscar…"
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Os campos abaixo (título, subtítulo, link, imagem, selo) ficam vazios para
                      usar o dado do item vinculado. Preencha-os apenas se quiser sobrescrever.
                    </p>
                  </div>
                )}

                <div>
                  <Label>Título (override)</Label>
                  <Input
                    value={t.title ?? ""}
                    placeholder={picked?.name || "Título exibido"}
                    onChange={(e) => update(t.id, { title: e.target.value || null })}
                  />
                </div>

                <div>
                  <Label>Subtítulo (override)</Label>
                  <Textarea
                    rows={2}
                    value={t.subtitle ?? ""}
                    placeholder={picked?.subtitle || "Subtítulo exibido"}
                    onChange={(e) => update(t.id, { subtitle: e.target.value || null })}
                  />
                </div>

                <div>
                  <Label>Selo</Label>
                  <Select
                    value={isManualBadge ? "__custom" : t.badge_preset ?? "__none"}
                    onValueChange={(v) => {
                      if (v === "__none") update(t.id, { badge_preset: null, badge_text: null });
                      else if (v === "__custom") update(t.id, { badge_preset: "__custom" });
                      else update(t.id, { badge_preset: v, badge_text: null });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem selo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem selo</SelectItem>
                      {BADGE_PRESETS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom">Personalizado…</SelectItem>
                    </SelectContent>
                  </Select>
                  {isManualBadge && (
                    <Input
                      className="mt-2"
                      placeholder="Texto do selo personalizado"
                      value={t.badge_text ?? ""}
                      onChange={(e) => update(t.id, { badge_text: e.target.value || null })}
                    />
                  )}
                </div>

                <div>
                  <Label>Texto do botão</Label>
                  <Input
                    value={t.cta_text ?? ""}
                    onChange={(e) => update(t.id, { cta_text: e.target.value || null })}
                  />
                </div>
              </div>

              {/* Coluna 2: imagem + link + visual */}
              <div className="space-y-3">
                <div>
                  <Label>Imagem do bloco</Label>
                  <Select
                    value={imageSource}
                    onValueChange={(v) => update(t.id, { image_source: v as ImageSource })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto" disabled={linkType === "manual"}>
                        Usar imagem do item vinculado
                      </SelectItem>
                      <SelectItem value="upload">Upload</SelectItem>
                      <SelectItem value="manual">URL manual</SelectItem>
                    </SelectContent>
                  </Select>

                  {imageSource === "upload" && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm hover:bg-accent">
                        <Upload className="h-4 w-4" />
                        Enviar imagem
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(t.id, f);
                          }}
                        />
                      </label>
                      {t.custom_image_url && (
                        <img
                          src={t.custom_image_url}
                          alt=""
                          className="h-10 w-10 object-contain border rounded"
                        />
                      )}
                    </div>
                  )}

                  {imageSource === "manual" && (
                    <Input
                      className="mt-2"
                      placeholder="https://…"
                      value={t.custom_image_url ?? t.image_url ?? ""}
                      onChange={(e) =>
                        update(t.id, { custom_image_url: e.target.value || null })
                      }
                    />
                  )}
                </div>

                <div>
                  <Label>Link {linkType === "manual" ? "(obrigatório)" : "(override opcional)"}</Label>
                  <Input
                    value={t.manual_link ?? t.link ?? ""}
                    placeholder={
                      linkType !== "manual" && picked?.slug
                        ? `/${linkType === "product" ? "produto" : linkType === "category" ? "categoria" : "campanha"}/${picked.slug}`
                        : "/categoria/ofertas"
                    }
                    onChange={(e) => update(t.id, { manual_link: e.target.value || null })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Tamanho</Label>
                    <Select
                      value={t.size}
                      onValueChange={(v) => update(t.id, { size: v as "lg" | "sm" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lg">Grande</SelectItem>
                        <SelectItem value="sm">Pequeno</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fundo</Label>
                    <Select
                      value={t.bg_style}
                      onValueChange={(v) => update(t.id, { bg_style: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BG_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Posição</Label>
                    <Input
                      type="number"
                      value={t.position}
                      onChange={(e) => update(t.id, { position: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={t.active}
                      onCheckedChange={(v) => update(t.id, { active: v })}
                    />
                    <span className="text-sm">Ativo</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => removeTile(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => saveOne(t)}>
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {tiles.length === 0 && (
          <div className="text-sm text-muted-foreground py-10 text-center border rounded-xl">
            Nenhum bloco. Clique em “Novo bloco” para criar.
          </div>
        )}
      </div>
    </div>
  );
}
