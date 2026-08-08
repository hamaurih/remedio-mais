import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { addToCart, cartTotal, formatBRL, removeFromCart, updateQty } from "@/lib/store";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { fetchGenericSuggestion, type GenericSuggestion } from "@/lib/genericSuggestion";
import { CartLiveAlert } from "@/components/CartLiveAlert";
import { toast } from "sonner";

function GenericLine({ item, onSwapped }: { item: any; onSwapped: () => void }) {
  const [sug, setSug] = useState<GenericSuggestion | null>(null);
  useEffect(() => {
    let alive = true;
    const pid = item.product_id || item.id;
    if (!pid) return;
    fetchGenericSuggestion(pid).then((s) => { if (alive) setSug(s); });
    return () => { alive = false; };
  }, [item.id, item.product_id]);

  if (!sug) return null;

  const swap = () => {
    removeFromCart(item.id);
    addToCart({
      id: sug.candidate.id,
      product_id: sug.candidate.id,
      name: sug.candidate.name,
      price: sug.candidate.promo_price ?? sug.candidate.price,
      image_url: sug.candidate.image_url,
    }, item.quantity);
    toast.success(`Trocado pelo genérico — economia de ${formatBRL(sug.savings * item.quantity)}`);
    onSwapped();
  };

  return (
    <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-emerald-700 shrink-0" />
      <div className="flex-1 text-[12px] text-emerald-900 min-w-0">
        Existe um <strong>genérico</strong> por <strong>{formatBRL(sug.finalPrice)}</strong> — economize {formatBRL(sug.savings)} ({Math.round(sug.pct * 100)}%)
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-100" onClick={swap}>
        Trocar
      </Button>
    </div>
  );
}

export default function Cart() {
  const items = useCart();
  const total = cartTotal(items);
  const nav = useNavigate();
  const [tick, setTick] = useState(0);

  return (
    <Layout>
      <div className="container py-8">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-6">Seu carrinho</h1>
        {items.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">Seu carrinho está vazio.</p>
            <Button asChild><Link to="/">Continuar comprando</Link></Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div>
              <CartLiveAlert items={items} />
              <div className="space-y-3">
              {items.map((i) => (
                <div key={i.id} className="bg-card border rounded-xl p-3 shadow-card">
                  <div className="flex gap-3 items-center">
                    <img src={i.image_url || productPlaceholder} alt={i.name} loading="lazy" decoding="async" className="w-16 h-16 object-contain bg-secondary/40 rounded-lg" />
                    <div className="flex-1">
                      <div className="font-medium text-sm line-clamp-2">{i.name}</div>
                      {i.variant_label && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 font-semibold">{i.variant_label}</div>
                      )}
                      <div className="text-primary font-bold mt-1">{formatBRL(i.price)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(i.id, i.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-8 text-center font-semibold">{i.quantity}</span>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(i.id, i.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeFromCart(i.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                  </div>
                  <GenericLine key={`${i.id}-${tick}`} item={i} onSwapped={() => setTick((t) => t + 1)} />
                </div>
              ))}
              </div>
            </div>


            <aside className="bg-card border rounded-xl p-5 h-fit shadow-card space-y-4">
              <div className="flex justify-between text-lg">
                <span>Subtotal</span>
                <span className="font-extrabold price">{formatBRL(total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Frete e desconto Pix são calculados no checkout.</p>

              <Button
                size="lg"
                className="w-full bg-primary hover:bg-primary-dark font-bold"
                onClick={() => nav("/checkout")}
              >
                Finalizar compra <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Continuar comprando</Link>
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">Pagamento seguro via Mercado Pago — Pix ou cartão de crédito.</p>
            </aside>
          </div>
        )}
      </div>
    </Layout>
  );
}
