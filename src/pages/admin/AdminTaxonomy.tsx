import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Power } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---------- DEPARTMENTS ----------
function DepartmentsTab() {
  const qc = useQueryClient();
  const empty: any = {
    id: "", name: "", slug: "", description: "", image_url: "", icon: "",
    band_color: "#E11D2E", position: 0, active: true, show_in_menu: true, show_on_home: true,
  };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);

  const { data = [] } = useQuery({
    queryKey: ["admin_departments"],
    queryFn: async () => (await sb.from("departments").select("*").order("position")).data || [],
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["admin_departments_counts"],
    queryFn: async () => {
      const { data } = await sb.from("categories").select("department_id");
      const acc: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        if (r.department_id) acc[r.department_id] = (acc[r.department_id] || 0) + 1;
      });
      return acc;
    },
  });

  const save = async () => {
    try {
      if (!editing.name?.trim()) return toast.error("Nome obrigatório");
      const slug = editing.slug || slugify(editing.name);
      const payload = { ...editing, slug, position: Number(editing.position) || 0 };
      if (editing.id) {
        const { error } = await sb.from("departments").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await sb.from("departments").insert(payload);
        if (error) throw error;
      }
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["admin_departments"] });
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleActive = async (d: any) => {
    await sb.from("departments").update({ active: !d.active }).eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["admin_departments"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir departamento? Categorias vinculadas terão o vínculo removido.")) return;
    const { error } = await sb.from("departments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["admin_departments"] });
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={() => { setEditing(empty); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo departamento
        </Button>
      </div>
      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="p-3">Cor</th><th className="p-3">Nome</th><th className="p-3">Slug</th>
              <th className="p-3">Categorias</th><th className="p-3">Ordem</th>
              <th className="p-3">Menu</th><th className="p-3">Home</th><th className="p-3">Ativa</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="p-3"><div className="w-6 h-6 rounded" style={{ background: d.band_color || "#999" }} /></td>
                <td className="p-3 font-medium">{d.name}</td>
                <td className="p-3 text-muted-foreground">{d.slug}</td>
                <td className="p-3">{counts[d.id] || 0}</td>
                <td className="p-3">{d.position}</td>
                <td className="p-3">{d.show_in_menu ? "Sim" : "—"}</td>
                <td className="p-3">{d.show_on_home ? "Sim" : "—"}</td>
                <td className="p-3">{d.active ? <span className="text-whatsapp text-xs font-semibold">Ativa</span> : <span className="text-muted-foreground text-xs">Inativa</span>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => toggleActive(d)}><Power className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing({ ...empty, ...d }); setOpen(true); }}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhum departamento.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Novo"} departamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome *</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Slug</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder={editing.name && slugify(editing.name)} /></div>
            <div className="space-y-1"><Label>Descrição</Label><Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Ícone (lucide)</Label><Input value={editing.icon || ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} placeholder="Pill, Heart..." /></div>
              <div className="space-y-1"><Label>Ordem</Label><Input type="number" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Imagem (URL)</Label><Input value={editing.image_url || ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <Input type="color" value={editing.band_color || "#E11D2E"} onChange={(e) => setEditing({ ...editing, band_color: e.target.value })} className="w-16 h-10 p-1" />
                <Input value={editing.band_color || ""} onChange={(e) => setEditing({ ...editing, band_color: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={editing.show_in_menu} onCheckedChange={(v) => setEditing({ ...editing, show_in_menu: v })} /><Label>Aparece no menu</Label></div>
            <div className="flex items-center gap-2"><Switch checked={editing.show_on_home} onCheckedChange={(v) => setEditing({ ...editing, show_on_home: v })} /><Label>Aparece na home</Label></div>
            <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativa</Label></div>
            <Button className="w-full" onClick={save}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- CATEGORIES (link to department) ----------
function CategoriesTab() {
  const qc = useQueryClient();
  const [filterDept, setFilterDept] = useState<string>("all");

  const { data: depts = [] } = useQuery({
    queryKey: ["admin_departments_simple"],
    queryFn: async () => (await sb.from("departments").select("id,name,slug").order("position")).data || [],
  });
  const { data: cats = [] } = useQuery({
    queryKey: ["admin_categories_taxonomy"],
    queryFn: async () => (await sb.from("categories").select("id,name,slug,department_id,active,position,macro_group").order("position")).data || [],
  });

  const filtered = useMemo(() => {
    if (filterDept === "all") return cats;
    if (filterDept === "none") return cats.filter((c: any) => !c.department_id);
    return cats.filter((c: any) => c.department_id === filterDept);
  }, [cats, filterDept]);

  const setDept = async (catId: string, deptId: string | null) => {
    const { error } = await sb.from("categories").update({ department_id: deptId }).eq("id", catId);
    if (error) return toast.error(error.message);
    toast.success("Vínculo atualizado");
    qc.invalidateQueries({ queryKey: ["admin_categories_taxonomy"] });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <Label className="text-sm">Filtrar:</Label>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos departamentos</SelectItem>
            <SelectItem value="none">Sem departamento</SelectItem>
            {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} categorias</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Vincule cada categoria existente a um departamento comercial. Edição completa (nome, imagem etc.) continua em <strong>Admin &gt; Categorias</strong>.
      </p>
      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="p-3">Categoria</th><th className="p-3">Slug</th>
              <th className="p-3">Macro-grupo (legado)</th>
              <th className="p-3">Departamento comercial</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-muted-foreground">{c.slug}</td>
                <td className="p-3 text-muted-foreground">{c.macro_group || <span className="opacity-50">—</span>}</td>
                <td className="p-3">
                  <Select value={c.department_id || "none"} onValueChange={(v) => setDept(c.id, v === "none" ? null : v)}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Sem departamento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem departamento —</SelectItem>
                      {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3">{c.active ? <span className="text-whatsapp text-xs font-semibold">Ativa</span> : <span className="text-muted-foreground text-xs">Inativa</span>}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma categoria.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- SUBCATEGORIES ----------
function SubcategoriesTab() {
  const qc = useQueryClient();
  const empty: any = { id: "", category_id: "", name: "", slug: "", description: "", position: 0, active: true, show_in_menu: true };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [filterCat, setFilterCat] = useState("all");

  const { data: cats = [] } = useQuery({
    queryKey: ["admin_categories_simple"],
    queryFn: async () => (await sb.from("categories").select("id,name").order("name")).data || [],
  });
  const catMap = useMemo(() => Object.fromEntries(cats.map((c: any) => [c.id, c.name])), [cats]);

  const { data: subs = [] } = useQuery({
    queryKey: ["admin_subcategories"],
    queryFn: async () => (await sb.from("subcategories").select("*").order("position")).data || [],
  });

  const filtered = useMemo(() => filterCat === "all" ? subs : subs.filter((s: any) => s.category_id === filterCat), [subs, filterCat]);

  const save = async () => {
    try {
      if (!editing.name?.trim()) return toast.error("Nome obrigatório");
      if (!editing.category_id) return toast.error("Selecione a categoria pai");
      const slug = editing.slug || slugify(editing.name);
      const payload = { ...editing, slug, position: Number(editing.position) || 0 };
      if (editing.id) {
        const { error } = await sb.from("subcategories").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await sb.from("subcategories").insert(payload);
        if (error) throw error;
      }
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["admin_subcategories"] });
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };
  const toggleActive = async (s: any) => {
    await sb.from("subcategories").update({ active: !s.active }).eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["admin_subcategories"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir subcategoria?")) return;
    const { error } = await sb.from("subcategories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["admin_subcategories"] });
  };

  return (
    <div>
      <div className="flex justify-between items-center gap-3 mb-3">
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditing(empty); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova subcategoria
        </Button>
      </div>
      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr>
            <th className="p-3">Subcategoria</th><th className="p-3">Slug</th><th className="p-3">Categoria pai</th>
            <th className="p-3">Ordem</th><th className="p-3">Menu</th><th className="p-3">Ativa</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((s: any) => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 text-muted-foreground">{s.slug}</td>
                <td className="p-3">{catMap[s.category_id] || "—"}</td>
                <td className="p-3">{s.position}</td>
                <td className="p-3">{s.show_in_menu ? "Sim" : "—"}</td>
                <td className="p-3">{s.active ? <span className="text-whatsapp text-xs font-semibold">Ativa</span> : <span className="text-muted-foreground text-xs">Inativa</span>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => toggleActive(s)}><Power className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing({ ...empty, ...s }); setOpen(true); }}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma subcategoria.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Nova"} subcategoria</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Categoria pai *</Label>
              <Select value={editing.category_id || ""} onValueChange={(v) => setEditing({ ...editing, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Nome *</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Slug</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder={editing.name && slugify(editing.name)} /></div>
            <div className="space-y-1"><Label>Descrição</Label><Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            <div className="space-y-1"><Label>Ordem</Label><Input type="number" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={editing.show_in_menu} onCheckedChange={(v) => setEditing({ ...editing, show_in_menu: v })} /><Label>Aparece no menu</Label></div>
            <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativa</Label></div>
            <Button className="w-full" onClick={save}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- TRIER MAPPINGS ----------
function TrierMappingsTab() {
  const qc = useQueryClient();
  const empty: any = {
    id: "", source_field: "nomeCategoria", match_type: "contains", match_value: "",
    case_sensitive: false, department_id: null, category_id: null, subcategory_id: null,
    priority: 100, active: true, notes: "",
  };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);

  const { data: rules = [] } = useQuery({
    queryKey: ["admin_trier_mappings"],
    queryFn: async () => (await sb.from("trier_category_mappings").select("*").order("priority")).data || [],
  });
  const { data: depts = [] } = useQuery({
    queryKey: ["admin_departments_simple"],
    queryFn: async () => (await sb.from("departments").select("id,name").order("position")).data || [],
  });
  const { data: cats = [] } = useQuery({
    queryKey: ["admin_categories_simple"],
    queryFn: async () => (await sb.from("categories").select("id,name").order("name")).data || [],
  });
  const { data: subs = [] } = useQuery({
    queryKey: ["admin_subcategories"],
    queryFn: async () => (await sb.from("subcategories").select("id,name,category_id").order("name")).data || [],
  });
  const subsFiltered = useMemo(
    () => editing.category_id ? subs.filter((s: any) => s.category_id === editing.category_id) : [],
    [subs, editing.category_id]
  );
  const deptMap = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));
  const catMap = Object.fromEntries(cats.map((c: any) => [c.id, c.name]));
  const subMap = Object.fromEntries(subs.map((s: any) => [s.id, s.name]));

  const save = async () => {
    try {
      if (!editing.match_value?.trim()) return toast.error("Valor obrigatório");
      if (!editing.department_id && !editing.category_id && !editing.subcategory_id) {
        return toast.error("Defina ao menos um destino");
      }
      const payload = { ...editing, priority: Number(editing.priority) || 100 };
      if (editing.id) {
        const { error } = await sb.from("trier_category_mappings").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await sb.from("trier_category_mappings").insert(payload);
        if (error) throw error;
      }
      toast.success("Regra salva");
      qc.invalidateQueries({ queryKey: ["admin_trier_mappings"] });
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };
  const toggleActive = async (r: any) => {
    await sb.from("trier_category_mappings").update({ active: !r.active }).eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["admin_trier_mappings"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir regra?")) return;
    const { error } = await sb.from("trier_category_mappings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["admin_trier_mappings"] });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-muted-foreground">
          Regras aplicadas <strong>sob demanda</strong> (botão na aba Diagnóstico). Nunca sobrescrevem classificação manual.
        </p>
        <Button onClick={() => { setEditing(empty); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova regra
        </Button>
      </div>
      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr>
            <th className="p-3">Prioridade</th><th className="p-3">Campo</th><th className="p-3">Condição</th>
            <th className="p-3">Valor</th><th className="p-3">Destino</th><th className="p-3">Ativa</th><th></th>
          </tr></thead>
          <tbody>
            {rules.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.priority}</td>
                <td className="p-3">{r.source_field}</td>
                <td className="p-3">{r.match_type}</td>
                <td className="p-3 font-mono text-xs">{r.match_value}</td>
                <td className="p-3 text-xs">
                  {r.department_id && <div>Dep: {deptMap[r.department_id] || "?"}</div>}
                  {r.category_id && <div>Cat: {catMap[r.category_id] || "?"}</div>}
                  {r.subcategory_id && <div>Sub: {subMap[r.subcategory_id] || "?"}</div>}
                </td>
                <td className="p-3">{r.active ? "Sim" : "—"}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => toggleActive(r)}><Power className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing({ ...empty, ...r }); setOpen(true); }}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma regra. Crie uma para começar.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Nova"} regra de mapeamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Campo Trier</Label>
                <Select value={editing.source_field} onValueChange={(v) => setEditing({ ...editing, source_field: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nomeCategoria">nomeCategoria</SelectItem>
                    <SelectItem value="nomeGrupo">nomeGrupo</SelectItem>
                    <SelectItem value="nomeDepartamento">nomeDepartamento</SelectItem>
                    <SelectItem value="productName">Nome do produto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Condição</Label>
                <Select value={editing.match_type} onValueChange={(v) => setEditing({ ...editing, match_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">igual a</SelectItem>
                    <SelectItem value="contains">contém</SelectItem>
                    <SelectItem value="starts_with">começa com</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Valor *</Label><Input value={editing.match_value} onChange={(e) => setEditing({ ...editing, match_value: e.target.value })} placeholder="GENERICOS" /></div>
            <div className="flex items-center gap-2"><Switch checked={editing.case_sensitive} onCheckedChange={(v) => setEditing({ ...editing, case_sensitive: v })} /><Label>Case sensitive</Label></div>

            <div className="border-t pt-3 space-y-3">
              <Label className="text-xs uppercase text-muted-foreground">Destino</Label>
              <div className="space-y-1">
                <Label>Departamento</Label>
                <Select value={editing.department_id || "none"} onValueChange={(v) => setEditing({ ...editing, department_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={editing.category_id || "none"} onValueChange={(v) => setEditing({ ...editing, category_id: v === "none" ? null : v, subcategory_id: null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Subcategoria</Label>
                <Select value={editing.subcategory_id || "none"} onValueChange={(v) => setEditing({ ...editing, subcategory_id: v === "none" ? null : v })} disabled={!editing.category_id}>
                  <SelectTrigger><SelectValue placeholder={editing.category_id ? "—" : "Selecione categoria"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {subsFiltered.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Prioridade</Label><Input type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} /></div>
              <div className="flex items-end gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativa</Label></div>
            </div>
            <div className="space-y-1"><Label>Notas</Label><Textarea value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            <Button className="w-full" onClick={save}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- DIAGNOSTICS ----------
function DiagnosticsTab() {
  const { data: stats } = useQuery({
    queryKey: ["taxonomy_diag"],
    queryFn: async () => {
      const [
        depts, cats, subs, prods, taxAll,
      ] = await Promise.all([
        sb.from("departments").select("id,name,active"),
        sb.from("categories").select("id,name,active,department_id"),
        sb.from("subcategories").select("id,name,active,category_id"),
        sb.from("products").select("id,active", { count: "exact", head: true }),
        sb.rpc("admin_taxonomy_rows", { _product_ids: null, _primary_only: false }),
      ]);

      const totalProducts = prods.count || 0;
      const tax = taxAll.data || [];
      const productsWithTax = new Set(tax.map((t: any) => t.product_id)).size;
      const productsWithDept = new Set(tax.filter((t: any) => t.department_id).map((t: any) => t.product_id)).size;
      const productsWithCat = new Set(tax.filter((t: any) => t.category_id).map((t: any) => t.product_id)).size;

      const catsWithDept = (cats.data || []).filter((c: any) => c.department_id).length;
      const catsWithoutDept = (cats.data || []).filter((c: any) => !c.department_id).length;

      // products per dept/cat/sub
      const productsByDept: Record<string, number> = {};
      const productsByCat: Record<string, number> = {};
      const productsBySub: Record<string, number> = {};
      tax.forEach((t: any) => {
        if (t.department_id) productsByDept[t.department_id] = (productsByDept[t.department_id] || 0) + 1;
        if (t.category_id) productsByCat[t.category_id] = (productsByCat[t.category_id] || 0) + 1;
      });
      // subcategories without products
      const subsEmpty = (subs.data || []).filter((s: any) => !productsBySub[s.id]).length;
      const catsEmpty = (cats.data || []).filter((c: any) => !productsByCat[c.id]).length;
      const deptsEmpty = (depts.data || []).filter((d: any) => !productsByDept[d.id]).length;

      return {
        totalDepts: depts.data?.length || 0,
        totalCats: cats.data?.length || 0,
        totalSubs: subs.data?.length || 0,
        totalProducts,
        productsWithoutTax: totalProducts - productsWithTax,
        productsWithoutDept: totalProducts - productsWithDept,
        productsWithoutCat: totalProducts - productsWithCat,
        productsManual: new Set(tax.filter((t: any) => t.is_manual).map((t: any) => t.product_id)).size,
        catsWithDept,
        catsWithoutDept,
        subsEmpty,
        catsEmpty,
        deptsEmpty,
      };
    },
  });

  if (!stats) return <div className="p-6 text-center text-muted-foreground">Carregando...</div>;

  const Card = ({ label, value, tone = "default" }: any) => (
    <div className={`p-4 border rounded-xl bg-card ${tone === "warn" ? "border-yellow-400" : tone === "bad" ? "border-destructive" : ""}`}>
      <div className="text-3xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Departamentos" value={stats.totalDepts} />
        <Card label="Categorias" value={stats.totalCats} />
        <Card label="Subcategorias" value={stats.totalSubs} />
        <Card label="Produtos" value={stats.totalProducts} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Produtos sem classificação" value={stats.productsWithoutTax} tone={stats.productsWithoutTax > 0 ? "warn" : "default"} />
        <Card label="Produtos sem departamento" value={stats.productsWithoutDept} tone={stats.productsWithoutDept > 0 ? "warn" : "default"} />
        <Card label="Produtos sem categoria comercial" value={stats.productsWithoutCat} tone={stats.productsWithoutCat > 0 ? "warn" : "default"} />
        <Card label="Produtos com classificação manual" value={stats.productsManual} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Categorias vinculadas a departamento" value={stats.catsWithDept} />
        <Card label="Categorias sem departamento" value={stats.catsWithoutDept} tone={stats.catsWithoutDept > 0 ? "warn" : "default"} />
        <Card label="Categorias sem produtos" value={stats.catsEmpty} />
        <Card label="Subcategorias sem produtos" value={stats.subsEmpty} />
      </div>
      <ApplyTrierMapping />
    </div>
  );
}

// ---------- APPLY TRIER MAPPING ----------
function ApplyTrierMapping() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ scanned: number; matched: number; applied: number; skipped: number } | null>(null);

  const run = async (dryRun: boolean) => {
    setRunning(true);
    setResult(null);
    try {
      // Load active rules ordered by priority
      const { data: rules } = await sb.from("trier_category_mappings").select("*").eq("active", true).order("priority");
      if (!rules || rules.length === 0) {
        toast.error("Nenhuma regra ativa. Crie regras na aba Mapeamento Trier.");
        setRunning(false);
        return;
      }

      // Load products in batches with their trier-derived fields and name
      const PAGE = 1000;
      let offset = 0;
      let scanned = 0, matched = 0, applied = 0, skipped = 0;

      while (true) {
        const { data: products, error } = await sb.from("products")
          .select("id, name, category_name, group_name, department_name")
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!products || products.length === 0) break;

        const productIds = products.map((p: any) => p.id);
        // Existing primary taxonomy rows for these products
        const { data: existingTax } = await sb.rpc("admin_taxonomy_rows", {
          _product_ids: productIds,
          _primary_only: true,
        });
        const existingMap = new Map<string, any>();
        (existingTax || []).forEach((t: any) => existingMap.set(t.product_id, t));

        const inserts: any[] = [];
        const updates: { id: string; payload: any }[] = [];

        for (const p of products) {
          scanned++;
          const existing = existingMap.get(p.id);
          if (existing?.is_manual) { skipped++; continue; }

          const fieldMap: Record<string, string> = {
            nomeCategoria: p.category_name || "",
            nomeGrupo: p.group_name || "",
            nomeDepartamento: p.department_name || "",
            productName: p.name || "",
          };

          let hit: any = null;
          for (const r of rules) {
            const raw = fieldMap[r.source_field] || "";
            const a = r.case_sensitive ? raw : raw.toLowerCase();
            const b = r.case_sensitive ? r.match_value : r.match_value.toLowerCase();
            let ok = false;
            if (r.match_type === "equals") ok = a === b;
            else if (r.match_type === "contains") ok = a.includes(b);
            else if (r.match_type === "starts_with") ok = a.startsWith(b);
            if (ok) { hit = r; break; }
          }
          if (!hit) continue;
          matched++;

          const payload = {
            department_id: hit.department_id,
            category_id: hit.category_id,
            subcategory_id: hit.subcategory_id,
            is_manual: false,
            source: "trier_map",
          };

          if (dryRun) { applied++; continue; }
          if (existing) updates.push({ id: existing.id, payload });
          else inserts.push({ product_id: p.id, is_primary: true, ...payload });
          applied++;
        }

        if (!dryRun) {
          if (inserts.length > 0) {
            const { error: ie } = await sb.from("product_taxonomy").insert(inserts);
            if (ie) throw ie;
          }
          for (const u of updates) {
            const { error: ue } = await sb.from("product_taxonomy").update(u.payload).eq("id", u.id);
            if (ue) throw ue;
          }
        }

        if (products.length < PAGE) break;
        offset += PAGE;
      }

      setResult({ scanned, matched, applied, skipped });
      toast.success(dryRun ? `Simulação: ${applied} produtos seriam classificados` : `${applied} produtos classificados`);
      if (!dryRun) qc.invalidateQueries({ queryKey: ["taxonomy_diag"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-4 bg-secondary/40 rounded-xl space-y-3">
      <div>
        <strong className="text-sm">Aplicar mapeamento Trier</strong>
        <p className="text-xs text-muted-foreground">
          Executa todas as regras ativas em produtos que <strong>não</strong> têm classificação manual.
          Produtos com classificação manual nunca são sobrescritos.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={running} onClick={() => run(true)}>Simular (dry-run)</Button>
        <Button disabled={running} onClick={() => run(false)}>Aplicar agora</Button>
      </div>
      {result && (
        <div className="text-xs text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t">
          <div>Analisados: <strong>{result.scanned}</strong></div>
          <div>Com regra correspondente: <strong>{result.matched}</strong></div>
          <div>Classificados: <strong className="text-whatsapp">{result.applied}</strong></div>
          <div>Pulados (manuais): <strong>{result.skipped}</strong></div>
        </div>
      )}
    </div>
  );
}

// ---------- ROOT PAGE ----------
export default function AdminTaxonomy() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Taxonomia comercial</h1>
        <p className="text-sm text-muted-foreground">Organize departamentos, categorias e subcategorias do catálogo.</p>
      </div>
      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">Departamentos</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="subcategories">Subcategorias</TabsTrigger>
          <TabsTrigger value="trier">Mapeamento Trier</TabsTrigger>
          <TabsTrigger value="diag">Diagnóstico</TabsTrigger>
        </TabsList>
        <TabsContent value="departments" className="mt-6"><DepartmentsTab /></TabsContent>
        <TabsContent value="categories" className="mt-6"><CategoriesTab /></TabsContent>
        <TabsContent value="subcategories" className="mt-6"><SubcategoriesTab /></TabsContent>
        <TabsContent value="trier" className="mt-6"><TrierMappingsTab /></TabsContent>
        <TabsContent value="diag" className="mt-6"><DiagnosticsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
