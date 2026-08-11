import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Barcode, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PosProduct, brl, hasValidPromo, posSearchProducts, productImage, unitPrice } from "@/lib/pos";

type Props = {
  onAdd: (p: PosProduct, qty: number) => void;
  focusSignal: number;
};

export function PosProductPanel({ onAdd, focusSignal }: Props) {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PosProduct[]>([]);
  const [selected, setSelected] = useState<PosProduct | null>(null);
  const [qty, setQty] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  async function runSearch(value: string) {
    const q = value.trim();
    if (!q) return;
    setLoading(true);
    try {
      const rows = await posSearchProducts(q);
      setResults(rows);
      if (rows.length === 1) {
        setSelected(rows[0]);
        setQty(1);
      } else if (rows.length === 0) {
        setSelected(null);
        toast.error("Produto não encontrado");
      } else {
        setSelected(null);
      }
    } catch (e: any) {
      toast.error(e.message || "Falha na busca");
    } finally {
      setLoading(false);
      setTerm("");
      inputRef.current?.focus();
    }
  }

  function add(p: PosProduct, q = qty) {
    const stock = Number(p.stock ?? 0);
    if (stock <= 0) {
      toast.error("Produto sem estoque — venda bloqueada");
      return;
    }
    if (unitPrice(p) <= 0) {
      toast.error("Produto sem preço válido");
      return;
    }
    onAdd(p, Math.max(1, q));
    setQty(1);
    inputRef.current?.focus();
  }

  const promo = selected ? hasValidPromo(selected) : false;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <Barcode className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch(term);
              }
            }}
            placeholder="Bipe o código de barras ou digite EAN / código Trier / SKU / nome e pressione Enter"
            className="h-12 text-base"
            autoComplete="off"
            aria-label="Busca de produto no PDV"
          />
          <Button className="h-12" onClick={() => void runSearch(term)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </Card>

      {selected && (
        <Card className="p-4">
          <div className="flex gap-4">
            <img
              src={productImage(selected)}
              alt={`Foto do produto ${selected.name}`}
              className="h-32 w-32 rounded-lg object-contain bg-muted shrink-0"
              loading="eager"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-bold leading-tight">{selected.name}</div>
              <div className="text-sm text-muted-foreground">{selected.manufacturer || "Fabricante não informado"}</div>
              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                <Badge variant="outline">Trier: {selected.trier_product_id || "—"}</Badge>
                <Badge variant="outline">EAN: {selected.barcode || "—"}</Badge>
                <Badge variant="outline">SKU: {selected.sku || "—"}</Badge>
                <Badge variant={Number(selected.stock ?? 0) > 0 ? "secondary" : "destructive"}>
                  Estoque: {Number(selected.stock ?? 0)}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                {promo ? (
                  <>
                    <span className="text-sm line-through text-muted-foreground">{brl(Number(selected.price))}</span>
                    <span className="text-2xl font-extrabold text-primary">{brl(Number(selected.promo_price))}</span>
                    <Badge>Economia {brl(Number(selected.price) - Number(selected.promo_price))}</Badge>
                  </>
                ) : (
                  <span className="text-2xl font-extrabold">{brl(unitPrice(selected))}</span>
                )}
              </div>
            </div>
            <div className="w-40 space-y-2 shrink-0">
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add(selected);
                }}
                aria-label="Quantidade"
              />
              <div className="text-sm text-muted-foreground">
                Subtotal: <strong>{brl(unitPrice(selected) * qty)}</strong>
              </div>
              <Button className="w-full" onClick={() => add(selected)} disabled={Number(selected.stock ?? 0) <= 0}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {results.length > 1 && (
        <Card className="p-2 max-h-64 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected(p);
                setQty(1);
              }}
              className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-accent"
            >
              <img src={productImage(p)} alt="" className="h-10 w-10 rounded object-contain bg-muted" />
              <span className="flex-1 min-w-0 truncate text-sm">{p.name}</span>
              <span className="text-xs text-muted-foreground">Est. {Number(p.stock ?? 0)}</span>
              <span className="text-sm font-semibold">{brl(unitPrice(p))}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
