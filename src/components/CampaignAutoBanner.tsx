import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const STYLE_BG: Record<string, string> = {
  light: "from-white to-[#F7F7F8]",
  "soft-pink": "from-[#FFF1F3] to-white",
  "soft-blue": "from-[#EEF4FF] to-white",
  "soft-mint": "from-[#ECFBF3] to-white",
};

export type AutoBannerProduct = {
  id: string;
  name: string;
  slug?: string | null;
  image_url: string | null;
  price?: number | null;
  promo_price?: number | null;
};

interface Props {
  name: string;
  subtitle?: string | null;
  ctaText?: string | null;
  ctaHref?: string | null;
  badge?: string | null;
  visualStyle?: string;
  products?: AutoBannerProduct[];
  compact?: boolean;
}

export function CampaignAutoBanner({
  name,
  subtitle,
  ctaText,
  ctaHref,
  badge,
  visualStyle = "soft-pink",
  products = [],
  compact,
}: Props) {
  const bg = STYLE_BG[visualStyle] ?? STYLE_BG["soft-pink"];
  const picks = products.filter((p) => p.image_url).slice(0, 3);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br shadow-sm",
        bg,
        compact ? "p-4" : "p-5 md:p-6",
      )}
    >
      <div className="absolute -top-16 -left-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row items-stretch gap-4 sm:gap-5">
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {badge && (
            <span className="inline-block self-start bg-primary text-primary-foreground text-[11px] font-bold uppercase px-2.5 py-1 rounded-full mb-2">
              {badge}
            </span>
          )}
          <h3
            className={cn(
              "font-extrabold leading-tight text-foreground break-words",
              compact ? "text-xl md:text-2xl" : "text-2xl md:text-3xl",
            )}
          >
            {name}
          </h3>
          {subtitle && (
            <p
              className={cn(
                "text-muted-foreground mt-2 line-clamp-3",
                compact ? "text-sm" : "text-sm md:text-base",
              )}
            >
              {subtitle}
            </p>
          )}
          {ctaText && (
            <div className="mt-3">
              {ctaHref ? (
                <Link
                  to={ctaHref}
                  className="inline-flex items-center gap-1 bg-primary text-primary-foreground font-bold text-sm px-4 py-2 rounded-full shadow-sm hover:scale-105 transition-transform"
                >
                  {ctaText} →
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground font-bold text-sm px-4 py-2 rounded-full">
                  {ctaText} →
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className={cn(
            "relative shrink-0 w-full sm:w-[42%] md:w-[40%] overflow-hidden",
            compact ? "h-[120px]" : "h-[160px] md:h-[200px]",
          )}
        >
          {picks.length > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 md:gap-3">
              {picks.map((p, i) => (
                <div
                  key={p.id}
                  className={cn(
                    "relative flex-1 h-full flex items-center justify-center min-w-0",
                    i === 1 && picks.length === 3 && "scale-110 z-10",
                  )}
                >
                  <img
                    src={p.image_url!}
                    alt={p.name}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.18)]"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-sm">
              Sem imagem
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
