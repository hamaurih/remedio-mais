import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShelfReorderDialog } from "@/components/admin/ShelfReorderDialog";
import { HOME_SHELVES } from "@/lib/homeShelves";
import {
  customShelfSectionKey,
  slugifyShelfKey,
  useCustomShelves,
  type CustomShelf,
} from "@/hooks/useCustomShelves";
import { toast } from "sonner";
import { LayoutList, Settings2, Sparkles, Plus, Pencil, Trash2 } from "lucide-react";

const BG_OPTIONS = [
  { value: "white", label: "Branco" },
  { value: "light", label: "Cinza claro" },
  { value: "red-soft", label: "Vermelho suave" },
  { value: "highlight", label: "Amarelo destaque" },
];

type Draft = {
  id?: string;
  title: string;
  subtitle: string;
  badge: string;
  background_variant: string;
  view_all_link: string;
  max_items: number;
  active: boolean;
};

const emptyDraft: Draft = {
  title: "",
  subtitle: "",
  badge: "",
  background_variant: "white",
  view_all_link: "",
  max_items: 12,
  active: true,
};

export default function AdminHomeShelves() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openTitle, setOpenTitle] = useState<string>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: counts } = useQuery({
    queryKey: ["home_shelf_items", "counts", openKey],
    queryFn: async () => {
      const { data } = await (supabase as any).from("home_shelf_items").select("shelf_key");
      const map: Record<string, number> = {};
      ((data || []) as { shelf_key: string }[]).forEach((r) => {
        map[r.shelf_key] = (map[r.shelf_key] || 0) + 1;
      });
      return map;
    },
  });

  const { data: customShelves } = useCustomShelves(false);

  const openEditor = (shelf?: CustomShelf) => {
    if (!shelf) return setDraft({ ...emptyDraft });
    setDraft({
      id: shelf.id,
      title: shelf.title,
      subtitle: shelf.subtitle || "",
      badge: shelf.badge || "",
      background_variant: shelf.background_variant || "white",
      view_all_link: shelf.view_all_link || "",
      max_items: shelf.max_items || 12,
      active: shelf.active,
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return toast.error("Informe o nome da vitrine");
    setSaving(true);
    try {
      const payload = {
        title,
        subtitle: draft.subtitle.trim() || null,
        badge: draft.badge.trim() || null,
        background_variant: draft.background_variant,
        view_all_link: draft.view_all_link.trim() || null,
        max_items: Number(draft.max_items) || 12,
        active: draft.active,
      };

      if (draft.id) {
        const { error } = await (supabase as any)
          .from("home_custom_shelves")
          .update(payload)
          .eq("id", draft.id);
        if (error) throw error;
      } else {
        const base = slugifyShelfKey(title) || "vitrine";
        const used = new Set([
          ...HOME_SHELVES.map((s) => s.key),
          ...(customShelves || []).map((s) => s.shelf_key),
        ]);
        let key = base;
        let i = 2;
        while (used.has(key)) key = `${base}-${i++}`;

        const { error } = await (supabase as any)
          .from("home_custom_shelves")
          .insert({ ...payload, shelf_key: key });
        if (error) throw error;

        // entra no fim do Layout da Home, já visível
        const { data: last } = await (supabase as any)
          .from("home_layout")
          .select("position")
          .order("position", { ascending: false })
          .limit(1);
        const nextPos = Number(last?.[0]?.position ?? 0) + 10;
        const { error: layoutError } = await (supabase as any).from("home_layout").insert({
          section_key: customShelfSectionKey(key),
          label: `Vitrine: ${title}`,
          position: nextPos,
          enabled: true,
        });
        if (layoutError) throw layoutError;
      }

      toast.success(draft.id ? "Vitrine atualizada" : "Vitrine criada");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["home_custom_shelves"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar vitrine");
    } finally {
      setSaving(false);
    }
  };

  const removeShelf = async (shelf: CustomShelf) => {
    if (!confirm(`Excluir a vitrine "${shelf.title}"? Os produtos fixados nela serão desvinculados.`))
      return;
    try {
      await (supabase as any).from("home_shelf_items").delete().eq("shelf_key", shelf.shelf_key);
      await (supabase as any)
        .from("home_layout")
        .delete()
        .eq("section_key", customShelfSectionKey(shelf.shelf_key));
      const { error } = await (supabase as any)
        .from("home_custom_shelves")
        .delete()
        .eq("id", shelf.id);
      if (error) throw error;
      toast.success("Vitrine excluída");
      qc.invalidateQueries({ queryKey: ["home_custom_shelves"] });
      qc.invalidateQueries({ queryKey: ["home_shelf_items"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <LayoutList className="h-6 w-6 text-primary" /> Vitrines da Home
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha quais produtos aparecem em cada vitrine da página inicial e em qual ordem.
            Vitrines sem produtos definidos continuam automáticas.
          </p>
        </div>
        <Button onClick={() => openEditor()}>
          <Plus className="h-4 w-4 mr-2" /> Nova vitrine
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {HOME_SHELVES.map((s) => {
          const n = counts?.[s.key] || 0;
          return (
            <Card key={s.key}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                  <div className="text-xs mt-1 flex items-center gap-1">
                    {n > 0 ? (
                      <span className="text-primary font-semibold flex items-center gap-1">
                        <Settings2 className="h-3.5 w-3.5" /> {n} produto(s) fixados manualmente
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" /> Automática
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpenKey(s.key);
                    setOpenTitle(s.title);
                  }}
                >
                  Organizar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div>
        <h2 className="text-lg font-bold mb-2">Vitrines personalizadas</h2>
        {(customShelves || []).length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-xl py-8 text-center">
            Nenhuma vitrine personalizada. Clique em “Nova vitrine” para criar.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(customShelves || []).map((s) => {
              const n = counts?.[s.shelf_key] || 0;
              return (
                <Card key={s.id}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">
                        {s.title}
                        {!s.active && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (inativa)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {s.subtitle || s.shelf_key}
                      </div>
                      <div className="text-xs mt-1">
                        {n > 0 ? (
                          <span className="text-primary font-semibold flex items-center gap-1">
                            <Settings2 className="h-3.5 w-3.5" /> {n} produto(s) fixados
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Sem produtos — não aparece na home
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setOpenKey(s.shelf_key);
                          setOpenTitle(s.title);
                        }}
                      >
                        Organizar
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEditor(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => removeShelf(s)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {openKey && (
        <ShelfReorderDialog
          open={!!openKey}
          onOpenChange={(b) => !b && setOpenKey(null)}
          shelfKey={openKey}
          shelfTitle={openTitle}
        />
      )}

      <Dialog open={!!draft} onOpenChange={(b) => !b && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar vitrine" : "Nova vitrine da home"}</DialogTitle>
            <DialogDescription>
              A vitrine entra no fim da página inicial (você pode reordenar em Layout da Home) e
              exibe os produtos que você fixar em “Organizar”.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="shelf-title">Nome da vitrine</Label>
                <Input
                  id="shelf-title"
                  value={draft.title}
                  placeholder="Ex.: Verão Saudável"
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="shelf-subtitle">Subtítulo (opcional)</Label>
                <Input
                  id="shelf-subtitle"
                  value={draft.subtitle}
                  placeholder="Ex.: Seleção especial da estação"
                  onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="shelf-badge">Selo (opcional)</Label>
                  <Input
                    id="shelf-badge"
                    value={draft.badge}
                    placeholder="Ex.: Novo"
                    onChange={(e) => setDraft({ ...draft, badge: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="shelf-max">Máximo de produtos</Label>
                  <Input
                    id="shelf-max"
                    type="number"
                    min={4}
                    max={40}
                    value={draft.max_items}
                    onChange={(e) => setDraft({ ...draft, max_items: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cor de fundo</Label>
                  <Select
                    value={draft.background_variant}
                    onValueChange={(v) => setDraft({ ...draft, background_variant: v })}
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
                  <Label htmlFor="shelf-link">Link “ver todos” (opcional)</Label>
                  <Input
                    id="shelf-link"
                    value={draft.view_all_link}
                    placeholder="/categoria/vitaminas"
                    onChange={(e) => setDraft({ ...draft, view_all_link: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="shelf-active"
                  checked={draft.active}
                  onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                />
                <Label htmlFor="shelf-active">Ativa no site</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveDraft} disabled={saving}>
              {saving ? "Salvando…" : draft?.id ? "Salvar" : "Criar vitrine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
