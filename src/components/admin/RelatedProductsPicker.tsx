import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, GripVertical, ArrowUp, ArrowDown, Save } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  image_url: string | null;
  manufacturer: string | null;
  sku: string | null;
  barcode: string | null;
  trier_barcode: string | null;
};

interface Props {
  productId: string;
}

const SELECT = "id,name,image_url,manufacturer,sku,barcode,trier_barcode";

export function RelatedProductsPicker({ productId }: Props) {
  const [items, setItems] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);

  // load current
  useEffect(() => {
    (async () => {
      const { data: links } = await supabase
        .from("product_related")
        .select("related_product_id, position")
        .eq("product_id", productId)
        .order("position", { ascending: true });
      const ids = (links || []).map((l: any) => l.related_product_id);
      if (ids.length === 0) { setItems([]); return; }
      const { data: prods } = await (supabase as any)
        .from("products")
        .select(SELECT)
        .in("id", ids);
      const byId = new Map((prods || []).map((p: any) => [p.id, p]));
      setItems(ids.map((id) => byId.get(id)).filter(Boolean) as Row[]);
    })();
  }, [productId]);

  // search
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
        .neq("id", productId)
        .limit(10);
      setResults((data || []) as Row[]);
    }, 250);
    return () => clearTimeout(t);
  }, [search, productId]);

  const add = (r: Row) => {
    if (items.find((i) => i.id === r.id)) return;
    setItems([...items, r]);
    setSearch(""); setResults([]); setDirty(true);
  };
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
      await supabase.from("product_related").delete().eq("product_id", productId);
      if (items.length > 0) {
        const rows = items.map((it, idx) => ({
          product_id: productId,
          related_product_id: it.id,
          position: (idx + 1) * 10,
        }));
        const { error } = await supabase.from("product_related").insert(rows);
        if (error) throw error;
      }
      toast.success("Relacionados salvos");
      setDirty(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Defina manualmente os produtos relacionados que aparecerão na página deste produto. Se nenhum for definido, o sistema sugere automaticamente por princípio ativo e categoria.
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar por nome, SKU ou código de barras..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
            {results.map((r) => (
              <button key={r.id} type="button" onClick={() => add(r)} className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left text-sm">
                {r.image_url && <img src={r.image_url} alt="" className="h-8 w-8 object-contain shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[r.manufacturer, r.barcode || r.sku].filter(Boolean).join(" • ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border rounded-lg divide-y">
        {items.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Nenhum produto manual definido. (Modo automático ativo)
          </div>
        )}
        {items.map((it, idx) => (
          <div key={it.id} className="flex items-center gap-2 p-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-bold w-6 text-muted-foreground">{idx + 1}</span>
            {it.image_url && <img src={it.image_url} alt="" className="h-10 w-10 object-contain border rounded" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{it.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {[it.manufacturer, it.barcode || it.sku].filter(Boolean).join(" • ")}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}><ArrowDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => remove(it.id)}><X className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={!dirty || loading} className="w-full">
        <Save className="h-4 w-4 mr-2" /> {loading ? "Salvando…" : "Salvar relacionados"}
      </Button>
    </div>
  );
}
