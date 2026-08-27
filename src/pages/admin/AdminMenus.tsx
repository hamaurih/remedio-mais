import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Trash2, ArrowUp, ArrowDown, Plus, Activity, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PAGE_KEYS, resolveMenuHref, type MenuItem } from "@/hooks/useMenu";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

const AREAS: { value: string; label: string }[] = [
  { value: "header_main", label: "Header principal" },
  { value: "all_categories", label: "Todas as Categorias (mega menu)" },
  { value: "footer_institutional", label: "Footer — Institucional" },
  { value: "footer_support", label: "Footer — Atendimento" },
  { value: "footer_categories", label: "Footer — Categorias" },
  { value: "mobile_menu", label: "Menu mobile" },
];

const LINK_TYPES = [
  { value: "category", label: "Categoria" },
  { value: "subcategory", label: "Subcategoria" },
  { value: "campaign", label: "Campanha" },
  { value: "page", label: "Página interna" },
  { value: "product", label: "Produto" },
  { value: "manual", label: "Link manual" },
  { value: "group", label: "Sem link / agrupador" },
];

const emptyItem = (area: string): Partial<MenuItem> => ({
  menu_area: area,
  label: "",
  link_type: "category",
  active: true,
  show_on_desktop: true,
  show_on_mobile: true,
  open_in_new_tab: false,
  highlight: false,
  position: 0,
});

