import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard, Product } from "./ProductCard";
import { cn } from "@/lib/utils";

export type ShelfBg = "white" | "light" | "red-soft" | "highlight";

const BG_CLASS: Record<ShelfBg, string> = {
  white: "bg-background",
  light: "bg-secondary/40",
  "red-soft": "bg-primary/5",
  highlight: "bg-highlight text-highlight-foreground",
};

export interface ProductShelfProps {
  title: string;
  subtitle?: string;
  products?: Product[];
  loading?: boolean;
  viewAllLink?: string;
  badge?: string;
  backgroundVariant?: ShelfBg;
  showArrows?: boolean;
  autoplay?: boolean;
  autoplayMs?: number;
}

export function ProductShelf({
  title,
  subtitle,
  products,
  loading,
  viewAllLink,
  badge,
  backgroundVariant = "white",
  showArrows = true,
  autoplay = false,
  autoplayMs = 4500,
}: ProductShelfProps) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = (card?.offsetWidth || 220) + 16;
    el.scrollBy({ left: dir * step * 2, behavior: "smooth" });
  };

  // Garante que a vitrine sempre inicia alinhada no primeiro card
  useEffect(() => {
    const el = ref.current;
    if (!el || !products || products.length === 0) return;
    el.scrollLeft = 0;
  }, [products]);

  useEffect(() => {
    if (!autoplay || !products || products.length === 0) return;
    const el = ref.current;
    if (!el) return;
    const id = setInterval(() => {
      const card = el.querySelector<HTMLElement>("[data-card]");
      const step = (card?.offsetWidth || 220) + 16;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: "smooth" });
    }, autoplayMs);
    return () => clearInterval(id);
  }, [autoplay, autoplayMs, products]);

  return (
    <section className={cn(BG_CLASS[backgroundVariant])}>
      <div className="container py-8 md:py-12">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-extrabold text-foreground flex items-center gap-2">
              <span className="inline-block w-1 h-6 bg-primary rounded-full" />
              <span className="truncate">{title}</span>
              {badge && (
                <span className="ml-1 text-[11px] font-bold uppercase tracking-wide bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                  {badge}
                </span>
              )}
            </h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {viewAllLink && (
            <Link
              to={viewAllLink}
              className="text-sm text-primary font-bold hover:underline whitespace-nowrap"
            >
              Ver todos →
            </Link>
          )}
        </div>

        {loading || !products ? (
          <div className="flex gap-4 overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="shrink-0 w-[46%] sm:w-[32%] md:w-[24%] lg:w-[19%] aspect-[3/4] bg-muted animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Nenhum produto disponível no momento.
          </div>
        ) : (
          <div className="relative group">
            <div
              ref={ref}
              className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth pb-2 -mx-1 px-1"
            >
              {products.map((p) => (
                <div
                  key={p.id}
                  data-card
                  className="snap-start shrink-0 w-[46%] sm:w-[32%] md:w-[24%] lg:w-[19%]"
                >
                  <ProductCard p={p} />
                </div>
              ))}
            </div>

            {showArrows && (
              <>
                <button
                  onClick={() => scroll(-1)}
                  className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 bg-background text-primary rounded-full h-11 w-11 items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.18)] opacity-0 group-hover:opacity-100 hover:scale-105 transition-all z-10"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => scroll(1)}
                  className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 bg-background text-primary rounded-full h-11 w-11 items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.18)] opacity-0 group-hover:opacity-100 hover:scale-105 transition-all z-10"
                  aria-label="Próximo"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
