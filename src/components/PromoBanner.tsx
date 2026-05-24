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

const variantBg: Record<string, string> = {
  anniversary: "bg-gradient-to-br from-primary to-primary-dark",
  "leve-pague": "bg-gradient-to-br from-primary-dark to-primary",
  default: "bg-gradient-to-b from-primary to-primary-dark",
  "desconto-2": "bg-gradient-to-tr from-primary-dark to-primary",
  generico: "bg-gradient-to-br from-[#7a0a0a] to-primary-dark",
};

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[
        { c: "bg-yellow-400", t: "8%", l: "10%" },
        { c: "bg-white", t: "20%", l: "80%" },
        { c: "bg-yellow-400", t: "60%", l: "15%" },
        { c: "bg-white", t: "75%", l: "70%" },
        { c: "bg-yellow-400", t: "40%", l: "90%" },
        { c: "bg-white", t: "85%", l: "40%" },
      ].map((d, i) => (
        <span
          key={i}
          className={cn("absolute h-1.5 w-1.5 rounded-full opacity-80", d.c)}
          style={{ top: d.t, left: d.l }}
        />
      ))}
    </div>
  );
}

function PriceBlock({ block }: { block: PromoBlock }) {
  if (block.new_price == null) return null;
  return (
    <div className="mt-1">
      {block.price_suffix && (
        <div className="text-[10px] uppercase tracking-wider opacity-80">
          {block.price_suffix}
        </div>
      )}
      {block.old_price != null && (
        <div className="text-xs line-through opacity-70">
          {brl(Number(block.old_price))}
        </div>
      )}
      <div className="text-2xl md:text-3xl font-extrabold leading-none text-yellow-400 drop-shadow">
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
        "snap-start shrink-0 w-[78%] sm:w-[45%] md:w-auto md:flex-1 min-h-[180px] md:min-h-[200px]",
        "relative overflow-hidden p-4 text-primary-foreground flex flex-col justify-between",
        "md:border-r md:border-white/15 last:border-r-0",
        "transition-transform hover:scale-[1.01]",
        bg,
      )}
    >
      {block.variant === "anniversary" && <Confetti />}

      <div className="relative flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {block.badge_text && (
            <span
              className={cn(
                "inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full mb-1.5",
                block.variant === "anniversary"
                  ? "bg-yellow-400 text-primary-dark text-xs px-2.5 py-1"
                  : "bg-white/20 backdrop-blur",
              )}
            >
              {block.badge_text}
            </span>
          )}
          {block.title && (
            <h3 className="font-extrabold text-sm md:text-base leading-tight line-clamp-2">
              {block.title}
            </h3>
          )}
          {block.subtitle && (
            <p className="text-[11px] opacity-85 mt-0.5 line-clamp-2">
              {block.subtitle}
            </p>
          )}
          <PriceBlock block={block} />
        </div>

        {block.image_url && (
          <img
            src={block.image_url}
            alt={block.title ?? "Promoção"}
            loading="lazy"
            className="h-20 w-20 md:h-24 md:w-24 object-contain drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)] shrink-0"
          />
        )}
      </div>

      {block.cta_text && (
        <span className="relative inline-flex w-fit items-center gap-1 mt-3 bg-yellow-400 text-primary-dark font-extrabold text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full shadow">
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
      className="w-full bg-primary border-y border-primary-dark/40"
    >
      <div
        className="
          flex md:grid md:grid-cols-5
          overflow-x-auto md:overflow-visible
          snap-x snap-mandatory scrollbar-hide
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
