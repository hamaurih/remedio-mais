import { Link } from "react-router-dom";
import { Tag, Pill, Sparkles, Baby } from "lucide-react";

type Tile = {
  title: string;
  subtitle: string;
  link: string;
  icon: React.ElementType;
  tone: "primary" | "soft" | "neutral";
  size?: "lg" | "sm";
};

const toneClasses: Record<Tile["tone"], string> = {
  primary:
    "bg-gradient-to-br from-[#FFF1F3] to-white border border-primary/15",
  soft: "bg-[#FFF5F6] border border-primary/10",
  neutral: "bg-white border border-border",
};

const TILES: Tile[] = [
  {
    title: "Ofertas da Semana",
    subtitle: "Até 40% OFF em itens selecionados",
    link: "/categoria/ofertas",
    icon: Tag,
    tone: "primary",
    size: "lg",
  },
  {
    title: "Genéricos",
    subtitle: "Mesmo princípio, preço baixo",
    link: "/categoria/genericos",
    icon: Pill,
    tone: "neutral",
  },
  {
    title: "Higiene & Beleza",
    subtitle: "Cuidado diário",
    link: "/categoria/higiene-pessoal",
    icon: Sparkles,
    tone: "soft",
  },
];

const MOBILE_TILES: Tile[] = [
  ...TILES,
  {
    title: "Mamães e Bebês",
    subtitle: "Tudo para o bebê",
    link: "/categoria/mamaes-e-bebes",
    icon: Baby,
    tone: "neutral",
  },
];

export function PromoMosaic() {
  return (
    <section className="container mt-6 md:mt-8">
      {/* Desktop: 3-col grid, large takes 2 cols */}
      <div className="hidden md:grid grid-cols-3 gap-4 h-[260px]">
        <Link
          to={TILES[0].link}
          className={`${toneClasses[TILES[0].tone]} col-span-2 row-span-2 rounded-2xl p-6 flex flex-col justify-between overflow-hidden relative shadow-sm hover:shadow-md transition-all duration-300 group`}
        >
          <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
            <Tag className="h-56 w-56 text-primary" />
          </div>
          <div className="absolute -top-16 -left-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative">
            <span className="inline-block bg-primary text-primary-foreground text-[11px] font-bold uppercase px-2.5 py-1 rounded-full">
              Promoção
            </span>
            <h3 className="text-3xl lg:text-4xl font-extrabold mt-3 leading-tight text-foreground">
              {TILES[0].title}
            </h3>
            <p className="text-muted-foreground mt-1">{TILES[0].subtitle}</p>
          </div>
          <span className="relative inline-flex w-fit items-center gap-1 bg-primary text-primary-foreground font-bold text-sm px-4 py-2 rounded-full shadow-sm group-hover:scale-105 transition-transform">
            Ver agora →
          </span>
        </Link>

        {TILES.slice(1).map((t) => (
          <Link
            key={t.title}
            to={t.link}
            className={`${toneClasses[t.tone]} rounded-2xl p-5 flex flex-col justify-between overflow-hidden relative shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group`}
          >
            <div className="absolute -right-4 -bottom-4 opacity-15 group-hover:opacity-25 group-hover:scale-110 transition-transform duration-500">
              <t.icon className="h-24 w-24 text-primary" />
            </div>
            <div className="relative">
              <h4 className="text-lg font-extrabold leading-tight text-foreground">
                {t.title}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
            </div>
            <span className="relative text-primary font-bold text-sm">
              Conferir →
            </span>
          </Link>
        ))}
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="md:hidden flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4 px-4">
        {MOBILE_TILES.map((t) => (
          <Link
            key={t.title}
            to={t.link}
            className={`${toneClasses[t.tone]} snap-start shrink-0 w-[85%] h-36 rounded-2xl p-5 flex flex-col justify-between overflow-hidden relative shadow-sm`}
          >
            <div className="absolute -right-4 -bottom-4 opacity-15">
              <t.icon className="h-24 w-24 text-primary" />
            </div>
            <div className="relative">
              <h4 className="text-lg font-extrabold leading-tight text-foreground">
                {t.title}
              </h4>
              <p className="text-xs text-muted-foreground mt-1">{t.subtitle}</p>
            </div>
            <span className="relative text-primary font-bold text-sm">
              Conferir →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
