import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import heroImg from "@/assets/hero-pharmacy.jpg";

export type HeroBackground = "light" | "soft-pink" | "soft-blue" | "soft-mint";

export type HeroSlide = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  cta_text?: string | null;
  link?: string | null;
  image_url?: string | null;
  badge_text?: string | null;
  discount_text?: string | null;
  price_text?: string | null;
  old_price?: number | string | null;
  new_price?: number | string | null;
  product_image_url?: string | null;
  background_image_url?: string | null;
  background_style?: HeroBackground | null;
};

const FALLBACK: HeroSlide[] = [
  {
    id: "f1",
    title: "Preço baixo todo dia",
    subtitle: "Medicamentos, higiene e saúde perto de você",
    cta_text: "Ver ofertas",
    link: "/categoria/ofertas",
    badge_text: "Promoção",
    background_style: "soft-pink",
  },
  {
    id: "f2",
    title: "Peça pelo WhatsApp",
    subtitle: "Atendimento rápido e entrega local em Campina Grande",
    cta_text: "Falar agora",
    link: "/carrinho",
    badge_text: "Atendimento",
    background_style: "soft-blue",
  },
  {
    id: "f3",
    title: "Envie sua receita",
    subtitle: "Nossa equipe confere e orienta sua compra com segurança",
    cta_text: "Enviar receita",
    link: "/enviar-receita",
    badge_text: "Receita",
    background_style: "soft-mint",
  },
];

const BG: Record<HeroBackground, string> = {
  light: "bg-gradient-to-br from-white via-white to-[#FAFAFA]",
  "soft-pink": "bg-gradient-to-br from-white via-[#FFF7F8] to-[#FFE4E8]",
  "soft-blue": "bg-gradient-to-br from-white via-[#F4F8FF] to-[#DDEBFF]",
  "soft-mint": "bg-gradient-to-br from-white via-[#F1FBF5] to-[#D4F4E2]",
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function HeroSlider({ slides }: { slides?: HeroSlide[] }) {
  const data = slides && slides.length > 0 ? slides : FALLBACK;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || data.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % data.length), 5500);
    return () => clearInterval(t);
  }, [paused, data.length]);

  const [touchX, setTouchX] = useState<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => setTouchX(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40)
      setIdx((i) => (i + (dx < 0 ? 1 : -1) + data.length) % data.length);
    setTouchX(null);
  };

  return (
    <section
      className="relative overflow-hidden border border-border md:rounded-2xl md:mx-4 lg:mx-auto lg:container md:my-3 shadow-sm bg-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative h-[300px] sm:h-[360px] md:h-[440px] lg:h-[480px]">
        {data.map((s, i) => {
          const bgKey: HeroBackground = (s.background_style as HeroBackground) || "soft-pink";
          const productImg = s.product_image_url || s.image_url || heroImg;
          const bgImg = s.background_image_url;
          const oldPrice = s.old_price != null ? Number(s.old_price) : null;
          const newPrice = s.new_price != null ? Number(s.new_price) : null;

          return (
            <div
              key={s.id}
              className={cn(
                "absolute inset-0 transition-all duration-700 ease-out",
                BG[bgKey],
                i === idx ? "opacity-100 translate-x-0" : "opacity-0 pointer-events-none",
                i < idx && "-translate-x-4",
                i > idx && "translate-x-4"
              )}
              aria-hidden={i !== idx}
            >
              {/* Optional background image with soft overlay */}
              {bgImg && (
                <>
                  <img
                    src={bgImg}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover opacity-25"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/70 to-white/30" />
                </>
              )}

              {/* Decorative blooms */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-20 h-96 w-96 rounded-full bg-primary/[0.08] blur-3xl" />
                <div className="absolute -bottom-28 -left-24 h-96 w-96 rounded-full bg-primary/[0.06] blur-3xl" />
              </div>

              <div className="container relative h-full grid md:grid-cols-[1.05fr_1fr] gap-4 items-center py-4 md:py-6">
                {/* Text column */}
                <div className="z-10 px-2 md:pl-4">
                  {s.badge_text && (
                    <span className="inline-flex items-center bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-[0.12em] px-3 py-1 rounded-full mb-3 shadow-sm">
                      {s.badge_text}
                    </span>
                  )}
                  <h2 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight text-foreground">
                    {s.title}
                  </h2>
                  {s.subtitle && (
                    <p className="mt-2 md:mt-3 text-sm md:text-lg text-muted-foreground max-w-md">
                      {s.subtitle}
                    </p>
                  )}

                  {(newPrice != null || s.price_text || s.discount_text) && (
                    <div className="mt-4 flex items-end gap-3 flex-wrap">
                      {oldPrice != null && (
                        <span className="text-sm md:text-base line-through text-muted-foreground mb-1">
                          {brl(oldPrice)}
                        </span>
                      )}
                      {newPrice != null ? (
                        <div className="text-4xl md:text-6xl font-extrabold text-primary leading-none tracking-tight">
                          {brl(newPrice)}
                        </div>
                      ) : s.price_text ? (
                        <div className="text-3xl md:text-5xl font-extrabold text-primary leading-none">
                          {s.price_text}
                        </div>
                      ) : null}
                      {s.discount_text && (
                        <span className="bg-[#FFD600] text-foreground text-xs md:text-sm font-extrabold uppercase px-2.5 py-1 rounded-full shadow-sm mb-1">
                          {s.discount_text}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-5 md:mt-6">
                    <Button asChild size="lg" className="shadow-md font-bold uppercase tracking-wide">
                      <Link to={s.link || "/"}>{s.cta_text || "Ver agora"}</Link>
                    </Button>
                  </div>
                </div>

                {/* Product column — integrated, no frame */}
                <div className="hidden md:flex relative h-full items-end justify-center">
                  <div className="relative h-full w-full flex items-end justify-center pb-6">
                    {/* Soft pedestal shadow */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 h-8 w-[70%] rounded-[50%] bg-foreground/15 blur-2xl" />
                    <img
                      src={productImg}
                      alt={s.title || "Promoção"}
                      className="relative max-h-[95%] max-w-[92%] object-contain drop-shadow-[0_24px_28px_rgba(0,0,0,0.22)]"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {data.length > 1 && (
          <>
            <button
              aria-label="Anterior"
              onClick={() => setIdx((i) => (i - 1 + data.length) % data.length)}
              className="flex absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 bg-background text-primary rounded-full h-9 w-9 sm:h-[46px] sm:w-[46px] items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.15)] opacity-70 hover:opacity-100 hover:scale-105 transition-all z-20"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            <button
              aria-label="Próximo"
              onClick={() => setIdx((i) => (i + 1) % data.length)}
              className="flex absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 bg-background text-primary rounded-full h-9 w-9 sm:h-[46px] sm:w-[46px] items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.15)] opacity-70 hover:opacity-100 hover:scale-105 transition-all z-20"
            >
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
              {data.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    i === idx
                      ? "bg-primary w-7"
                      : "bg-muted-foreground/30 w-2 hover:bg-muted-foreground/60"
                  )}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
