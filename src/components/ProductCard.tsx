import { useCart } from "@/hooks/useCart";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { addToCart, formatBRL } from "@/lib/store";
import { resolveSitePrice } from "@/lib/pricing";
import { toast } from "sonner";
import { openQuickView } from "@/lib/quickview";
import { openGenericCheck } from "@/lib/genericSuggestion";
import { notifyCartAddition } from "@/lib/cartLiveNotify";

export type Product = {
  id: string; name: string; slug: string;
  price: number; promo_price: number | null;
  site_price?: number | null; site_promo_price?: number | null;
  promotion_start?: string | null; promotion_end?: string | null;
  image_url: string | null; manufacturer: string | null;
  on_sale: boolean; featured?: boolean; requires_prescription: boolean; controlled: boolean;
  stock?: number; cart_quantity_limit?: number | null;
  created_at?: string | null;
  has_variants?: boolean | null;
};

type BadgeKind = "oferta" | "generico" | "mais-vendido" | "novo" | null;

function resolveBadge(p: Product, hasDiscount: boolean): BadgeKind {
  if (hasDiscount) return "oferta";
  const txt = `${p.name} ${p.manufacturer ?? ""}`.toLowerCase();
  if (/gen[eé]rico/.test(txt)) return "generico";
  if (p.featured) return "mais-vendido";
  if (p.created_at) {
    const days = (Date.now() - new Date(p.created_at).getTime()) / 86400000;
    if (days <= 30) return "novo";
  }
  return null;
}

const BADGE_STYLE: Record<Exclude<BadgeKind, null>, { label: string; cls: string }> = {
  oferta: { label: "Oferta", cls: "bg-primary text-primary-foreground" },
  generico: { label: "Genérico", cls: "bg-emerald-600 text-white" },
  "mais-vendido": { label: "Mais vendido", cls: "bg-tag text-tag-foreground" },
  novo: { label: "Novo", cls: "bg-sky-600 text-white" },
};

export const ProductCard = memo(function ProductCard({ p }: { p: Product }) {
  const cart = useCart();
  const available = Math.max(0, Number(p.stock ?? 0) - (cart.find(i => i.id === p.id)?.quantity || 0));
  const resolved = resolveSitePrice(p);
  const finalPrice = resolved.finalPrice;
  const hasDiscount = resolved.hasDiscount;
  const discount = resolved.discountPercent;
  const badge = resolveBadge(p, hasDiscount);
  const outOfStock = !p.has_variants && available <= 0;
  const requiresPrescription = !!(p.controlled || p.requires_prescription);

  const handleAdd = () => {
    if (outOfStock) {
      toast.error("Produto indisponível no momento.");
      return;
    }
    if (p.has_variants) {
      openQuickView(p);
      return;
    }

    const doAdd = () => {
      const added = addToCart({
        available_stock: Number(p.stock ?? 0),
        id: p.id,
        product_id: p.id,
        name: p.name,
        price: finalPrice,
        image_url: p.image_url,
        requires_prescription: requiresPrescription,
        controlled: !!p.controlled,
        prescription_id: null,
        prescription_status: null,
        prescription_approved_at: null,
      });
      if (!added) { toast.error(`Só ${p.stock || 0} disponíveis`); return; }
      toast.success(requiresPrescription
        ? "Adicionado. Envie a receita no carrinho para liberar este item."
        : "Adicionado ao carrinho");
      if (!requiresPrescription) void notifyCartAddition(p.id, p.id);
    };

    if (requiresPrescription) {
      doAdd();
      return;
    }

    openGenericCheck({ product: p, onAddOriginal: doAdd });
  };

  return (
    <article className="group bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-card hover:shadow-elevated hover:-translate-y-1 hover:border-primary/40 transition-all duration-300 h-full">
      <button
        type="button"
        onClick={() => openQuickView(p)}
        className="relative block bg-secondary/30 overflow-hidden text-left w-full"
        style={{ aspectRatio: "1 / 1" }}
        aria-label={`Ver ${p.name}`}
      >
        <img
          src={p.image_url || productPlaceholder}
          alt={p.name}
          loading="lazy"
          decoding="async"
          width={300}
          height={300}
          sizes="(max-width: 768px) 45vw, 250px"
          onError={(event) => {
            const image = event.currentTarget;
            image.onerror = null;
            image.src = productPlaceholder;
          }}
          className="w-full h-full object-contain p-2 md:p-3 group-hover:scale-110 transition-transform duration-500 ease-out"
        />
        {badge && (
          <span className={`absolute top-2 left-2 ${BADGE_STYLE[badge].cls} text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-md shadow-card`}>
            {BADGE_STYLE[badge].label}
          </span>
        )}
        {hasDiscount && (
          <span className="absolute top-2 right-2 bg-primary-dark text-primary-foreground text-xs font-extrabold px-2 py-1 rounded-md shadow-card">-{discount}%</span>
        )}
        {requiresPrescription && !hasDiscount && !outOfStock && (
          <span className="absolute bottom-2 right-2 bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold px-2 py-1 rounded">Receita</span>
        )}
        {outOfStock && (
          <span className="absolute bottom-2 left-2 right-2 bg-muted text-muted-foreground text-xs font-bold uppercase tracking-wide text-center py-1 rounded">Indisponível</span>
        )}
      </button>

      <div className="p-3 md:p-4 flex flex-col gap-1 flex-1">
        <button type="button" onClick={() => openQuickView(p)} className="font-semibold text-sm leading-snug line-clamp-2 hover:text-primary min-h-[2.5rem] text-left">
          {p.name}
        </button>
        {p.manufacturer && <div className="text-xs uppercase tracking-wide text-muted-foreground truncate">{p.manufacturer}</div>}

        <div className="mt-auto pt-2">
          <div className="h-4 text-xs text-muted-foreground line-through">{resolved.comparePrice != null ? formatBRL(resolved.comparePrice) : "\u00A0"}</div>
          <div className="text-[22px] font-extrabold leading-none text-primary">{formatBRL(finalPrice)}</div>
          <div className="text-xs text-muted-foreground mt-1">Retire na loja ou receba em casa</div>
        </div>

        {!p.has_variants && <p className="text-xs text-muted-foreground">{Number(p.stock) <= 0 ? "Esgotado" : `Só ${p.stock} disponíveis`}</p>}
        <Button
          onClick={handleAdd}
          disabled={outOfStock}
          className="mt-3 w-full h-10 rounded-full font-bold bg-primary hover:bg-primary-dark active:scale-95 transition-all disabled:opacity-60"
        >
          <ShoppingCart className="h-4 w-4 mr-1" /> {outOfStock ? (Number(p.stock) <= 0 ? "Esgotado" : `Só ${p.stock} disponíveis`) : (p.has_variants ? "Escolher opção" : "Adicionar")}
        </Button>
        {requiresPrescription && !outOfStock && (
          <div className="mt-1 text-xs text-center text-amber-800">Receita será solicitada no carrinho</div>
        )}
      </div>
    </article>
  );
});
