import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

// Alternating soft backgrounds — red is now an accent, not the base.
const variantBg: Record<string, string> = {
  anniversary:
    "bg-gradient-to-br from-[#FFF1F3] to-white border border-primary/15",
  "leve-pague":
    "bg-white border border-border",
  default:
    "bg-gradient-to-b from-white to-[#FFF5F6] border border-border",
  "desconto-2":
    "bg-[#FFF5F6] border border-primary/10",
  generico:
    "bg-white border border-border",
};

function SoftDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-primary/[0.06] blur-2xl" />
    </div>
  );
}

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
  const Wrapper: any = block.cta_url ? Link : "div";
  const wrapperProps = block.cta_url ? { to: block.cta_url } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "snap-start shrink-0 w-[78%] sm:w-[45%] md:w-auto md:flex-1 min-h-[190px] md:min-h-[210px]",
        "relative overflow-hidden p-4 text-foreground flex flex-col justify-between",
        "rounded-xl md:rounded-none md:border-r md:border-y-0 md:border-l-0 md:first:border-l-0",
        "transition-all hover:shadow-md hover:-translate-y-0.5",
        bg,
      )}
    >
      <SoftDecor />

      <div className="relative flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {block.badge_text && (
            <span className="inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full mb-1.5 bg-primary text-primary-foreground">
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

        {block.image_url && (
          <div className="relative shrink-0">
            <div className="absolute inset-x-1 bottom-1 h-2 rounded-full bg-foreground/10 blur-[6px]" />
            <img
              src={block.image_url}
              alt={block.title ?? "Promoção"}
              loading="lazy"
              className="relative h-20 w-20 md:h-24 md:w-24 object-contain drop-shadow-[0_6px_8px_rgba(0,0,0,0.15)]"
            />
          </div>
        )}
      </div>

      {block.cta_text && (
        <span className="relative inline-flex w-fit items-center gap-1 mt-3 bg-primary text-primary-foreground font-extrabold text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full shadow-sm">
          {block.cta_text} →
        </span>
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
