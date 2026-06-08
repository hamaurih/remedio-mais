import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShoppingCart, MessageCircle, FileText, Minus, Plus, AlertCircle } from "lucide-react";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { addToCart, buildWhatsAppLink, formatBRL } from "@/lib/store";
import { calculatePixPrice, resolvePixPercentage } from "@/lib/pix";
import { onQuickView } from "@/lib/quickview";
import { ProductCard, type Product } from "./ProductCard";
import { useProductVariants, VariantSelector, buildVariantLabel, type ProductVariant } from "./VariantSelector";
import { toast } from "sonner";

export function ProductQuickView() {
  const [product, setProduct] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const { data: settings } = useStoreSettings();
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  useEffect(() => onQuickView((p) => { setProduct(p); setQty(1); setActiveImage(p.image_url || null); setSelectedVariantId(null); setOpen(true); }), []);

  // Fetch full product (gallery, pix discount, etc.) — uses slug from card
  const { data: full } = useQuery({
    queryKey: ["quickview-product", product?.slug],
    queryFn: async () => {
      if (!product) return null;
      const { data } = await supabase.from("products").select("*").eq("slug", product.slug).maybeSingle();
      return data as any;
    },
    enabled: !!product?.slug && open,
  });

  const p: any = full || product;
  const gallery: string[] = useMemo(() => {
    if (!p) return [];
    const list = [p.image_url, ...(Array.isArray(p.gallery_images) ? p.gallery_images : [])].filter(Boolean);
    return Array.from(new Set(list)) as string[];
  }, [p]);

  const { data: related } = useQuery({
    queryKey: ["quickview-related", p?.id, p?.category_id, p?.group_code, p?.laboratory],
    queryFn: async () => {
      if (!p) return [];
      const collected: any[] = [];
      const seen = new Set<string>([p.id]);
      const push = (rows: any[] | null | undefined) => {
        for (const r of rows || []) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          collected.push(r);
        }
      };

      // 1. Same category
      if (p.category_id) {
        const { data } = await supabase
          .from("products").select("*").eq("active", true).gt("stock", 0).neq("id", p.id)
          .eq("category_id", p.category_id).limit(8);
        push(data);
      }
      // 2. Same Trier group_code
      if (collected.length < 8 && p.group_code) {
        const { data } = await supabase
          .from("products").select("*").eq("active", true).gt("stock", 0).neq("id", p.id)
          .eq("group_code", p.group_code).limit(8);
        push(data);
      }
      // 3. Same laboratory
      if (collected.length < 8 && p.laboratory) {
        const { data } = await supabase
          .from("products").select("*").eq("active", true).gt("stock", 0).neq("id", p.id)
          .eq("laboratory", p.laboratory).limit(8);
        push(data);
      }
      // 4. On sale fallback
      if (collected.length < 4) {
        const { data } = await supabase
          .from("products").select("*").eq("active", true).gt("stock", 0).neq("id", p.id)
          .eq("on_sale", true).limit(8);
        push(data);
      }
      return collected.slice(0, 8);
    },
    enabled: !!p?.id && open,
  });

  if (!p) return null;

  const finalPrice = p.promo_price ?? p.price;
  const hasDiscount = !!p.promo_price && p.promo_price < p.price;
  const discount = hasDiscount ? Math.round((1 - p.promo_price / p.price) * 100) : 0;
  const pixPct = resolvePixPercentage(p.pix_discount_percentage, (settings as any)?.pix_discount_percentage, (settings as any)?.pix_discount_enabled);
  const pixPrice = calculatePixPrice(finalPrice, pixPct);
  const stock = typeof p.stock === "number" ? p.stock : 0;
  const outOfStock = stock <= 0;
  const maxQty = Math.min(stock || 99, p.cart_quantity_limit || 99) || 99;

  const waPhone = (settings as any)?.whatsapp || "5583999286000";
  const waMsg = `Olá! Tenho interesse neste produto:\n\nProduto: ${p.name}\nCódigo: ${p.trier_product_id || p.sku || p.id}\nQuantidade: ${qty}\nPreço: ${formatBRL(finalPrice)}${pixPrice ? `\nPreço Pix: ${formatBRL(pixPrice)}` : ""}\n\nGostaria de consultar disponibilidade e entrega.`;
  const wa = buildWhatsAppLink(waPhone, waMsg);

  const handleAdd = () => {
    if (p.controlled) { toast.error("Medicamento controlado. Envie sua receita."); return; }
    if (outOfStock) { toast.error("Produto indisponível."); return; }
    addToCart({ id: p.id, name: p.name, price: finalPrice, image_url: p.image_url }, qty);
    toast.success(`${qty}x adicionado ao carrinho`);
  };

  const content = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b shrink-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Detalhe do produto</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid md:grid-cols-2 gap-6 p-4 md:p-6">
          {/* Gallery */}
          <div>
            <div className="bg-secondary/40 rounded-xl border aspect-square flex items-center justify-center overflow-hidden group">
              <img src={activeImage || p.image_url || productPlaceholder} alt={p.name} className="max-h-full max-w-full object-contain p-4 group-hover:scale-105 transition-transform" />
            </div>
            {gallery.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {gallery.map((g) => (
                  <button key={g} onClick={() => setActiveImage(g)} className={`shrink-0 h-16 w-16 rounded-lg border-2 bg-background overflow-hidden ${activeImage === g ? "border-primary" : "border-border"}`}>
                    <img src={g} alt="" className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col">
            {p.manufacturer && <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{p.manufacturer || p.laboratory}</div>}
            <h2 className="text-xl md:text-2xl font-extrabold leading-tight mt-1">{p.name}</h2>
            <div className="text-xs text-muted-foreground mt-1">
              {p.trier_product_id && <>Cód.: {p.trier_product_id} · </>}
              {p.barcode && <>EAN: {p.barcode}</>}
            </div>
            {(p.category_name || p.active_ingredient) && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {p.category_name && <>{p.category_name}</>}
                {p.active_ingredient && <> · {p.active_ingredient}</>}
              </div>
            )}

            {p.requires_prescription && (
              <div className="mt-3 inline-flex items-center gap-2 bg-accent text-accent-foreground text-xs font-semibold px-3 py-1.5 rounded-full self-start">
                <AlertCircle className="h-3.5 w-3.5" /> Venda sob receita
              </div>
            )}

            <div className="my-4 border-t" />

            {/* Price */}
            <div>
              {hasDiscount && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground line-through text-sm">{formatBRL(p.price)}</span>
                  <span className="text-[11px] font-extrabold bg-primary text-primary-foreground px-2 py-0.5 rounded">-{discount}%</span>
                </div>
              )}
              <div className="text-3xl md:text-4xl font-extrabold text-primary leading-none mt-1">{formatBRL(finalPrice)}</div>

              {pixPrice && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <div className="text-lg font-extrabold text-emerald-700">{formatBRL(pixPrice)}</div>
                  <div className="text-[11px] font-semibold text-emerald-700/80">no Pix com {pixPct}% de desconto</div>
                </div>
              )}
            </div>

            {/* Qty + actions */}
            <div className="mt-5 space-y-3">
              {!p.controlled && !outOfStock && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">Quantidade</span>
                  <div className="inline-flex items-center border rounded-full">
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-9 w-9 inline-flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Diminuir"><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-center font-bold">{qty}</span>
                    <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="h-9 w-9 inline-flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Aumentar"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
              )}

              {outOfStock ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-muted-foreground">Produto indisponível no momento</div>
                  <Button asChild className="w-full h-12 bg-whatsapp hover:bg-whatsapp/90 text-whatsapp-foreground rounded-full font-bold">
                    <a href={wa} target="_blank" rel="noopener"><MessageCircle className="h-5 w-5 mr-2" /> Consultar pelo WhatsApp</a>
                  </Button>
                </div>
              ) : p.controlled || p.requires_prescription ? (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Venda sujeita à apresentação e conferência de receita.</div>
                  <Button asChild className="w-full h-12 rounded-full font-bold" onClick={() => setOpen(false)}>
                    <Link to="/enviar-receita"><FileText className="h-5 w-5 mr-2" /> Enviar receita</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full h-11 rounded-full">
                    <a href={wa} target="_blank" rel="noopener"><MessageCircle className="h-4 w-4 mr-2" /> Falar com atendente</a>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button onClick={handleAdd} className="w-full h-12 rounded-full font-bold text-base bg-primary hover:bg-primary-dark">
                    <ShoppingCart className="h-5 w-5 mr-2" /> Adicionar ao carrinho
                  </Button>
                </div>
              )}

              <Link to={`/produto/${p.slug}`} onClick={() => setOpen(false)} className="block text-center text-xs text-primary font-semibold hover:underline pt-1">
                Ver página completa do produto →
              </Link>
            </div>
          </div>
        </div>

        {/* Related */}
        {related && related.length > 0 && (
          <div className="border-t bg-secondary/20 p-4 md:p-6">
            <h3 className="text-base md:text-lg font-extrabold mb-3">Aproveite e compre também</h3>
            <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto pb-2">
              {related.map((r: any) => (
                <div key={r.id} className="shrink-0 w-[60%] sm:w-[40%] md:w-auto">
                  <ProductCard p={r as Product} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "h-[95vh] w-full p-0 rounded-t-2xl" : "w-full sm:max-w-2xl p-0"}
      >
        {content}
      </SheetContent>
    </Sheet>
  );
}
