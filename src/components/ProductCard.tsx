import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShoppingCart, MessageCircle, FileText } from "lucide-react";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { addToCart, buildWhatsAppLink, formatBRL } from "@/lib/store";
import { toast } from "sonner";
import { useStoreSettings } from "@/hooks/useStoreSettings";

export type Product = {
  id: string; name: string; slug: string;
  price: number; promo_price: number | null;
  image_url: string | null; manufacturer: string | null;
  on_sale: boolean; requires_prescription: boolean; controlled: boolean;
};

export function ProductCard({ p }: { p: Product }) {
  const { data: settings } = useStoreSettings();
  const finalPrice = p.promo_price ?? p.price;
  const hasDiscount = !!p.promo_price && p.promo_price < p.price;
  const discount = hasDiscount ? Math.round((1 - p.promo_price! / p.price) * 100) : 0;

  const handleAdd = () => {
    if (p.controlled) {
      toast.error("Medicamento controlado. Envie sua receita para análise.");
      return;
    }
    addToCart({ id: p.id, name: p.name, price: finalPrice, image_url: p.image_url });
    toast.success("Adicionado ao carrinho");
  };

  const waMsg = `Olá! Tenho interesse no produto: *${p.name}* (${formatBRL(finalPrice)}).`;
  const wa = buildWhatsAppLink(settings?.whatsapp || "5583999286000", waMsg);

  return (
    <article className="group bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-card hover:shadow-elevated hover:-translate-y-1 hover:border-primary/30 transition-all duration-200 h-full">
      <Link to={`/produto/${p.slug}`} className="relative block aspect-square bg-secondary/40 overflow-hidden">
        <img
          src={p.image_url || productPlaceholder}
          alt={p.name}
          loading="lazy"
          className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform"
        />
        {hasDiscount && (
          <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-[11px] font-bold px-2 py-1 rounded shadow-card">
            Oferta -{discount}%
          </span>
        )}
        {!hasDiscount && p.featured && (
          <span className="absolute top-2 left-2 bg-tag text-tag-foreground text-[11px] font-bold px-2 py-1 rounded shadow-card">
            Mais vendido
          </span>
        )}
        {p.requires_prescription && (
          <span className="absolute top-2 right-2 bg-accent text-accent-foreground text-[10px] font-semibold px-2 py-1 rounded">
            Receita
          </span>
        )}
      </Link>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <Link to={`/produto/${p.slug}`} className="font-medium text-sm line-clamp-2 hover:text-primary min-h-[2.5rem]">
          {p.name}
        </Link>
        {p.manufacturer && <div className="text-xs text-muted-foreground">{p.manufacturer}</div>}

        <div className="mt-auto pt-2">
          {hasDiscount && (
            <div className="text-xs text-muted-foreground line-through">{formatBRL(p.price)}</div>
          )}
          <div className="text-xl price leading-none">{formatBRL(finalPrice)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Retire na loja ou peça pelo WhatsApp</div>
        </div>

        {p.controlled ? (
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to="/enviar-receita"><FileText className="h-4 w-4 mr-1" /> Enviar receita</Link>
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <Button size="sm" onClick={handleAdd}>
              <ShoppingCart className="h-4 w-4 mr-1" /> Adicionar
            </Button>
            <Button asChild size="sm" variant="outline" className="border-whatsapp text-whatsapp hover:bg-whatsapp hover:text-whatsapp-foreground">
              <a href={wa} target="_blank" rel="noopener"><MessageCircle className="h-4 w-4 mr-1" /> WhatsApp</a>
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
