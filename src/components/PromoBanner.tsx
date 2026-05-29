import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tag, Sparkles, Pill, Percent, ShoppingBag } from "lucide-react";

export type PromoBlock = {
  id: string;
  position: number;
  variant: string;
  title: string | null;
  subtitle: string | null;
  badge_text: string | null;
  old_price: number | null;
  new_price: number | null;
  price_suffix: string | null;
  image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  active: boolean;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const variantIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  anniversary: Sparkles,
  "leve-pague": ShoppingBag,
  "desconto-2": Percent,
  generico: Pill,
  default: Tag,
};

function FallbackContent({ block }: { block: PromoBlock }) {
  const Icon = variantIcon[block.variant] ?? variantIcon.default;
  return (
    <div className="relative w-full h-full p-3 md:p-4 flex flex-col justify-between bg-gradient-to-br from-white via-white to-[#FFF0F2]">
      <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-primary/[0.06] blur-2xl" />
      <div className="relative flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {block.badge_text && (
            <span className="inline-block text-[9px] md:text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 bg-primary text-primary-foreground">
              {block.badge_text}
            </span>
          )}
          {block.title && (
            <h3 className="font-extrabold text-[13px] md:text-sm leading-tight line-clamp-2 text-foreground">
              {block.title}
            </h3>
          )}
          {block.subtitle && (
            <p className="text-[10px] md:text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
              {block.subtitle}
            </p>
          )}
          {block.new_price != null && (
            <div className="mt-1.5">
              {block.price_suffix && (
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {block.price_suffix}
                </div>
              )}
              {block.old_price != null && (
                <div className="text-[10px] line-through text-muted-foreground">
                  {brl(Number(block.old_price))}
                </div>
              )}
              <div className="text-xl md:text-2xl font-extrabold leading-none text-primary">
                {brl(Number(block.new_price))}
              </div>
            </div>
          )}
        </div>
        <div className="shrink-0 h-14 w-14 md:h-16 md:w-16 rounded-xl bg-gradient-to-br from-[#FFE4E8] via-white to-[#FFD0D8] border border-red-200/60 flex items-center justify-center">
          <Icon className="h-7 w-7 text-primary" />
        </div>
      </div>

      <span className="relative inline-flex w-fit items-center gap-1 mt-2 bg-primary text-primary-foreground font-extrabold text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm">
        {block.cta_text || "Ver oferta"} →
      </span>
    </div>
  );
}

function Tile({ block, featured }: { block: PromoBlock; featured?: boolean }) {
  const Wrapper: any = block.cta_url ? Link : "div";
  const wrapperProps = block.cta_url ? { to: block.cta_url } : {};

  return (
    <Wrapper
      {...wrapperProps}
      aria-label={block.title ?? "Promoção"}
      className={cn(
        "group relative shrink-0 snap-start overflow-hidden rounded-lg bg-white",
        "shadow-[0_2px_8px_rgba(60,10,15,0.10)] hover:shadow-[0_6px_18px_rgba(60,10,15,0.18)]",
        "transition-all hover:-translate-y-0.5",
        // Mobile sizing (carrossel)
        featured ? "w-[86%]" : "w-[78%]",
        // Desktop sizing
        featured
          ? "md:w-[400px] md:flex-[0_0_400px]"
          : "md:w-[210px] md:flex-[0_0_210px]",
        "h-[200px] md:h-[200px]",
      )}
    >
      {block.image_url ? (
        <img
          src={block.image_url}
          alt={block.title ?? "Promoção"}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <FallbackContent block={block} />
      )}
    </Wrapper>
  );
}

export function PromoBanner() {
  const { data } = useQuery({
    queryKey: ["promo_banner_blocks"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("promo_banner_blocks")
        .select("*")
        .eq("active", true)
        .order("position");
      return (data ?? []) as PromoBlock[];
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <section
      aria-label="Promoções em destaque"
      className="w-full bg-gradient-to-b from-[#0788c9] to-[#dff4ff] py-4 md:py-5 border-b border-sky-200/50"
    >
      <div className="container">
        <div
          className="
            flex gap-2.5 md:gap-3 md:justify-center
            overflow-x-auto snap-x snap-mandatory scrollbar-hide
            -mx-3 px-3 md:mx-0 md:px-0
          "
        >
          {data.map((b, i) => (
            <Tile key={b.id} block={b} featured={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default PromoBanner;
