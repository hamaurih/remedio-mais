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
  // New optional visual fields (read from `banners.*` if present, else inferred)
  badge_text?: string | null;
  discount_text?: string | null;
  price_text?: string | null;
  product_image_url?: string | null;
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
  light: "bg-gradient-to-br from-white to-[#F7F7F8]",
  "soft-pink": "bg-gradient-to-br from-white via-white to-[#FFF1F3]",
  "soft-blue": "bg-gradient-to-br from-white via-white to-[#EEF4FF]",
  "soft-mint": "bg-gradient-to-br from-white via-white to-[#ECFBF3]",
};

const PEDESTAL: Record<HeroBackground, string> = {
  light: "from-[#F7F7F8] to-white border-border",
  "soft-pink": "from-[#FFF5F6] to-white border-primary/10",
  "soft-blue": "from-[#EEF4FF] to-white border-sky-200/40",
  "soft-mint": "from-[#ECFBF3] to-white border-emerald-200/40",
};

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
      <div className="relative h-[280px] sm:h-[340px] md:h-[420px] lg:h-[460px]">
        {data.map((s, i) => {
          const bgKey: HeroBackground = (s.background_style as HeroBackground) || "soft-pink";
          const productImg = s.product_image_url || s.image_url || heroImg;
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
              {/* Soft decorative accents */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-primary/[0.06] blur-3xl" />
                <div className="absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-primary/[0.05] blur-3xl" />
              </div>

              <div className="container relative h-full grid md:grid-cols-2 gap-4 items-center py-4 md:py-8">
                <div className="z-10 px-2">
                  {s.badge_text && (
                    <span className="inline-block bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3 shadow-sm">
                      {s.badge_text}
                    </span>
                  )}
                  <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold leading-tight text-foreground">
                    {s.title}
                  </h2>
                  {s.subtitle && (
                    <p className="mt-2 md:mt-3 text-sm md:text-lg text-muted-foreground max-w-md">
                      {s.subtitle}
                    </p>
                  )}

                  {(s.price_text || s.discount_text) && (
                    <div className="mt-3 md:mt-4 flex items-end gap-3">
                      {s.price_text && (
                        <div className="text-3xl md:text-5xl font-extrabold text-primary leading-none">
                          {s.price_text}
                        </div>
                      )}
                      {s.discount_text && (
                        <span className="bg-[#FFD600] text-foreground text-xs md:text-sm font-extrabold uppercase px-2.5 py-1 rounded-full shadow-sm">
                          {s.discount_text}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 md:mt-6">
                    <Button asChild size="lg" className="shadow-sm">
                      <Link to={s.link || "/"}>{s.cta_text || "Ver agora"}</Link>
                    </Button>
                  </div>
                </div>

                <div className="hidden md:block relative h-full">
                  <div className="relative h-full w-full flex items-center justify-center">
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 h-6 w-2/3 rounded-full bg-foreground/10 blur-xl" />
                    <div
                      className={cn(
                        "absolute inset-6 rounded-3xl bg-gradient-to-br border",
                        PEDESTAL[bgKey],
                      )}
                    />
                    <img
                      src={productImg}
                      alt={s.title || "Promoção"}
                      className="relative max-h-[85%] max-w-[85%] object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.18)]"
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
