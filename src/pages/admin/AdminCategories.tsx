import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Power } from "lucide-react";
import { toast } from "sonner";

const empty: any = {
  id: "", name: "", slug: "", description: "", icon: "", image_url: "",
  position: 0, active: true, show_in_menu: true, show_on_home: true,
  link: "", band_color: "#E11D2E", macro_group: "",
};

const MACRO_GROUPS = [
  "Medicamentos e Saúde",
  "Dermo e Beleza",
  "Higiene Pessoal",
  "Mamães e Bebês",
  "Vitaminas e Suplementos",
  "Conveniência",
  "Primeiros Socorros",
];


const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function AdminCategories() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);

  const { data } = useQuery({
    queryKey: ["admin_cats"],
    queryFn: async () => (await supabase.from("categories").select("*").order("position")).data || [],
  });

  const save = async () => {
    try {
      if (!editing.name?.trim()) { toast.error("Nome obrigatório"); return; }
      const slug = editing.slug || slugify(editing.name);
      let image_url = editing.image_url;
      if (file) {
        const path = `cat-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error: ue } = await supabase.storage.from("products").upload(path, file);
        if (ue) throw ue;
        image_url = supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
      }
      const payload = { ...editing, slug, image_url, position: Number(editing.position) };
      if (editing.id) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        delete (payload as any).id;
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      }
      toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["admin_cats"] }); setOpen(false); setFile(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleActive = async (c: any) => {
    await supabase.from("categories").update({ active: !c.active }).eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["admin_cats"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir categoria?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["admin_cats"] }); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold">Categorias</h1>
        <Button onClick={() => { setEditing(empty); setFile(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nova</Button>
      </div>
      <div className="bg-card border rounded-xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr>
            <th className="p-3">Imagem</th><th className="p-3">Nome</th><th className="p-3">Slug</th>
            <th className="p-3">Ordem</th><th className="p-3">Menu</th><th className="p-3">Home</th><th className="p-3">Ativa</th><th></th>
          </tr></thead>
          <tbody>
            {data?.map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.image_url ? <img src={c.image_url} alt="" className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 bg-secondary rounded" />}</td>
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-muted-foreground">{c.slug}</td>
                <td className="p-3">{c.position}</td>
                <td className="p-3">{c.show_in_menu ? "Sim" : "—"}</td>
                <td className="p-3">{c.show_on_home ? "Sim" : "—"}</td>
                <td className="p-3">{c.active ? <span className="text-whatsapp text-xs font-semibold">Ativa</span> : <span className="text-muted-foreground text-xs">Inativa</span>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => toggleActive(c)}><Power className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing({ ...empty, ...c }); setFile(null); setOpen(true); }}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Nova"} categoria</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome *</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Slug (auto)</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder={editing.name && slugify(editing.name)} /></div>
            <div className="space-y-1"><Label>Descrição</Label><Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Ícone (lucide)</Label><Input value={editing.icon || ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} placeholder="Pill, Heart..." /></div>
              <div className="space-y-1"><Label>Ordem</Label><Input type="number" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></div>
            </div>
            <div className="space-y-1">
              <Label>Imagem da categoria</Label>
              {editing.image_url && <img src={editing.image_url} alt="" className="w-24 h-24 object-cover rounded mb-2" />}
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-1"><Label>Link customizado (opcional)</Label><Input value={editing.link || ""} onChange={(e) => setEditing({ ...editing, link: e.target.value })} placeholder={`/categoria/${editing.slug || "slug"}`} /></div>
            <div className="space-y-1">
              <Label>Cor da faixa inferior</Label>
              <div className="flex items-center gap-2">
                <Input type="color" value={editing.band_color || "#E11D2E"} onChange={(e) => setEditing({ ...editing, band_color: e.target.value })} className="w-16 h-10 p-1" />
                <Input value={editing.band_color || ""} onChange={(e) => setEditing({ ...editing, band_color: e.target.value })} placeholder="#E11D2E" />
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={editing.show_in_menu} onCheckedChange={(v) => setEditing({ ...editing, show_in_menu: v })} /><Label>Aparece no menu</Label></div>
            <div className="flex items-center gap-2"><Switch checked={editing.show_on_home} onCheckedChange={(v) => setEditing({ ...editing, show_on_home: v })} /><Label>Aparece no carrossel da home</Label></div>

            <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativa</Label></div>
            <Button className="w-full" onClick={save}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
