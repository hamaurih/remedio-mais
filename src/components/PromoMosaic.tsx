import { Link } from "react-router-dom";
import { Tag, Pill, Sparkles, Baby } from "lucide-react";

type Tile = {
  title: string;
  subtitle: string;
  link: string;
  icon: React.ElementType;
  className: string;
  size?: "lg" | "sm";
};

const TILES: Tile[] = [
  {
    title: "Ofertas da Semana",
    subtitle: "Até 40% OFF em itens selecionados",
    link: "/categoria/ofertas",
    icon: Tag,
    className: "bg-gradient-to-br from-primary to-primary-dark text-primary-foreground",
    size: "lg",
  },
  {
    title: "Genéricos",
    subtitle: "Mesmo princípio, preço baixo",
    link: "/categoria/genericos",
    icon: Pill,
    className: "bg-gradient-to-br from-accent to-background text-foreground",
  },
  {
    title: "Higiene & Beleza",
    subtitle: "Cuidado diário",
    link: "/categoria/higiene-pessoal",
    icon: Sparkles,
    className: "bg-gradient-to-br from-secondary to-background text-foreground",
  },
];

const MOBILE_TILES: Tile[] = [
  ...TILES,
  {
    title: "Mamães e Bebês",
    subtitle: "Tudo para o bebê",
    link: "/categoria/mamaes-e-bebes",
    icon: Baby,
    className: "bg-gradient-to-br from-pink-100 to-background text-foreground",
  },
];

export function PromoMosaic() {
  return (
    <section className="container mt-6 md:mt-8">
      {/* Desktop: 3-col grid, large takes 2 cols */}
      <div className="hidden md:grid grid-cols-3 gap-4 h-[260px]">
        <Link
          to={TILES[0].link}
          className={`${TILES[0].className} col-span-2 row-span-2 rounded-xl p-6 flex flex-col justify-between overflow-hidden relative shadow-card hover:shadow-elevated transition-all duration-300 group`}
        >
          <div className="absolute -right-8 -bottom-8 opacity-15 group-hover:opacity-25 group-hover:scale-110 transition-all duration-500">
            <Tag className="h-48 w-48" />
          </div>
          <div className="relative">
            <span className="inline-block bg-background/20 backdrop-blur text-xs font-bold uppercase px-2.5 py-1 rounded-full">Promoção</span>
            <h3 className="text-3xl lg:text-4xl font-extrabold mt-3 leading-tight">{TILES[0].title}</h3>
            <p className="opacity-90 mt-1">{TILES[0].subtitle}</p>
          </div>
          <span className="relative inline-flex w-fit items-center gap-1 bg-background text-primary font-bold text-sm px-4 py-2 rounded-full shadow group-hover:scale-105 transition-transform">
            Ver agora →
          </span>
        </Link>

        {TILES.slice(1).map((t) => (
          <Link
            key={t.title}
            to={t.link}
            className={`${t.className} rounded-xl p-5 flex flex-col justify-between overflow-hidden relative shadow-card hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300 group border border-border`}
          >
            <div className="absolute -right-4 -bottom-4 opacity-20 group-hover:scale-110 transition-transform duration-500">
              <t.icon className="h-24 w-24 text-primary" />
            </div>
            <div className="relative">
              <h4 className="text-lg font-extrabold leading-tight">{t.title}</h4>
              <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
            </div>
            <span className="relative text-primary font-bold text-sm">Conferir →</span>
          </Link>
        ))}
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="md:hidden flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4 px-4">
        {MOBILE_TILES.map((t) => (
          <Link
            key={t.title}
            to={t.link}
            className={`${t.className} snap-start shrink-0 w-[85%] h-36 rounded-xl p-5 flex flex-col justify-between overflow-hidden relative shadow-card border border-border`}
          >
            <div className="absolute -right-4 -bottom-4 opacity-20">
              <t.icon className="h-24 w-24" />
            </div>
            <div className="relative">
              <h4 className="text-lg font-extrabold leading-tight">{t.title}</h4>
              <p className="text-xs opacity-80 mt-1">{t.subtitle}</p>
            </div>
            <span className="relative font-bold text-sm">Conferir →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