export default function AdminMenus() {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
  const [area, setArea] = useState("header_main");
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["admin_menu_items", area],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("menu_items")
        .select("*")
        .eq("menu_area", area)
        .order("position");
      return (data ?? []) as MenuItem[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["admin_menu_categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id,name,slug,active")
        .order("name");
      return data ?? [];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["admin_menu_campaigns"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("campaigns")
        .select("id,name,slug")
        .order("name");
      return (data ?? []) as { id: string; name: string; slug: string }[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin_menu_items"] });
    qc.invalidateQueries({ queryKey: ["menu_items"] });
    qc.invalidateQueries({ queryKey: ["nav_categories"] });
  };

  async function save() {
    if (!editing) return;
    const payload = { ...editing };
    if (!payload.label) {
      toast.error("Informe um rótulo");
      return;
    }
    const { id, ...rest } = payload as any;
    const op = id
      ? (supabase as any).from("menu_items").update(rest).eq("id", id)
      : (supabase as any).from("menu_items").insert(rest);
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success("Menu salvo");
    setEditing(null);
    refresh();
  }

  async function remove(id: string) {
    const item = items.find((it) => it.id === id);
    const approved = await confirmAction({
      title: "Excluir item de menu?",
      description: item?.label
        ? `O item \"${item.label}\" será removido desta área do menu. Esta ação não exclui a página, categoria, produto ou campanha vinculada.`
        : "O item será removido desta área do menu. Esta ação não exclui o conteúdo vinculado.",
      confirmLabel: "Excluir item",
      destructive: true,
    });
    if (!approved) return;
    const { error } = await (supabase as any).from("menu_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item de menu excluído");
    refresh();
  }

  async function move(item: MenuItem, dir: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((x) => x.id === item.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await (supabase as any).from("menu_items").update({ position: swap.position }).eq("id", item.id);
    await (supabase as any).from("menu_items").update({ position: item.position }).eq("id", swap.id);
    refresh();
  }

  async function toggle(id: string, field: "active" | "show_on_desktop" | "show_on_mobile", value: boolean) {
    await (supabase as any).from("menu_items").update({ [field]: value }).eq("id", id);
    refresh();
  }

  return (
    <div className="p-6 space-y-4">
      {confirmDialog}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Menus</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie todos os menus do site: header, mega menu, footer e mobile.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDiagOpen(true)}>
            <Activity className="h-4 w-4 mr-2" /> Diagnosticar menus
          </Button>
          <Button onClick={() => setEditing(emptyItem(area))}>
            <Plus className="h-4 w-4 mr-2" /> Novo item
          </Button>
        </div>
      </div>

      <Tabs value={area} onValueChange={setArea}>
        <TabsList className="flex flex-wrap h-auto">
          {AREAS.map((a) => (
            <TabsTrigger key={a.value} value={a.value}>{a.label}</TabsTrigger>
          ))}
        </TabsList>

        {AREAS.map((a) => (
          <TabsContent key={a.value} value={a.value} className="mt-4">
            <div className="rounded-lg border divide-y bg-card">
              {items.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  Nenhum item neste menu. Clique em "Novo item".
                </div>
              )}
              {items.map((it) => {
                const href = resolveMenuHref(it);
                const broken =
                  (it.link_type === "category" && !it.category_id) ||
                  (it.link_type === "campaign" && !it.campaign_id) ||
                  (it.link_type === "manual" && !it.url) ||
                  href === "#";
                return (
                  <div key={it.id} className="p-3 flex items-center gap-3 flex-wrap">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => move(it, -1)} className="p-1 hover:bg-accent rounded"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={() => move(it, 1)} className="p-1 hover:bg-accent rounded"><ArrowDown className="h-3 w-3" /></button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{it.label}</span>
                        <Badge variant="outline" className="text-[10px]">{LINK_TYPES.find((l) => l.value === it.link_type)?.label}</Badge>
                        {it.badge_text && <Badge className="text-[10px]">{it.badge_text}</Badge>}
                        {it.highlight && <Badge variant="secondary" className="text-[10px]">Destaque</Badge>}
                        {broken && <Badge variant="destructive" className="text-[10px]">Link inválido</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{href}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <label className="flex items-center gap-1"><Switch checked={it.active} onCheckedChange={(v) => toggle(it.id, "active", v)} /> Ativo</label>
                      <label className="flex items-center gap-1"><Switch checked={it.show_on_desktop} onCheckedChange={(v) => toggle(it.id, "show_on_desktop", v)} /> Desktop</label>
                      <label className="flex items-center gap-1"><Switch checked={it.show_on_mobile} onCheckedChange={(v) => toggle(it.id, "show_on_mobile", v)} /> Mobile</label>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(it)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(it.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar item" : "Novo item"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Área</Label>
                  <Select value={editing.menu_area as string} onValueChange={(v) => setEditing({ ...editing, menu_area: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de link</Label>
                  <Select value={editing.link_type} onValueChange={(v) => setEditing({ ...editing, link_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LINK_TYPES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {editing.link_type === "category" && (
                <div>
                  <Label>Categoria</Label>
                  <Select
                    value={editing.category_id || ""}
                    onValueChange={(v) => {
                      const c = (categories as any[]).find((x) => x.id === v);
                      setEditing({
                        ...editing,
                        category_id: v,
                        slug: c?.slug || editing.slug,
                        label: editing.label || c?.name || "",
                        url: c?.slug ? `/categoria/${c.slug}` : editing.url,
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(categories as any[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}{!c.active ? " (inativa)" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editing.link_type === "subcategory" && (
                <div>
                  <Label>Categoria pai</Label>
                  <Select
                    value={editing.category_id || ""}
                    onValueChange={(v) => setEditing({ ...editing, category_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Categoria pai" /></SelectTrigger>
                    <SelectContent>
                      {(categories as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Label className="mt-2">URL da subcategoria</Label>
                  <Input value={editing.url || ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="/categoria/medicamentos/dor-e-febre" />
                </div>
              )}

              {editing.link_type === "campaign" && (
                <div>
                  <Label>Campanha</Label>
                  <Select
                    value={editing.campaign_id || ""}
                    onValueChange={(v) => {
                      const c = campaigns.find((x) => x.id === v);
                      setEditing({
                        ...editing,
                        campaign_id: v,
                        slug: c?.slug || editing.slug,
                        label: editing.label || c?.name || "",
                        url: c?.slug ? `/campanha/${c.slug}` : editing.url,
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editing.link_type === "page" && (
                <div>
                  <Label>Página</Label>
                  <Select
                    value={editing.page_key || ""}
                    onValueChange={(v) => {
                      const p = PAGE_KEYS.find((x) => x.key === v);
                      setEditing({ ...editing, page_key: v, url: p?.path, label: editing.label || p?.label || "" });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {PAGE_KEYS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editing.link_type === "product" && (
                <div>
                  <Label>Slug do produto</Label>
                  <Input
                    value={editing.slug || ""}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value, url: `/produto/${e.target.value}` })}
                    placeholder="ex: dipirona-500mg"
                  />
                </div>
              )}

              {editing.link_type === "manual" && (
                <div>
                  <Label>URL (interna ou externa)</Label>
                  <Input value={editing.url || ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="/rota ou https://..." />
                </div>
              )}

              <div>
                <Label>Rótulo</Label>
                <Input value={editing.label || ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </div>

              <div>
                <Label>Item pai (sub-menu)</Label>
                <Select
                  value={editing.parent_id || "none"}
                  onValueChange={(v) => setEditing({ ...editing, parent_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem pai (nível 1) —</SelectItem>
                    {items.filter((i) => i.id !== editing.id).map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Posição</Label>
                  <Input type="number" value={editing.position ?? 0} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Ícone (lucide)</Label>
                  <Input value={editing.icon || ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} placeholder="opcional" />
                </div>
                <div>
                  <Label>Badge</Label>
                  <Input value={editing.badge_text || ""} onChange={(e) => setEditing({ ...editing, badge_text: e.target.value })} placeholder="Novo / Oferta" />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Ativo</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.show_on_desktop} onCheckedChange={(v) => setEditing({ ...editing, show_on_desktop: v })} /> Desktop</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.show_on_mobile} onCheckedChange={(v) => setEditing({ ...editing, show_on_mobile: v })} /> Mobile</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.open_in_new_tab} onCheckedChange={(v) => setEditing({ ...editing, open_in_new_tab: v })} /> Abrir em nova aba</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.highlight} onCheckedChange={(v) => setEditing({ ...editing, highlight: v })} /> Destaque</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiagnosticsDialog open={diagOpen} onOpenChange={setDiagOpen} categories={categories as any[]} campaigns={campaigns} />
    </div>
  );
}

function DiagnosticsDialog({
  open, onOpenChange, categories, campaigns,
}: { open: boolean; onOpenChange: (v: boolean) => void; categories: any[]; campaigns: any[] }) {
  const [rows, setRows] = useState<MenuItem[]>([]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any).from("menu_items").select("*");
      setRows((data ?? []) as MenuItem[]);
    })();
  }, [open]);

  const stats = useMemo(() => {
    const activeCatIds = new Set(categories.filter((c) => c.active).map((c) => c.id));
    const campaignIds = new Set(campaigns.map((c) => c.id));
    return {
      total: rows.length,
      active: rows.filter((r) => r.active).length,
      inactive: rows.filter((r) => !r.active).length,
      noLink: rows.filter((r) => resolveMenuHref(r) === "#").length,
      brokenCategory: rows.filter((r) => r.link_type === "category" && r.category_id && !activeCatIds.has(r.category_id)).length,
      brokenCampaign: rows.filter((r) => r.link_type === "campaign" && r.campaign_id && !campaignIds.has(r.campaign_id)).length,
      desktop: rows.filter((r) => r.show_on_desktop).length,
      mobile: rows.filter((r) => r.show_on_mobile).length,
    };
  }, [rows, categories, campaigns]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Diagnóstico dos menus</DialogTitle></DialogHeader>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          <li className="rounded border p-3"><div className="text-muted-foreground text-xs">Total</div><div className="text-xl font-bold">{stats.total}</div></li>
          <li className="rounded border p-3"><div className="text-muted-foreground text-xs">Ativos</div><div className="text-xl font-bold">{stats.active}</div></li>
          <li className="rounded border p-3"><div className="text-muted-foreground text-xs">Inativos</div><div className="text-xl font-bold">{stats.inactive}</div></li>
          <li className="rounded border p-3"><div className="text-muted-foreground text-xs">Sem link</div><div className="text-xl font-bold">{stats.noLink}</div></li>
          <li className="rounded border p-3"><div className="text-muted-foreground text-xs">Categoria inexistente</div><div className="text-xl font-bold">{stats.brokenCategory}</div></li>
          <li className="rounded border p-3"><div className="text-muted-foreground text-xs">Campanha inexistente</div><div className="text-xl font-bold">{stats.brokenCampaign}</div></li>
          <li className="rounded border p-3"><div className="text-muted-foreground text-xs">Visíveis no desktop</div><div className="text-xl font-bold">{stats.desktop}</div></li>
          <li className="rounded border p-3"><div className="text-muted-foreground text-xs">Visíveis no mobile</div><div className="text-xl font-bold">{stats.mobile}</div></li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}