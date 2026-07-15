import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroSlide as HeroSlideAuto, type HeroSlide as HeroSlideType } from "./HeroSlider";
import { HeroSlideImage } from "./hero/HeroSlideImage";
import { getHeroSize, type HeroSizeVariant } from "@/lib/heroSizes";
import { applyVisualModel } from "@/lib/heroVisualModels";
import { useIsMobile } from "@/hooks/use-mobile";

export interface HeroBannerRow extends HeroSlideType {
  visual_model?: string | null;
  size_variant?: string | null;
  desktop_image_url?: string | null;
  tablet_image_url?: string | null;
  image_focus?: string | null;
  image_alt?: string | null;
  autoplay_delay?: number | null;
  transition_type?: string | null;
}

interface Props {
  slides?: HeroBannerRow[];
  defaultDelay?: number;
}

function isImageMode(b: HeroBannerRow) {
  return b.banner_type === "image";
}

function isActive(b: HeroBannerRow): boolean {
  const now = Date.now();
  if ((b as any).published === false) return false;
  if (b.start_date && new Date(b.start_date).getTime() > now) return false;
  if (b.end_date && new Date(b.end_date).getTime() < now) return false;
  return true;
}

export function HeroPromoCarousel({ slides, defaultDelay = 4000 }: Props) {
  const activeSlides = useMemo(
    () => (slides || []).filter(isActive).map((b) => applyVisualModel(b)),
    [slides],
  );

  const isMobile = useIsMobile();
  const first = activeSlides[0];
  const sizeVariant: HeroSizeVariant = (first?.size_variant as HeroSizeVariant) || "hero-grande";
  const size = getHeroSize(sizeVariant);

  const filtered = activeSlides;

  const delay = Math.max(
    2000,
    filtered.length > 0
      ? Math.min(...filtered.map((b) => b.autoplay_delay || defaultDelay))
      : defaultDelay,
  );

  const transition = first?.transition_type || "slide";
  const isFade = transition === "fade";

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const autoplay = useRef(
    Autoplay({
      delay,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
      stopOnFocusIn: true,
    }),
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: filtered.length > 1, align: "start", containScroll: false, duration: isFade ? 0 : 28 },
    prefersReducedMotion ? [] : [autoplay.current],
  );

  // Keep autoplay delay in sync with computed delay after banner data loads.
  useEffect(() => {
    const ap = autoplay.current as any;
    if (!ap) return;
    if (ap.options) ap.options.delay = delay;
    if (emblaApi && !prefersReducedMotion) ap.reset?.();
  }, [delay, emblaApi, prefersReducedMotion]);

  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") emblaApi.scrollPrev();
      else if (e.key === "ArrowRight") emblaApi.scrollNext();
    };
    const el = emblaApi.rootNode();
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [emblaApi]);

  const togglePause = () => {
    const ap = autoplay.current as any;
    if (!ap) return;
    if (paused) {
      ap.play?.();
      setPaused(false);
    } else {
      ap.stop?.();
      setPaused(true);
    }
  };

  // filtered always contains at least the FALLBACK slide

  const viewportStyle: React.CSSProperties = isMobile
    ? {
        aspectRatio: size.mobileAspect,
        minHeight: `${size.mobileMinHeight}px`,
      }
    : {
        aspectRatio: size.desktopAspect,
        minHeight: `${size.minHeight}px`,
        maxHeight: `${size.maxHeight}px`,
      };

  const outerWrap = size.container
    ? "container py-4 md:py-6"
    : "w-full py-2";

  if (filtered.length === 0) return null;

  return (
    <section
      className={outerWrap}
      aria-label="Banners promocionais"
      aria-roledescription="carrossel"
    >
      <div
        className={cn(
          "relative w-full min-w-0 overflow-hidden group",
          size.container ? "rounded-2xl shadow-card" : "",
        )}
        tabIndex={0}
        role="region"
      >
        <div
          className="w-full min-w-0 overflow-hidden"
          style={viewportStyle}
          ref={emblaRef}
        >
          <div className={cn("flex h-full w-full", isFade && "relative")}>
            {filtered.map((b, idx) => (
              <div
                key={b.id || idx}
                className={cn(
                  "h-full min-w-0 shrink-0 grow-0 basis-full overflow-hidden",
                  isFade &&
                    "absolute inset-0 transition-opacity duration-700 " +
                      (idx === selected ? "opacity-100 z-10" : "opacity-0 z-0"),
                )}
                role="group"
                aria-roledescription="slide"
                aria-label={`Slide ${idx + 1} de ${filtered.length}`}
              >
                {isImageMode(b) ? (
                  <HeroSlideImage s={b as any} eager={idx === 0} />
                ) : (
                  <HeroSlideAuto s={b} />
                )}
              </div>
            ))}
          </div>
        </div>




        {/* Arrows */}
        {filtered.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => emblaApi?.scrollPrev()}
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 h-11 w-11 items-center justify-center rounded-full bg-background/90 shadow-md hover:bg-background transition opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Banner anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => emblaApi?.scrollNext()}
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 h-11 w-11 items-center justify-center rounded-full bg-background/90 shadow-md hover:bg-background transition opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Próximo banner"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Pause/play */}
            <button
              type="button"
              onClick={togglePause}
              className="absolute top-3 right-3 z-20 h-9 w-9 flex items-center justify-center rounded-full bg-background/80 shadow hover:bg-background opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
              aria-label={paused ? "Retomar carrossel" : "Pausar carrossel"}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>

            {/* Dots */}
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2"
              role="tablist"
              aria-label="Selecionar banner"
            >
              {filtered.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => emblaApi?.scrollTo(i)}
                  aria-label={`Ir para o banner ${i + 1}`}
                  aria-selected={i === selected}
                  role="tab"
                  className={cn(
                    "h-2 rounded-full transition-all",
                    i === selected
                      ? "bg-primary w-6"
                      : "bg-background/80 w-2 hover:bg-background",
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
