import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Package2 } from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";

function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

type Dept = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  link: string | null;
  band_color: string | null;
};

export function DepartmentCarousel() {
  const { data = [] } = useQuery({
    queryKey: ["home_departments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id,name,slug,image_url,link,band_color")
        .eq("active", true)
        .eq("show_on_home", true)
        .order("position", { ascending: true });
      return (data || []) as Dept[];
    },
  });

  const trackRef = useRef<HTMLDivElement | null>(null);
  const { ref: containerRef, width: containerWidth } = useMeasure<HTMLDivElement>();
  const [activeIndex, setActiveIndex] = useState(0);

  const gap = 12; // px (matches gap-3)
  const minCardWidth = 140; // px
  const visibleCount = containerWidth
    ? Math.max(2, Math.floor((containerWidth + gap) / (minCardWidth + gap)))
    : 6;

  const maxIndex = Math.max(0, data.length - visibleCount);

  const scrollToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, maxIndex));
      setActiveIndex(clamped);
      const track = trackRef.current;
      if (!track) return;
      const card = track.children[clamped] as HTMLElement | undefined;
      if (!card) return;
      track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" });
    },
    [maxIndex]
  );

  const goPrev = () => scrollToIndex(activeIndex - 1);
  const goNext = () => scrollToIndex(activeIndex + 1);

  // Update active index on native scroll (mobile snap)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const scrollLeft = track.scrollLeft;
      const first = track.children[0] as HTMLElement | undefined;
      if (!first) return;
      const step = first.offsetWidth + gap;
      const idx = Math.round(scrollLeft / step);
      setActiveIndex(Math.max(0, Math.min(idx, maxIndex)));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, [maxIndex, gap]);

  if (!data.length) return null;

  const cardWidth = containerWidth
    ? (containerWidth - (visibleCount - 1) * gap) / visibleCount
    : minCardWidth;

  return (
    <section className="container py-8 md:py-10">
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
          <span className="inline-block w-1 h-6 bg-primary rounded-full" />
          Navegue por departamento
        </h2>
        <Link
          to="/departamentos"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Ver todos
        </Link>
      </div>

      <div ref={containerRef} className="relative">
        {/* Navigation arrows - desktop only */}
        <button
          onClick={goPrev}
          disabled={activeIndex === 0}
          className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-background border shadow-md hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={goNext}
          disabled={activeIndex >= maxIndex}
          className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-background border shadow-md hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Próximo"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Track */}
        <div
          ref={trackRef}
          className="flex gap-3 overflow-x-auto md:overflow-hidden snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0"
        >
          {data.map((d) => {
            const href = d.link?.trim() ? d.link : `/categoria/${d.slug}`;
            const color = d.band_color || "#E11D2E";
            return (
              <Link
                key={d.id}
                to={href}
                className="snap-start shrink-0 relative rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group"
                style={{ width: cardWidth }}
              >
                <div className="aspect-[4/5] w-full overflow-hidden relative">
                  {d.image_url ? (
                    <img
                      src={d.image_url}
                      alt={d.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-secondary">
                      <Package2 className="h-14 w-14 text-primary/40" />
                    </div>
                  )}
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                  {/* Name overlay */}
                  <div className="absolute bottom-0 left-0 right-0 px-3 py-3">
                    <p className="text-white text-xs md:text-sm font-bold leading-tight text-center drop-shadow-md">
                      {d.name}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Dots */}
        {maxIndex > 0 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {Array.from({ length: maxIndex + 1 }).map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeIndex
                    ? "w-5 bg-primary"
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`Ir para slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
