import { useEffect, useMemo, useState } from "react";
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
import { Plus, Trash2, Search, X } from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  starts_at: string | null;
  ends_at: string | null;
  banner_image_url: string | null;
  banner_link: string | null;
  cta_text: string | null;
  visual_style: string;
  position: number;
  active: boolean;
  published: boolean;
};

const STYLES = [
  { value: "light", label: "Claro" },
  { value: "soft-pink", label: "Rosa suave" },
  { value: "soft-blue", label: "Azul suave" },
  { value: "soft-mint", label: "Verde suave" },
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminCampaigns() {
  const [list, setList] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string; image_url: string | null }[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; image_url: string | null }[]>([]);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("campaigns")
      .select("*")
      .order("position");
    setList((data ?? []) as Campaign[]);
  };

  useEffect(() => {
    load();
  }, []);

  const loadProducts = async (cid: string) => {
    const { data } = await (supabase as any)
      .from("campaign_products")
      .select("position, product_id, products:product_id(id,name,image_url)")
      .eq("campaign_id", cid)
      .order("position");
    setProducts(((data ?? []) as any[]).map((r) => r.products).filter(Boolean));
  };

  const startEdit = async (c: Campaign | null) => {
    setEditing(c);
    setProducts([]);
    setSearch("");
    setSearchResults([]);
    if (c) await loadProducts(c.id);
  };

  const createCampaign = async () => {
    const name = "Nova campanha";
    const { data, error } = await (supabase as any)
      .from("campaigns")
      .insert({
        name,
        slug: `nova-${Date.now()}`,
        visual_style: "soft-pink",
        position: (list[list.length - 1]?.position ?? 0) + 1,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    await load();
    await startEdit(data as Campaign);
  };

  const save = async () => {
    if (!editing) return;
    const { id, ...rest } = editing;
    const payload = {
      ...rest,
      slug: rest.slug || slugify(rest.name),
      position: Number(rest.position) || 0,
      starts_at: rest.starts_at || null,
      ends_at: rest.ends_at || null,
    };
    const { error } = await (supabase as any)
      .from("campaigns")
      .update(payload)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campanha salva");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir campanha?")) return;
    const { error } = await (supabase as any).from("campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setEditing(null);
    load();
  };

  // Product search
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search || search.length < 2) {
        setSearchResults([]);
        return;
      }
      const { data } = await supabase
        .from("products")
        .select("id,name,image_url")
        .eq("active", true)
        .ilike("name", `%${search}%`)
        .limit(10);
      setSearchResults((data ?? []) as any[]);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const addProduct = async (productId: string, name: string, image_url: string | null) => {
    if (!editing) return;
    if (products.find((p) => p.id === productId)) return;
    const { error } = await (supabase as any).from("campaign_products").insert({
      campaign_id: editing.id,
      product_id: productId,
      position: products.length,
    });
    if (error) return toast.error(error.message);
    setProducts((p) => [...p, { id: productId, name, image_url }]);
    setSearch("");
    setSearchResults([]);
  };

  const removeProduct = async (productId: string) => {
    if (!editing) return;
    const { error } = await (supabase as any)
      .from("campaign_products")
      .delete()
      .eq("campaign_id", editing.id)
      .eq("product_id", productId);
    if (error) return toast.error(error.message);
    setProducts((p) => p.filter((x) => x.id !== productId));
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Crie campanhas comerciais (Black Friday, Dia dos Pais, Aniversário) e vincule produtos.
          </p>
        </div>
        <Button onClick={createCampaign}>
          <Plus className="h-4 w-4 mr-2" /> Nova campanha
        </Button>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <aside className="space-y-1 bg-card border rounded-xl p-2 h-fit">
          {list.length === 0 && (
            <div className="text-sm text-muted-foreground p-3">Nenhuma campanha.</div>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => startEdit(c)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                editing?.id === c.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              <div className="font-bold truncate">{c.name}</div>
              <div className={`text-xs ${editing?.id === c.id ? "opacity-80" : "text-muted-foreground"}`}>
                {c.active ? "Ativa" : "Inativa"} · {c.published ? "Publicada" : "Rascunho"}
              </div>
            </button>
          ))}
        </aside>

        <section className="bg-card border rounded-xl p-4">
          {!editing ? (
            <div className="text-sm text-muted-foreground py-10 text-center">
              Selecione uma campanha à esquerda ou crie uma nova.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
                <Label>Slug</Label>
                <Input
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
                />
                <Label>Subtítulo</Label>
                <Textarea
                  rows={2}
                  value={editing.subtitle ?? ""}
                  onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Início</Label>
                    <Input
                      type="datetime-local"
                      value={editing.starts_at?.slice(0, 16) ?? ""}
                      onChange={(e) =>
                        setEditing({ ...editing, starts_at: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <Label>Fim</Label>
                    <Input
                      type="datetime-local"
                      value={editing.ends_at?.slice(0, 16) ?? ""}
                      onChange={(e) =>
                        setEditing({ ...editing, ends_at: e.target.value || null })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Banner (URL da imagem)</Label>
                <Input
                  value={editing.banner_image_url ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, banner_image_url: e.target.value })
                  }
                />
                <Label>Link do banner</Label>
                <Input
                  value={editing.banner_link ?? ""}
                  onChange={(e) => setEditing({ ...editing, banner_link: e.target.value })}
                />
                <Label>Texto do botão</Label>
                <Input
                  value={editing.cta_text ?? ""}
                  onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Estilo</Label>
                    <Select
                      value={editing.visual_style}
                      onValueChange={(v) => setEditing({ ...editing, visual_style: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STYLES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Posição</Label>
                    <Input
                      type="number"
                      value={editing.position}
                      onChange={(e) =>
                        setEditing({ ...editing, position: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editing.active}
                      onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                    />
                    <span className="text-sm">Ativa</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editing.published}
                      onCheckedChange={(v) => setEditing({ ...editing, published: v })}
                    />
                    <span className="text-sm">Publicada</span>
                  </div>
                </div>
              </div>

              {/* Produtos vinculados */}
              <div className="md:col-span-2 border-t pt-4">
                <Label className="text-base font-bold">Produtos vinculados</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto pelo nome…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
                      {searchResults.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => addProduct(r.id, r.name, r.image_url)}
                          className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left text-sm"
                        >
                          {r.image_url && (
                            <img src={r.image_url} alt="" className="h-8 w-8 object-contain" />
                          )}
                          <span className="truncate">{r.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 border rounded-md p-2 bg-background"
                    >
                      {p.image_url && (
                        <img src={p.image_url} alt="" className="h-10 w-10 object-contain" />
                      )}
                      <span className="text-xs flex-1 truncate">{p.name}</span>
                      <button
                        onClick={() => removeProduct(p.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {products.length === 0 && (
                    <div className="col-span-full text-xs text-muted-foreground">
                      Nenhum produto vinculado.
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 flex items-center justify-between border-t pt-4">
                <Button variant="outline" onClick={() => remove(editing.id)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                </Button>
                <Button onClick={save}>Salvar</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
