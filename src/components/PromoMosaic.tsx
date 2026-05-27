import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tag, Pill, Sparkles, Baby, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type MosaicTile = {
  id: string;
  position: number;
  size: "lg" | "sm";
  title: string | null;
  subtitle: string | null;
  badge_text: string | null;
  cta_text: string | null;
  link: string | null;
  image_url: string | null;
  bg_style: string;
  active: boolean;
};

const BG: Record<string, string> = {
  "soft-pink": "bg-gradient-to-br from-[#FFF1F3] to-white border border-primary/15",
  pink: "bg-[#FFF5F6] border border-primary/10",
  "soft-blue": "bg-gradient-to-br from-[#EEF4FF] to-white border border-sky-200/40",
  "soft-mint": "bg-gradient-to-br from-[#ECFBF3] to-white border border-emerald-200/40",
  white: "bg-white border border-border",
  cream: "bg-[#FFFBEC] border border-amber-200/40",
};

const FALLBACK: MosaicTile[] = [
  {
    id: "f1",
    position: 1,
    size: "lg",
    title: "Ofertas da Semana",
    subtitle: "Até 40% OFF em itens selecionados",
    badge_text: "Promoção",
    cta_text: "Ver agora",
    link: "/categoria/ofertas",
    image_url: null,
    bg_style: "soft-pink",
    active: true,
  },
  {
    id: "f2",
    position: 2,
    size: "sm",
    title: "Genéricos",
    subtitle: "Mesmo princípio, preço baixo",
    badge_text: null,
    cta_text: "Conferir",
    link: "/categoria/genericos",
    image_url: null,
    bg_style: "white",
    active: true,
  },
  {
    id: "f3",
    position: 3,
    size: "sm",
    title: "Higiene & Beleza",
    subtitle: "Cuidado diário",
    badge_text: null,
    cta_text: "Conferir",
    link: "/categoria/higiene-pessoal",
    image_url: null,
    bg_style: "pink",
    active: true,
  },
  {
    id: "f4",
    position: 4,
    size: "sm",
    title: "Mamães e Bebês",
    subtitle: "Tudo para o bebê",
    badge_text: null,
    cta_text: "Conferir",
    link: "/categoria/mamaes-e-bebes",
    image_url: null,
    bg_style: "soft-blue",
    active: true,
  },
];

function defaultIconFor(title: string | null) {
  const t = (title || "").toLowerCase();
  if (t.includes("oferta")) return Tag;
  if (t.includes("higien") || t.includes("belez")) return Sparkles;
  if (t.includes("bebê") || t.includes("bebe") || t.includes("mam")) return Baby;
  if (t.includes("medic") || t.includes("gener")) return Pill;
  return ShoppingBag;
}

function TileCard({ tile, large }: { tile: MosaicTile; large?: boolean }) {
  const bg = BG[tile.bg_style] ?? BG["soft-pink"];
  const Icon = defaultIconFor(tile.title);
  const Wrapper: any = tile.link ? Link : "div";
  const wrapperProps = tile.link ? { to: tile.link } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        bg,
        "rounded-2xl flex flex-col justify-between overflow-hidden relative shadow-sm hover:shadow-md transition-all duration-300 group",
        large ? "p-6 col-span-2 row-span-2" : "p-5 hover:-translate-y-0.5",
      )}
    >
      {/* Decorative blob */}
      <div className="absolute -top-16 -left-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />

      {/* Product image OR icon fallback */}
      {tile.image_url ? (
        <div
          className={cn(
            "absolute -right-2 -bottom-2 pointer-events-none",
            large ? "h-44 w-44 md:h-56 md:w-56" : "h-28 w-28",
          )}
        >
          <div className="absolute inset-x-3 bottom-2 h-2 rounded-full bg-foreground/10 blur-md" />
          <img
            src={tile.image_url}
            alt={tile.title ?? ""}
            loading="lazy"
            className="relative h-full w-full object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.15)]"
          />
        </div>
      ) : (
        <div
          className={cn(
            "absolute opacity-10 group-hover:opacity-20 transition-all duration-500",
            large ? "-right-10 -bottom-10" : "-right-4 -bottom-4",
          )}
        >
          <Icon className={cn(large ? "h-56 w-56" : "h-24 w-24", "text-primary")} />
        </div>
      )}

      <div className="relative">
        {tile.badge_text && (
          <span className="inline-block bg-primary text-primary-foreground text-[11px] font-bold uppercase px-2.5 py-1 rounded-full">
            {tile.badge_text}
          </span>
        )}
        {tile.title && (
          <h3
            className={cn(
              "mt-2 font-extrabold leading-tight text-foreground",
              large ? "text-3xl lg:text-4xl" : "text-lg",
            )}
          >
            {tile.title}
          </h3>
        )}
        {tile.subtitle && (
          <p className={cn("text-muted-foreground mt-1", large ? "" : "text-sm")}>
            {tile.subtitle}
          </p>
        )}
      </div>

      {tile.cta_text && (
        <span
          className={cn(
            "relative w-fit",
            large
              ? "inline-flex items-center gap-1 bg-primary text-primary-foreground font-bold text-sm px-4 py-2 rounded-full shadow-sm group-hover:scale-105 transition-transform"
              : "text-primary font-bold text-sm",
          )}
        >
          {tile.cta_text} →
        </span>
      )}
    </Wrapper>
  );
}

export function PromoMosaic() {
  const { data } = useQuery({
    queryKey: ["home_mosaic_tiles"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("home_mosaic_tiles")
        .select("*")
        .eq("active", true)
        .order("position");
      return (data ?? []) as MosaicTile[];
    },
  });

  const tiles = data && data.length > 0 ? data : FALLBACK;
  const large = tiles.find((t) => t.size === "lg") ?? tiles[0];
  const smalls = tiles.filter((t) => t.id !== large.id).slice(0, 4);

  return (
    <section className="container mt-6 md:mt-8">
      <div className="hidden md:grid grid-cols-4 gap-4 auto-rows-[130px]">
        <div className="col-span-2 row-span-2">
          <TileCard tile={large} large />
        </div>
        {smalls.map((t) => (
          <TileCard key={t.id} tile={t} />
        ))}
      </div>

      <div className="md:hidden flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4 px-4">
        {[large, ...smalls].map((t) => (
          <Link
            key={t.id}
            to={t.link || "#"}
            className={cn(
              BG[t.bg_style] ?? BG["soft-pink"],
              "snap-start shrink-0 w-[85%] h-40 rounded-2xl p-5 flex flex-col justify-between overflow-hidden relative shadow-sm",
            )}
          >
            {t.image_url ? (
              <img
                src={t.image_url}
                alt={t.title ?? ""}
                loading="lazy"
                className="absolute -right-2 -bottom-2 h-28 w-28 object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.15)]"
              />
            ) : null}
            <div className="relative">
              {t.badge_text && (
                <span className="inline-block bg-primary text-primary-foreground text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mb-1">
                  {t.badge_text}
                </span>
              )}
              <h4 className="text-lg font-extrabold leading-tight text-foreground">
                {t.title}
              </h4>
              {t.subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{t.subtitle}</p>
              )}
            </div>
            {t.cta_text && (
              <span className="relative text-primary font-bold text-sm">
                {t.cta_text} →
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
