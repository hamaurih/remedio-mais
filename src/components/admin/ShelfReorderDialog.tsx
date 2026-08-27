import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, ArrowUp, ArrowDown, Plus, Save, LayoutList } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Row = {
  id: string;
  name: string;
  image_url: string | null;
  manufacturer: string | null;
  price: number;
  stock: number | null;
  sku: string | null;
  barcode: string | null;
  trier_barcode: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  shelfKey: string;
  shelfTitle: string;
}

const SELECT = "id,name,image_url,manufacturer,price,stock,sku,barcode,trier_barcode";

export function ShelfReorderDialog({ open, onOpenChange, shelfKey, shelfTitle }: Props) {
  const qc = useQueryClient();
  const [items, setItems] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("home_shelf_items")
        .select(`position, products:product_id(${SELECT})`)
        .eq("shelf_key", shelfKey)
        .order("position");
      setItems(((data || []) as any[]).map((r) => r.products).filter(Boolean) as Row[]);
      setSearch("");
      setResults([]);
      setDirty(false);
    })();
  }, [open, shelfKey]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const clean = search.trim().replace(/[%_]/g, "");
      if (clean.length < 2) { setResults([]); return; }
      const term = `%${clean}%`;
      const { data } = await (supabase as any)
        .from("products")
        .select(SELECT)
        .eq("active", true)
        .or([
          `name.ilike.${term}`,
          `manufacturer.ilike.${term}`,
          `sku.ilike.${term}`,
          `barcode.ilike.${term}`,
          `trier_barcode.ilike.${term}`,
        ].join(","))
        .limit(10);
      setResults(((data || []) as Row[]).filter((r) => !items.find((i) => i.id === r.id)));
    }, 250);
    return () => clearTimeout(t);
  }, [search, items]);

  const add = (r: Row) => { setItems([...items, r]); setSearch(""); setResults([]); setDirty(true); };
  const remove = (id: string) => { setItems(items.filter((i) => i.id !== id)); setDirty(true); };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
    setDirty(true);
  };

  const save = async () => {
    setLoading(true);
    try {
      const del = await (supabase as any).from("home_shelf_items").delete().eq("shelf_key", shelfKey);
      if (del.error) throw del.error;
      if (items.length > 0) {
        const ins = await (supabase as any).from("home_shelf_items").insert(
          items.map((it, i) => ({ shelf_key: shelfKey, product_id: it.id, position: (i + 1) * 10 })),
        );
        if (ins.error) throw ins.error;
      }
      toast.success(`${items.length} produto(s) na vitrine "${shelfTitle}"`);
      qc.invalidateQueries({ queryKey: ["home_shelf_items"] });
      qc.invalidateQueries();
      setDirty(false);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar vitrine");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutList className="h-5 w-5 text-primary" /> Organizar: {shelfTitle}
          </DialogTitle>
          <DialogDescription>
            Escolha quais produtos aparecem nesta vitrine da home e em qual ordem (1º aparece primeiro).
            Se a lista ficar vazia, o site volta a preencher a vitrine automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome, SKU ou código de barras..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {results.map((r) => (
                <button key={r.id} type="button" onClick={() => add(r)} className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left text-sm">
                  {r.image_url && <img src={r.image_url} alt="" className="h-8 w-8 object-contain shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[r.manufacturer, r.barcode || r.sku].filter(Boolean).join(" • ")}
                    </div>
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
              Vitrine automática. Adicione produtos acima para definir a ordem manualmente.
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
                <div className="text-[11px] text-muted-foreground truncate">
                  {it.manufacturer ? `${it.manufacturer} · ` : ""}Estoque: {it.stock ?? 0}
                  {(it.stock ?? 0) <= 0 && <span className="text-destructive font-semibold"> (não aparece no site)</span>}
                </div>
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
