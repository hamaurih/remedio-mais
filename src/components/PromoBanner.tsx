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
  image_mode: "product" | "full_banner" | null;
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

function ProductCard({ block, featured }: { block: PromoBlock; featured?: boolean }) {
  const Icon = variantIcon[block.variant] ?? variantIcon.default;
  const hasImage = !!block.image_url;

  return (
    <div
      className={cn(
        "relative w-full h-full overflow-hidden rounded-xl border border-sky-100",
        "bg-gradient-to-br from-white via-[#eef8ff] to-white",
      )}
    >
      {/* Texto protegido */}
      <div
        className={cn(
          "relative z-10 flex h-full flex-col",
          featured ? "p-4 md:p-5 max-w-[60%]" : "p-3 md:p-3.5 max-w-[60%]",
        )}
      >
        <div className="min-w-0 flex-1">
          {block.badge_text && (
            <span className="inline-block max-w-full text-[10px] md:text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1.5 bg-primary text-primary-foreground">
              {block.badge_text}
            </span>
          )}
          {block.title && (
            <h3
              className={cn(
                "font-extrabold leading-tight text-foreground line-clamp-2",
                featured ? "text-[18px] md:text-[20px]" : "text-[13px] md:text-[14px]",
              )}
            >
              {block.title}
            </h3>
          )}
          {block.subtitle && (
            <p
              className={cn(
                "text-muted-foreground mt-0.5 line-clamp-1",
                featured ? "text-[12px] md:text-[13px]" : "text-[11px] md:text-[12px]",
              )}
            >
              {block.subtitle}
            </p>
          )}
        </div>

        {/* Área fixa para preço + CTA — nunca cortada */}
        <div className="mt-auto pt-1.5 space-y-1.5">
          {block.new_price != null && (
            <div>
              {block.price_suffix && (
                <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground leading-tight truncate">
                  {block.price_suffix}
                </div>
              )}
              {block.old_price != null && (
                <div className="text-[11px] line-through text-muted-foreground leading-none">
                  {brl(Number(block.old_price))}
                </div>
              )}
              <div
                className={cn(
                  "font-extrabold leading-none text-primary",
                  featured ? "text-[26px] md:text-[30px]" : "text-[20px] md:text-[22px]",
                )}
              >
                {brl(Number(block.new_price))}
              </div>
            </div>
          )}

          {block.cta_text && (
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1 bg-primary text-primary-foreground font-extrabold uppercase tracking-wide rounded-full shadow-sm whitespace-nowrap",
                featured ? "text-[11px] md:text-[12px] px-3 py-1" : "text-[10px] md:text-[11px] px-2.5 py-1",
              )}
            >
              {block.cta_text} →
            </span>
          )}
        </div>
      </div>

      {/* Imagem do produto — absolute, não cobre texto */}
      {hasImage ? (
        <img
          src={block.image_url!}
          alt={block.title ?? "Produto em promoção"}
          loading="lazy"
          className={cn(
            "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 z-0 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)]",
            "transition-transform duration-500 group-hover:scale-[1.04]",
            featured ? "max-h-[78%] max-w-[40%]" : "max-h-[72%] max-w-[38%]",
          )}
        />
      ) : (
        <div
          className={cn(
            "absolute right-3 top-1/2 -translate-y-1/2 z-0 rounded-2xl bg-gradient-to-br from-sky-50 via-white to-sky-100 border border-sky-100 flex items-center justify-center",
            featured ? "h-20 w-20 md:h-24 md:w-24" : "h-14 w-14 md:h-16 md:w-16",
          )}
        >
          <Icon className={cn("text-primary", featured ? "h-10 w-10" : "h-7 w-7")} />
        </div>
      )}
    </div>
  );
}


function FullBanner({ block }: { block: PromoBlock }) {
  if (!block.image_url) return <ProductCard block={block} />;
  return (
    <img
      src={block.image_url}
      alt={block.title ?? "Promoção"}
      loading="lazy"
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
    />
  );
}

function Tile({ block, featured }: { block: PromoBlock; featured?: boolean }) {
  const Wrapper: any = block.cta_url ? Link : "div";
  const wrapperProps = block.cta_url ? { to: block.cta_url } : {};
  const mode = block.image_mode === "full_banner" ? "full_banner" : "product";

  return (
    <Wrapper
      {...wrapperProps}
      aria-label={block.title ?? "Promoção"}
      className={cn(
        "group relative shrink-0 snap-start overflow-hidden rounded-xl",
        "shadow-[0_2px_8px_rgba(15,40,75,0.08)] hover:shadow-[0_8px_20px_rgba(15,40,75,0.14)]",
        "transition-all hover:-translate-y-0.5",
        // Mobile widths
        featured ? "w-[86%]" : "w-[80%]",
        // Desktop widths
        featured
          ? "md:w-[400px] md:flex-[0_0_400px]"
          : "md:w-[220px] md:flex-[0_0_220px]",
        // Uniform height
        "h-[200px] md:h-[200px]",
      )}
    >
      {mode === "full_banner" ? <FullBanner block={block} /> : <ProductCard block={block} featured={featured} />}
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
      className="w-full bg-gradient-to-b from-[#eaf7ff] to-white py-5 md:py-6 border-b border-sky-100"
    >
      <div className="container">
        <div
          className="
            flex gap-3 md:gap-3.5 md:justify-center
            overflow-x-auto snap-x snap-mandatory scrollbar-hide
            -mx-3 px-3 md:mx-0 md:px-0
            py-1
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
