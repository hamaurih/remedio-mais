import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/store";

const SHELVES = [
  { slug: "ofertas-da-semana", label: "Ofertas da Semana" },
  { slug: "mais-vendidos", label: "Mais Vendidos" },
  { slug: "medicamentos-populares", label: "Medicamentos Populares" },
  { slug: "higiene-e-beleza", label: "Higiene e Beleza" },
  { slug: "mamaes-e-bebes", label: "Mamães e Bebês" },
];

const empty = {
  id: "", name: "", slug: "", category_id: "", description: "", price: 0, promo_price: null as number | null,
  image_url: "", manufacturer: "", active_ingredient: "", stock: 0, featured: false, on_sale: false,
  requires_prescription: false, controlled: false, tarja: "", active: true, shelves: [] as string[],
};

export default function AdminProducts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(empty);
  const [imgFile, setImgFile] = useState<File | null>(null);

  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => (await supabase.from("products").select("*, categories(name)").order("created_at", { ascending: false })).data || [],
  });
  const { data: cats } = useQuery({
    queryKey: ["admin_cats_list"],
    queryFn: async () => (await supabase.from("categories").select("*").order("position")).data || [],
  });

  const openNew = () => { setEditing(empty); setImgFile(null); setOpen(true); };
  const openEdit = (p: any) => { setEditing({ ...p, category_id: p.category_id || "" }); setImgFile(null); setOpen(true); };

  const save = async () => {
    try {
      const slug = editing.slug || editing.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      let image_url = editing.image_url;
      if (imgFile) {
        const path = `${Date.now()}-${imgFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error: ue } = await supabase.storage.from("products").upload(path, imgFile);
        if (ue) throw ue;
        image_url = supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
      }
      const payload = { ...editing, slug, image_url, category_id: editing.category_id || null,
        price: Number(editing.price), promo_price: editing.promo_price ? Number(editing.promo_price) : null, stock: Number(editing.stock) };
      delete (payload as any).categories;
      if (editing.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        delete (payload as any).id;
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
      toast.success("Produto salvo");
      qc.invalidateQueries({ queryKey: ["admin_products"] });
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["admin_products"] }); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold">Produtos</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo</Button>
      </div>

      <div className="bg-card border rounded-xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr><th className="p-3">Nome</th><th className="p-3">Categoria</th><th className="p-3">Preço</th><th className="p-3">Estoque</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {products?.map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-muted-foreground">{p.categories?.name || "—"}</td>
                <td className="p-3">{formatBRL(p.promo_price ?? p.price)}</td>
                <td className="p-3">{p.stock}</td>
                <td className="p-3">{p.active ? <span className="text-whatsapp text-xs font-semibold">Ativo</span> : <span className="text-muted-foreground text-xs">Inativo</span>}</td>
                <td className="p-3 text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Slug (opcional)</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={editing.category_id} onValueChange={(v) => setEditing({ ...editing, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{cats?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Preço (R$)</Label><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></div>
            <div className="space-y-1"><Label>Preço promocional</Label><Input type="number" step="0.01" value={editing.promo_price ?? ""} onChange={(e) => setEditing({ ...editing, promo_price: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Fabricante</Label><Input value={editing.manufacturer || ""} onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })} /></div>
            <div className="space-y-1"><Label>Princípio ativo</Label><Input value={editing.active_ingredient || ""} onChange={(e) => setEditing({ ...editing, active_ingredient: e.target.value })} /></div>
            <div className="space-y-1"><Label>Estoque</Label><Input type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} /></div>
            <div className="space-y-1"><Label>Tarja</Label><Input value={editing.tarja || ""} onChange={(e) => setEditing({ ...editing, tarja: e.target.value })} placeholder="Vermelha, Preta..." /></div>
            <div className="col-span-2 space-y-1"><Label>Imagem (upload)</Label><Input type="file" accept="image/*" onChange={(e) => setImgFile(e.target.files?.[0] || null)} /></div>
            <div className="col-span-2 space-y-1"><Label>Descrição</Label><Textarea rows={3} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
            <div className="flex items-center gap-2"><Switch checked={editing.featured} onCheckedChange={(v) => setEditing({ ...editing, featured: v })} /><Label>Destaque</Label></div>
            <div className="flex items-center gap-2"><Switch checked={editing.on_sale} onCheckedChange={(v) => setEditing({ ...editing, on_sale: v })} /><Label>Em promoção</Label></div>
            <div className="flex items-center gap-2"><Switch checked={editing.requires_prescription} onCheckedChange={(v) => setEditing({ ...editing, requires_prescription: v })} /><Label>Exige receita</Label></div>
            <div className="flex items-center gap-2"><Switch checked={editing.controlled} onCheckedChange={(v) => setEditing({ ...editing, controlled: v })} /><Label>Controlado</Label></div>
          </div>
          <Button className="w-full" onClick={save}>Salvar</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
