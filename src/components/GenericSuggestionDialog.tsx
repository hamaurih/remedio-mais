import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ShoppingCart } from "lucide-react";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { addToCart, formatBRL } from "@/lib/store";
import { fetchGenericSuggestion, onGenericCheck, type GenericSuggestion } from "@/lib/genericSuggestion";
import { toast } from "sonner";

export function GenericSuggestionDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<GenericSuggestion | null>(null);
  const [pendingAdd, setPendingAdd] = useState<(() => void) | null>(null);

  useEffect(() => {
    return onGenericCheck(async ({ product, onAddOriginal }) => {
      setLoading(true);
      try {
        const sug = await fetchGenericSuggestion(product.id);
        if (!sug) {
          // Sem sugestão: adiciona direto
          onAddOriginal();
          return;
        }
        setSuggestion(sug);
        setPendingAdd(() => onAddOriginal);
        setOpen(true);
      } catch {
        onAddOriginal();
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const proceedOriginal = () => {
    pendingAdd?.();
    setOpen(false);
  };

  const swapForGeneric = () => {
    if (!suggestion) return;
    const c = suggestion.candidate;
    addToCart({
      id: c.id,
      product_id: c.id,
      name: c.name,
      price: c.promo_price ?? c.price,
      image_url: c.image_url,
    });
    toast.success(`Genérico adicionado! Você economizou ${formatBRL(suggestion.savings)}`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Existe um genérico equivalente
          </DialogTitle>
          <DialogDescription>
            Encontramos uma opção genérica com o mesmo princípio ativo por um preço menor.
          </DialogDescription>
        </DialogHeader>

        {suggestion && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3 items-center">
              <img
                src={suggestion.candidate.image_url || productPlaceholder}
                alt={suggestion.candidate.name}
                className="w-16 h-16 object-contain bg-white rounded"
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm line-clamp-2">{suggestion.candidate.name}</div>
                {suggestion.candidate.manufacturer && (
                  <div className="text-[11px] text-muted-foreground">{suggestion.candidate.manufacturer}</div>
                )}
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-extrabold text-emerald-700">
                    {formatBRL(suggestion.finalPrice)}
                  </span>
                  <span className="text-xs text-muted-foreground line-through">
                    {formatBRL(suggestion.original.finalPrice)}
                  </span>
                </div>
                <div className="text-[11px] font-bold text-emerald-700 uppercase">
                  Economize {formatBRL(suggestion.savings)} ({Math.round(suggestion.pct * 100)}%)
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Genéricos têm o mesmo princípio ativo, mesma dose e mesmo efeito terapêutico do medicamento de referência, regulados pela Anvisa.
            </p>

            <div className="flex flex-col gap-2">
              <Button onClick={swapForGeneric} className="w-full" size="lg">
                <ShoppingCart className="h-4 w-4 mr-2" /> Trocar pelo genérico e economizar
              </Button>
              <Button onClick={proceedOriginal} variant="outline" className="w-full">
                Continuar com {suggestion.original.name.length > 30 ? "o original" : suggestion.original.name}
              </Button>
            </div>
          </div>
        )}
        {!suggestion && loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">Verificando…</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
