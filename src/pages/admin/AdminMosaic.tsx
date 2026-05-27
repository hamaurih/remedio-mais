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
import { Plus, Trash2 } from "lucide-react";
import type { MosaicTile } from "@/components/PromoMosaic";

const BG_OPTIONS = [
  { value: "soft-pink", label: "Rosa suave" },
  { value: "pink", label: "Rosa claro" },
  { value: "soft-blue", label: "Azul suave" },
  { value: "soft-mint", label: "Verde suave" },
  { value: "white", label: "Branco" },
  { value: "cream", label: "Creme" },
];

export default function AdminMosaic() {
  const [tiles, setTiles] = useState<MosaicTile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("home_mosaic_tiles")
      .select("*")
      .order("position");
    setTiles((data ?? []) as MosaicTile[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const update = (id: string, patch: Partial<MosaicTile>) =>
    setTiles((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const saveOne = async (t: MosaicTile) => {
    const { id, ...rest } = t;
    const { error } = await (supabase as any)
      .from("home_mosaic_tiles")
      .update({ ...rest, position: Number(rest.position) || 0 })
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
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setTiles((ts) => [...ts, data as MosaicTile]);
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
            1 bloco grande + 2 a 4 blocos pequenos. Aparecem logo abaixo do banner principal.
          </p>
        </div>
        <Button onClick={addTile}>
          <Plus className="h-4 w-4 mr-2" /> Novo bloco
        </Button>
      </div>

      <div className="space-y-4">
        {tiles.map((t) => (
          <div key={t.id} className="bg-card border rounded-xl p-4 grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={t.title ?? ""}
                onChange={(e) => update(t.id, { title: e.target.value })}
              />
              <Label>Subtítulo</Label>
              <Textarea
                value={t.subtitle ?? ""}
                onChange={(e) => update(t.id, { subtitle: e.target.value })}
                rows={2}
              />
              <Label>Selo</Label>
              <Input
                value={t.badge_text ?? ""}
                onChange={(e) => update(t.id, { badge_text: e.target.value })}
              />
              <Label>Texto do botão</Label>
              <Input
                value={t.cta_text ?? ""}
                onChange={(e) => update(t.id, { cta_text: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Link (ex: /categoria/ofertas)</Label>
              <Input
                value={t.link ?? ""}
                onChange={(e) => update(t.id, { link: e.target.value })}
              />
              <Label>Imagem do produto (URL)</Label>
              <Input
                value={t.image_url ?? ""}
                onChange={(e) => update(t.id, { image_url: e.target.value })}
              />
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
                    onChange={(e) =>
                      update(t.id, { position: Number(e.target.value) })
                    }
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
        ))}
        {tiles.length === 0 && (
          <div className="text-sm text-muted-foreground py-10 text-center border rounded-xl">
            Nenhum bloco. Clique em “Novo bloco” para criar.
          </div>
        )}
      </div>
    </div>
  );
}
