import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard, Product } from "./ProductCard";
import { Button } from "./ui/button";

export function ProductCarousel({ items, loading }: { items?: Product[]; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = (card?.offsetWidth || 220) + 12;
    el.scrollBy({ left: dir * step * 2, behavior: "smooth" });
  };

  if (loading || !items) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="shrink-0 w-[46%] sm:w-[32%] md:w-[24%] lg:w-[19%] aspect-[3/4] bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Nenhum produto disponível no momento.</div>;
  }

  return (
    <div className="relative group">
      <div
        ref={ref}
        className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth pb-2 -mx-1 px-1"
      >
        {items.map((p) => (
          <div
            key={p.id}
            data-card
            className="snap-start shrink-0 w-[46%] sm:w-[32%] md:w-[24%] lg:w-[19%]"
          >
            <ProductCard p={p} />
          </div>
        ))}
      </div>

      <Button
        size="icon"
        variant="outline"
        onClick={() => scroll(-1)}
        className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 bg-background shadow-elevated rounded-full h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Anterior"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        onClick={() => scroll(1)}
        className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 bg-background shadow-elevated rounded-full h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Próximo"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}
