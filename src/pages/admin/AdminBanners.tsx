import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, ArrowUp, ArrowDown, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const PLACEMENTS = [
  { v: "hero", l: "Hero principal" },
  { v: "mosaico", l: "Mosaico" },
  { v: "secundario", l: "Banner secundário" },
  { v: "receita", l: "Receita" },
  { v: "rodape", l: "Rodapé" },
];

const empty: any = {
  id: "", title: "", subtitle: "", cta_text: "", image_url: "", mobile_image_url: "",
  link: "", position: 0, placement: "hero", active: true, start_date: null, end_date: null,
};

export default function AdminBanners() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);

  const { data } = useQuery({
    queryKey: ["admin_banners"],
    queryFn: async () => (await supabase.from("banners").select("*").order("placement").order("position")).data || [],
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
      if (file) image_url = await upload(file);
      if (mobileFile) mobile_image_url = await upload(mobileFile);
      const payload = {
        ...editing, image_url, mobile_image_url, position: Number(editing.position),
        start_date: editing.start_date || null, end_date: editing.end_date || null,
      };
      if (editing.id) {
        const { error } = await supabase.from("banners").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        delete (payload as any).id;
        const { error } = await supabase.from("banners").insert(payload);
        if (error) throw error;
      }
      toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["admin_banners"] }); setOpen(false); setFile(null); setMobileFile(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const reorder = async (b: any, delta: number) => {
    await supabase.from("banners").update({ position: Math.max(0, (b.position || 0) + delta) }).eq("id", b.id);
    qc.invalidateQueries({ queryKey: ["admin_banners"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir banner?")) return;
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["admin_banners"] }); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold">Banners</h1>
        <Button onClick={() => { setEditing(empty); setFile(null); setMobileFile(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Novo</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((b: any) => (
          <div key={b.id} className="bg-card border rounded-xl p-4 shadow-card">
            {b.image_url && <img src={b.image_url} alt={b.title} className="w-full h-32 object-cover rounded-md mb-3" />}
            <div className="text-[10px] uppercase font-bold text-primary mb-1">{PLACEMENTS.find((p) => p.v === b.placement)?.l || b.placement}</div>
            <div className="font-bold">{b.title}</div>
            <div className="text-xs text-muted-foreground">{b.subtitle}</div>
            <div className="text-xs mt-1">Ordem: {b.position} · {b.active ? "Ativo" : "Inativo"}</div>
            <div className="flex gap-1 mt-3 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => { setEditing({ ...empty, ...b }); setFile(null); setMobileFile(null); setOpen(true); }}><Edit className="h-3 w-3 mr-1" /> Editar</Button>
              <Button size="icon" variant="ghost" onClick={() => reorder(b, -1)}><ArrowUp className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" onClick={() => reorder(b, 1)}><ArrowDown className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Novo"} banner</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Título</Label><Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
            <div className="space-y-1"><Label>Subtítulo</Label><Input value={editing.subtitle || ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} /></div>
            <div className="space-y-1"><Label>Texto do botão</Label><Input value={editing.cta_text || ""} onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })} /></div>
            <div className="space-y-1"><Label>Link do botão</Label><Input value={editing.link || ""} onChange={(e) => setEditing({ ...editing, link: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Posição</Label>
              <Select value={editing.placement} onValueChange={(v) => setEditing({ ...editing, placement: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLACEMENTS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Início</Label><Input type="datetime-local" value={editing.start_date?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, start_date: e.target.value || null })} /></div>
              <div className="space-y-1"><Label>Fim</Label><Input type="datetime-local" value={editing.end_date?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, end_date: e.target.value || null })} /></div>
            </div>
            <div className="space-y-1"><Label>Ordem</Label><Input type="number" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
            <Button className="w-full" onClick={save}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
