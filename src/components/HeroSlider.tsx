import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import heroImg from "@/assets/hero-pharmacy.jpg";

export type HeroSlide = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  cta_text?: string | null;
  link?: string | null;
  image_url?: string | null;
};

const FALLBACK: HeroSlide[] = [
  { id: "f1", title: "Preço baixo todo dia", subtitle: "Medicamentos, higiene e saúde perto de você", cta_text: "Ver ofertas", link: "/categoria/ofertas" },
  { id: "f2", title: "Peça pelo WhatsApp", subtitle: "Atendimento rápido e entrega local em Campina Grande", cta_text: "Falar agora", link: "/carrinho" },
  { id: "f3", title: "Envie sua receita", subtitle: "Nossa equipe confere e orienta sua compra com segurança", cta_text: "Enviar receita", link: "/enviar-receita" },
];

export function HeroSlider({ slides }: { slides?: HeroSlide[] }) {
  const data = slides && slides.length > 0 ? slides : FALLBACK;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || data.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % data.length), 5000);
    return () => clearInterval(t);
  }, [paused, data.length]);

  // Swipe
  const [touchX, setTouchX] = useState<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => setTouchX(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) setIdx((i) => (i + (dx < 0 ? 1 : -1) + data.length) % data.length);
    setTouchX(null);
  };

  return (
    <section
      className="relative overflow-hidden bg-gradient-soft md:rounded-xl md:mx-4 lg:mx-auto lg:container md:my-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="container relative h-[260px] sm:h-[320px] md:h-[400px] lg:h-[440px]">
        {data.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "absolute inset-0 transition-all duration-700 ease-out",
              i === idx ? "opacity-100 translate-x-0" : "opacity-0 pointer-events-none",
              i < idx && "-translate-x-4",
              i > idx && "translate-x-4"
            )}
            aria-hidden={i !== idx}
          >
            <div className="h-full grid md:grid-cols-2 gap-4 items-center py-4 md:py-8">
              <div className="z-10 px-2">
                <span className="inline-block bg-tag text-tag-foreground text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3 shadow-card">
                  Promoção
                </span>
                <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold leading-tight text-foreground">
                  {s.title}
                </h2>
                {s.subtitle && (
                  <p className="mt-2 md:mt-3 text-sm md:text-lg text-muted-foreground max-w-md">
                    {s.subtitle}
                  </p>
                )}
                <div className="mt-4 md:mt-6">
                  <Button asChild size="lg" className="shadow-elevated">
                    <Link to={s.link || "/"}>{s.cta_text || "Ver agora"}</Link>
                  </Button>
                </div>
              </div>
              <div className="hidden md:block relative h-full">
                <div className="absolute inset-0 bg-gradient-hero rounded-3xl shadow-elevated overflow-hidden">
                  <img
                    src={s.image_url || heroImg}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/40 to-transparent" />
                </div>
              </div>
            </div>
          </div>
        ))}

        {data.length > 1 && (
          <>
            <button
              aria-label="Anterior"
              onClick={() => setIdx((i) => (i - 1 + data.length) % data.length)}
              className="flex absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 bg-background hover:bg-background text-primary rounded-full h-9 w-9 sm:h-[46px] sm:w-[46px] items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.15)] opacity-70 hover:opacity-100 hover:scale-105 transition-all z-20"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            <button
              aria-label="Próximo"
              onClick={() => setIdx((i) => (i + 1) % data.length)}
              className="flex absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 bg-background hover:bg-background text-primary rounded-full h-9 w-9 sm:h-[46px] sm:w-[46px] items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.15)] opacity-70 hover:opacity-100 hover:scale-105 transition-all z-20"
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
                    i === idx ? "bg-primary w-7" : "bg-muted-foreground/30 w-2 hover:bg-muted-foreground/60"
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
