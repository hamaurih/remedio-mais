import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, ArrowUp, ArrowDown, Plus, Save, Star } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Row = {
  id: string;
  name: string;
  image_url: string | null;
  manufacturer: string | null;
  price: number;
  bestseller_rank: number | null;
};

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

export function BestsellersReorderDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [items, setItems] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,image_url,manufacturer,price,bestseller_rank")
        .not("bestseller_rank", "is", null)
        .order("bestseller_rank", { ascending: true });
      setItems((data || []) as Row[]);
      setDirty(false);
    })();
  }, [open]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (search.length < 2) { setResults([]); return; }
      const { data } = await supabase
        .from("products")
        .select("id,name,image_url,manufacturer,price,bestseller_rank")
        .eq("active", true)
        .ilike("name", `%${search}%`)
        .limit(10);
      setResults(((data || []) as Row[]).filter((r) => !items.find((i) => i.id === r.id)));
    }, 250);
    return () => clearTimeout(t);
  }, [search, items]);

  const add = (r: Row) => { setItems([...items, r]); setSearch(""); setResults([]); setDirty(true); };
  const remove = (id: string) => { setItems(items.filter((i) => i.id !== id)); setDirty(true); };
  const move = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setItems(next); setDirty(true);
  };

  const save = async () => {
    setLoading(true);
    try {
      // Reset all current ranks to null, then set in order
      await supabase.from("products").update({ bestseller_rank: null }).not("bestseller_rank", "is", null);
      // Update each
      for (let i = 0; i < items.length; i++) {
        await supabase.from("products").update({ bestseller_rank: (i + 1) * 10 }).eq("id", items[i].id);
      }
      toast.success(`${items.length} produto(s) na vitrine "Mais Vendidos"`);
      qc.invalidateQueries({ queryKey: ["admin_products"] });
      qc.invalidateQueries({ queryKey: ["shelf_bestsellers"] });
      setDirty(false);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" /> Organizar Mais Vendidos
          </DialogTitle>
          <DialogDescription>
            Defina manualmente quais produtos aparecem na vitrine "Mais Vendidos" da home e em qual ordem (1º no topo).
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
          <Input className="pl-8" placeholder="Adicionar produto..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {results.map((r) => (
                <button key={r.id} type="button" onClick={() => add(r)} className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left text-sm">
                  {r.image_url && <img src={r.image_url} alt="" className="h-8 w-8 object-contain shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{r.name}</div>
                    {r.manufacturer && <div className="text-xs text-muted-foreground truncate">{r.manufacturer}</div>}
                  </div>
                  <Plus className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border rounded-lg divide-y max-h-[50vh] overflow-y-auto">
          {items.length === 0 && (
            <div className="p-8 text-sm text-muted-foreground text-center">
              Nenhum produto na vitrine. Use a busca acima para adicionar.
            </div>
          )}
          {items.map((it, idx) => (
            <div key={it.id} className="flex items-center gap-2 p-2">
              <span className="text-sm font-extrabold w-8 text-center text-primary">{idx + 1}º</span>
              {it.image_url ? (
                <img src={it.image_url} alt="" className="h-10 w-10 object-contain border rounded" />
              ) : (
                <div className="h-10 w-10 bg-secondary rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{it.name}</div>
                {it.manufacturer && <div className="text-[11px] text-muted-foreground truncate">{it.manufacturer}</div>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}><ArrowDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(it.id)}><X className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button onClick={save} disabled={!dirty || loading} className="flex-1">
            <Save className="h-4 w-4 mr-2" /> {loading ? "Salvando…" : "Salvar vitrine"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
