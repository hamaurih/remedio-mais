import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShoppingCart, MessageCircle, FileText } from "lucide-react";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { addToCart, buildWhatsAppLink, formatBRL } from "@/lib/store";
import { toast } from "sonner";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { openQuickView } from "@/lib/quickview";

export type Product = {
  id: string; name: string; slug: string;
  price: number; promo_price: number | null;
  image_url: string | null; manufacturer: string | null;
  on_sale: boolean; featured?: boolean; requires_prescription: boolean; controlled: boolean;
  stock?: number; cart_quantity_limit?: number | null;
  created_at?: string | null;
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

export function ProductCard({ p }: { p: Product }) {
  const { data: settings } = useStoreSettings();
  const finalPrice = p.promo_price ?? p.price;
  const hasDiscount = !!p.promo_price && p.promo_price < p.price;
  const discount = hasDiscount ? Math.round((1 - p.promo_price! / p.price) * 100) : 0;
  const badge = resolveBadge(p, hasDiscount);

  const outOfStock = typeof p.stock === "number" && p.stock <= 0;
  const handleAdd = () => {
    if (p.controlled) {
      toast.error("Medicamento controlado. Envie sua receita para análise.");
      return;
    }
    if (outOfStock) {
      toast.error("Produto indisponível no momento.");
      return;
    }
    addToCart({ id: p.id, name: p.name, price: finalPrice, image_url: p.image_url });
    toast.success("Adicionado ao carrinho");
  };

  const waMsg = `Olá! Tenho uma dúvida sobre o produto: *${p.name}*.`;
  const wa = buildWhatsAppLink(settings?.whatsapp || "5583999286000", waMsg);

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
          className="w-full h-full object-contain p-2 md:p-3 group-hover:scale-110 transition-transform duration-500 ease-out"
        />
        {badge && (
          <span
            className={`absolute top-2 left-2 ${BADGE_STYLE[badge].cls} text-[10px] md:text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-md shadow-card`}
          >
            {BADGE_STYLE[badge].label}
          </span>
        )}
        {hasDiscount && (
          <span className="absolute top-2 right-2 bg-primary-dark text-primary-foreground text-[11px] font-extrabold px-2 py-1 rounded-md shadow-card">
            -{discount}%
          </span>
        )}
        {p.requires_prescription && !hasDiscount && !outOfStock && (
          <span className="absolute bottom-2 right-2 bg-accent text-accent-foreground text-[10px] font-semibold px-2 py-1 rounded">
            Receita
          </span>
        )}
        {outOfStock && (
          <span className="absolute bottom-2 left-2 right-2 bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wide text-center py-1 rounded">
            Indisponível
          </span>
        )}
      </button>

      <div className="p-3 md:p-4 flex flex-col gap-1 flex-1">
        <button
          type="button"
          onClick={() => openQuickView(p)}
          className="font-semibold text-sm leading-snug line-clamp-2 hover:text-primary min-h-[2.5rem] text-left"
        >
          {p.name}
        </button>
        {p.manufacturer && (
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">
            {p.manufacturer}
          </div>
        )}

        <div className="mt-auto pt-2">
          <div className="h-4 text-xs text-muted-foreground line-through">
            {hasDiscount ? formatBRL(p.price) : "\u00A0"}
          </div>
          <div className="text-[22px] md:text-[26px] font-extrabold leading-none text-primary">
            {formatBRL(finalPrice)}
          </div>
          <div className="text-[10px] md:text-[11px] text-muted-foreground mt-1">
            Retire na loja ou peça pelo WhatsApp
          </div>
        </div>

        {p.controlled ? (
          <Button asChild size="sm" variant="outline" className="mt-3 rounded-full h-10">
            <Link to="/enviar-receita">
              <FileText className="h-4 w-4 mr-1" /> Enviar receita
            </Link>
          </Button>
        ) : (
          <div className="mt-3 flex items-stretch gap-1.5">
            <Button
              onClick={handleAdd}
              disabled={outOfStock}
              className="flex-1 h-10 rounded-full font-bold bg-primary hover:bg-primary-dark active:scale-95 transition-all disabled:opacity-60"
            >
              <ShoppingCart className="h-4 w-4 mr-1" /> {outOfStock ? "Indisponível" : "Adicionar"}
            </Button>
            <Button
              asChild
              size="icon"
              aria-label={outOfStock ? "Consultar pelo WhatsApp" : "Comprar pelo WhatsApp"}
              className="h-10 w-10 shrink-0 rounded-full bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90 active:scale-95 transition-all"
            >
              <a href={wa} target="_blank" rel="noopener">
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
