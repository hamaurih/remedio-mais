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

const variantBg: Record<string, string> = {
  anniversary: "bg-gradient-to-br from-[#FFF1F3] via-white to-white border border-primary/15",
  "leve-pague": "bg-gradient-to-br from-white to-[#FFF7F8] border border-border",
  default: "bg-gradient-to-br from-white to-[#FFF5F6] border border-border",
  "desconto-2": "bg-gradient-to-br from-[#FFF5F6] to-white border border-primary/10",
  generico: "bg-gradient-to-br from-white to-[#F7FAFF] border border-border",
};

const variantIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  anniversary: Sparkles,
  "leve-pague": ShoppingBag,
  "desconto-2": Percent,
  generico: Pill,
  default: Tag,
};

function PriceBlock({ block }: { block: PromoBlock }) {
  if (block.new_price == null) return null;
  return (
    <div className="mt-1">
      {block.price_suffix && (
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {block.price_suffix}
        </div>
      )}
      {block.old_price != null && (
        <div className="text-xs line-through text-muted-foreground">
          {brl(Number(block.old_price))}
        </div>
      )}
      <div className="text-2xl md:text-3xl font-extrabold leading-none text-primary">
        {brl(Number(block.new_price))}
      </div>
    </div>
  );
}

function Block({ block }: { block: PromoBlock }) {
  const bg = variantBg[block.variant] ?? variantBg.default;
  const Icon = variantIcon[block.variant] ?? variantIcon.default;
  const Wrapper: any = block.cta_url ? Link : "div";
  const wrapperProps = block.cta_url ? { to: block.cta_url } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "snap-start shrink-0 w-[78%] sm:w-[45%] md:w-auto md:flex-1 min-h-[200px] md:min-h-[220px]",
        "group relative overflow-hidden p-4 text-foreground flex flex-col justify-between",
        "rounded-xl md:rounded-none md:border-r md:border-y-0 md:border-l-0",
        "transition-all hover:shadow-md hover:-translate-y-0.5",
        bg,
      )}
    >
      {/* Subtle decor */}
      <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-primary/[0.06] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-primary/[0.05] blur-2xl" />

      <div className="relative flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {block.badge_text && (
            <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1.5 bg-primary text-primary-foreground">
              {block.badge_text}
            </span>
          )}
          {block.title && (
            <h3 className="font-extrabold text-sm md:text-base leading-tight line-clamp-2 text-foreground">
              {block.title}
            </h3>
          )}
          {block.subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
              {block.subtitle}
            </p>
          )}
          <PriceBlock block={block} />
        </div>

        <div className="relative shrink-0">
          {block.image_url ? (
            <>
              <div className="absolute inset-x-1 bottom-1 h-2 rounded-full bg-foreground/10 blur-[6px]" />
              <img
                src={block.image_url}
                alt={block.title ?? "Promoção"}
                loading="lazy"
                className="relative h-20 w-20 md:h-24 md:w-24 object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.18)] transition-transform group-hover:scale-105"
              />
            </>
          ) : (
            <div className="relative h-20 w-20 md:h-24 md:w-24 rounded-2xl bg-gradient-to-br from-primary/10 via-white to-primary/5 border border-primary/10 flex items-center justify-center">
              <Icon className="h-9 w-9 text-primary/70" />
            </div>
          )}
        </div>
      </div>

      <span
        className={cn(
          "relative inline-flex w-fit items-center gap-1 mt-3 font-extrabold text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full",
          block.cta_url
            ? "bg-primary text-primary-foreground shadow-sm group-hover:shadow-md"
            : "bg-primary/10 text-primary",
        )}
      >
        {block.cta_text || "Ver oferta"} →
      </span>
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
      className="w-full bg-gradient-to-b from-white to-[#FFF5F6] border-y border-border"
    >
      <div
        className="
          flex md:grid md:grid-cols-5 gap-3 md:gap-0
          overflow-x-auto md:overflow-visible
          snap-x snap-mandatory scrollbar-hide
          px-3 md:px-0 py-3 md:py-0
        "
      >
        {data.map((b) => (
          <Block key={b.id} block={b} />
        ))}
      </div>
    </section>
  );
}

export default PromoBanner;
