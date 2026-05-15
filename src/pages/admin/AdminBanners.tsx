import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

const empty = { id: "", title: "", subtitle: "", image_url: "", link: "", position: 0, active: true };

export default function AdminBanners() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);

  const { data } = useQuery({
    queryKey: ["admin_banners"],
    queryFn: async () => (await supabase.from("banners").select("*").order("position")).data || [],
  });

  const save = async () => {
    try {
      let image_url = editing.image_url;
      if (file) {
        const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error: ue } = await supabase.storage.from("banners").upload(path, file);
        if (ue) throw ue;
        image_url = supabase.storage.from("banners").getPublicUrl(path).data.publicUrl;
      }
      const payload = { ...editing, image_url, position: Number(editing.position) };
      if (editing.id) {
        const { error } = await supabase.from("banners").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        delete (payload as any).id;
        const { error } = await supabase.from("banners").insert(payload);
        if (error) throw error;
      }
      toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["admin_banners"] }); setOpen(false); setFile(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir?")) return;
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["admin_banners"] }); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold">Banners</h1>
        <Button onClick={() => { setEditing(empty); setFile(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Novo</Button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {data?.map((b: any) => (
          <div key={b.id} className="bg-card border rounded-xl p-4 shadow-card">
            {b.image_url && <img src={b.image_url} alt={b.title} className="w-full h-32 object-cover rounded-md mb-3" />}
            <div className="font-bold">{b.title}</div>
            <div className="text-xs text-muted-foreground">{b.subtitle}</div>
            <div className="text-xs mt-1">Posição: {b.position} · {b.active ? "Ativo" : "Inativo"}</div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => { setEditing(b); setFile(null); setOpen(true); }}><Edit className="h-3 w-3 mr-1" /> Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Novo"} banner</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Título</Label><Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
            <div className="space-y-1"><Label>Subtítulo</Label><Input value={editing.subtitle || ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} /></div>
            <div className="space-y-1"><Label>Link</Label><Input value={editing.link || ""} onChange={(e) => setEditing({ ...editing, link: e.target.value })} /></div>
            <div className="space-y-1"><Label>Imagem</Label><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
            <div className="space-y-1"><Label>Posição</Label><Input type="number" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
            <Button className="w-full" onClick={save}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
