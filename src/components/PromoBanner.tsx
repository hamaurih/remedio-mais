import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tag, Sparkles, Pill, Percent, ShoppingBag } from "lucide-react";

export type BlockType = "destaque_grande" | "card_medio" | "card_pequeno" | "banner_completo";
export type ImageMode = "produto_sem_fundo" | "arte_completa";
export type ImagePosition = "direita" | "esquerda" | "centro" | "fundo";
export type ImageSize = "pequeno" | "medio" | "grande";
export type BgColor = "azul_claro" | "vermelho_claro" | "branco" | "personalizado";
export type CtaColor = "vermelho" | "azul" | "amarelo";
export type AnimationType =
  | "none"
  | "float"
  | "slide-in"
  | "soft-zoom"
  | "badge-pulse"
  | "shine"
  | "cta-pulse"
  | "confetti"
  | "hover";

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
  image_mode: ImageMode | "product" | "full_banner" | null;
  cta_text: string | null;
  cta_url: string | null;
  active: boolean;
  block_type?: BlockType | null;
  image_position?: ImagePosition | null;
  image_size?: ImageSize | null;
  show_text?: boolean | null;
  show_price?: boolean | null;
  show_cta?: boolean | null;
  bg_color?: BgColor | null;
  bg_custom?: string | null;
  cta_color?: CtaColor | null;
  animation_type?: AnimationType | null;
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

// ---------- helpers ----------
export function resolveBlockType(b: PromoBlock, index: number): BlockType {
  if (b.block_type) return b.block_type;
  return index === 0 ? "destaque_grande" : "card_medio";
}

export function resolveImageMode(b: PromoBlock): "produto_sem_fundo" | "arte_completa" {
  const m = b.image_mode;
  if (m === "arte_completa" || m === "full_banner") return "arte_completa";
  if (m === "produto_sem_fundo" || m === "product") return "produto_sem_fundo";
  return "produto_sem_fundo";
}

function bgClass(b: PromoBlock) {
  switch (b.bg_color) {
    case "vermelho_claro":
      return "bg-gradient-to-br from-white via-[#ffecec] to-white";
    case "branco":
      return "bg-white";
    case "personalizado":
      return "";
    case "azul_claro":
    default:
      return "bg-gradient-to-br from-white via-[#eef8ff] to-white";
  }
}

function ctaClass(b: PromoBlock) {
  switch (b.cta_color) {
    case "azul":
      return "bg-sky-600 text-white";
    case "amarelo":
      return "bg-amber-400 text-black";
    case "vermelho":
    default:
      return "bg-primary text-primary-foreground";
  }
}

// size: width/height per block_type
function sizeClass(type: BlockType) {
  switch (type) {
    case "destaque_grande":
      return "w-[88%] md:w-[420px] md:flex-[0_0_420px] h-[210px]";
    case "card_medio":
      return "w-[80%] md:w-[250px] md:flex-[0_0_250px] h-[210px]";
    case "card_pequeno":
      return "w-[70%] md:w-[210px] md:flex-[0_0_210px] h-[210px]";
    case "banner_completo":
      return "w-[88%] md:w-[420px] md:flex-[0_0_420px] h-[210px]";
  }
}

function imageSizeStyle(type: BlockType, size: ImageSize | null | undefined) {
  // Defaults by type
  const def: Record<BlockType, { maxH: string; maxW: string }> = {
    destaque_grande: { maxH: "82%", maxW: "48%" },
    card_medio:      { maxH: "70%", maxW: "40%" },
    card_pequeno:    { maxH: "60%", maxW: "36%" },
    banner_completo: { maxH: "100%", maxW: "100%" },
  };
  const base = def[type];
  if (!size || type === "banner_completo") return base;
  const scale = size === "grande" ? 1.1 : size === "pequeno" ? 0.8 : 1;
  const num = (v: string) => parseFloat(v);
  return {
    maxH: `${Math.min(95, num(base.maxH) * scale)}%`,
    maxW: `${Math.min(60, num(base.maxW) * scale)}%`,
  };
}

function imagePosClasses(pos: ImagePosition | null | undefined) {
  switch (pos) {
    case "esquerda":
      return "left-3 bottom-3";
    case "centro":
      return "left-1/2 -translate-x-1/2 bottom-3";
    case "fundo":
      return "inset-0 w-full h-full object-cover !max-w-full !max-h-full";
    case "direita":
    default:
      return "right-3 bottom-3";
  }
}

function textMaxWidth(type: BlockType) {
  switch (type) {
    case "destaque_grande": return "max-w-[52%]";
    case "card_medio": return "max-w-[60%]";
    case "card_pequeno": return "max-w-[62%]";
    case "banner_completo": return "max-w-full";
  }
}

export function resolveAnimation(b: PromoBlock): AnimationType {
  return (b.animation_type as AnimationType) ?? "float";
}

function animClasses(b: PromoBlock) {
  const t = resolveAnimation(b);
  return {
    wrapper: t === "hover" ? "promo-animate-hover" : "",
    img:
      t === "float" ? "promo-animate-float"
      : t === "soft-zoom" ? "promo-animate-soft-zoom"
      : t === "slide-in" ? "promo-animate-slide-in"
      : "",
    badge: t === "badge-pulse" ? "promo-animate-pulse" : "",
    cta: t === "cta-pulse" ? "promo-animate-cta-pulse" : "",
    overlay: t === "shine" ? "shine" : t === "confetti" ? "confetti" : "",
  };
}

function AnimOverlay({ kind }: { kind: string }) {
  if (kind === "shine") return <div className="promo-shine-overlay" aria-hidden />;
  if (kind === "confetti") {
    return (
      <div className="promo-confetti-overlay" aria-hidden>
        <span /><span /><span /><span /><span /><span />
      </div>
    );
  }
  return null;
}

// ---------- inner card ----------
function CardInner({ block, type }: { block: PromoBlock; type: BlockType }) {
  const Icon = variantIcon[block.variant] ?? variantIcon.default;
  const mode = resolveImageMode(block);
  const showText = block.show_text ?? true;
  const showPrice = block.show_price ?? true;
  const showCta = block.show_cta ?? true;
  const hasImage = !!block.image_url;

  const isFeatured = type === "destaque_grande";
  const isSmall = type === "card_pequeno";
  const anim = animClasses(block);

  // banner_completo OR arte_completa: image fills card, text optional overlay
  const fullImage = type === "banner_completo" || mode === "arte_completa";

  if (fullImage && hasImage) {
    return (
      <>
        <img
          src={block.image_url!}
          alt={block.title ?? "Promoção"}
          loading="lazy"
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]",
            anim.img,
          )}
        />
        {showText && (block.title || block.badge_text) && (
          <div className="absolute inset-0 z-10 flex flex-col justify-end p-3 bg-gradient-to-t from-black/60 to-transparent text-white">
            {block.badge_text && (
              <span className={cn("self-start text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 bg-primary text-primary-foreground", anim.badge)}>
                {block.badge_text}
              </span>
            )}
            {block.title && <h3 className="text-sm font-extrabold line-clamp-2">{block.title}</h3>}
          </div>
        )}
        <AnimOverlay kind={anim.overlay} />
      </>
    );
  }

  // produto_sem_fundo layout
  const imgSize = imageSizeStyle(type, block.image_size ?? "medio");
  const imgPosCls = imagePosClasses(block.image_position ?? "direita");

  // text padding
  const padCls = isFeatured ? "p-4" : isSmall ? "p-3" : "p-3.5";

  return (
    <>
      {showText && (
        <div className={cn("relative z-10 flex h-full flex-col", padCls, textMaxWidth(type))}>
          <div className="min-w-0 flex-1 overflow-hidden">
            {block.badge_text && (
              <span className={cn(
                "inline-block max-w-full truncate text-[10px] md:text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1.5 bg-primary text-primary-foreground",
                anim.badge,
              )}>
                {block.badge_text}
              </span>
            )}
            {block.title && (
              <h3 className={cn(
                "font-extrabold leading-tight text-foreground line-clamp-2",
                isFeatured ? "text-[18px] md:text-[20px]" : isSmall ? "text-[12px] md:text-[13px]" : "text-[13px] md:text-[14px]",
              )}>
                {block.title}
              </h3>
            )}
            {block.subtitle && !isSmall && (
              <p className={cn(
                "text-muted-foreground mt-0.5 line-clamp-1",
                isFeatured ? "text-[12px] md:text-[13px]" : "text-[11px] md:text-[12px]",
              )}>
                {block.subtitle}
              </p>
            )}
          </div>

          <div className="mt-auto pt-1.5 space-y-1.5">
            {showPrice && block.new_price != null && (
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
                <div className={cn(
                  "font-extrabold leading-none text-primary",
                  isFeatured ? "text-[24px] md:text-[28px]" : isSmall ? "text-[16px] md:text-[18px]" : "text-[19px] md:text-[21px]",
                )}>
                  {brl(Number(block.new_price))}
                </div>
              </div>
            )}

            {showCta && block.cta_text && (
              <span className={cn(
                "inline-flex w-fit items-center gap-1 font-extrabold uppercase tracking-wide rounded-full shadow-sm whitespace-nowrap",
                ctaClass(block),
                isFeatured ? "text-[11px] md:text-[12px] px-3 py-1" : "text-[10px] md:text-[11px] px-2.5 py-1",
              )}>
                {block.cta_text} →
              </span>
            )}
          </div>
        </div>
      )}

      {hasImage ? (
        <img
          src={block.image_url!}
          alt={block.title ?? "Produto em promoção"}
          loading="lazy"
          style={{ maxHeight: imgSize.maxH, maxWidth: imgSize.maxW }}
          className={cn(
            "pointer-events-none absolute z-0 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)] transition-transform duration-500 group-hover:scale-[1.04]",
            imgPosCls,
          )}
        />
      ) : (
        <div className={cn(
          "absolute right-3 bottom-3 z-0 rounded-2xl bg-gradient-to-br from-sky-50 via-white to-sky-100 border border-sky-100 flex items-center justify-center",
          isFeatured ? "h-20 w-20" : isSmall ? "h-12 w-12" : "h-14 w-14",
        )}>
          <Icon className={cn("text-primary", isFeatured ? "h-10 w-10" : "h-6 w-6")} />
        </div>
      )}
    </>
  );
}

// ---------- preview card (used in admin) ----------
export function PromoBlockPreview({ block, index = 0 }: { block: PromoBlock; index?: number }) {
  const type = resolveBlockType(block, index);
  const styleBg = block.bg_color === "personalizado" && block.bg_custom ? { background: block.bg_custom } : undefined;

  return (
    <div
      style={styleBg}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-sky-100 shadow-sm",
        sizeClass(type),
        styleBg ? "" : bgClass(block),
      )}
    >
      <CardInner block={block} type={type} />
    </div>
  );
}

// ---------- public tile ----------
function Tile({ block, index }: { block: PromoBlock; index: number }) {
  const type = resolveBlockType(block, index);
  const Wrapper: any = block.cta_url ? Link : "div";
  const wrapperProps = block.cta_url ? { to: block.cta_url } : {};
  const styleBg = block.bg_color === "personalizado" && block.bg_custom ? { background: block.bg_custom } : undefined;

  return (
    <Wrapper
      {...wrapperProps}
      aria-label={block.title ?? "Promoção"}
      style={styleBg}
      className={cn(
        "group relative shrink-0 snap-start overflow-hidden rounded-xl border border-sky-100",
        "shadow-[0_2px_8px_rgba(15,40,75,0.08)] hover:shadow-[0_8px_20px_rgba(15,40,75,0.14)]",
        "transition-all hover:-translate-y-0.5",
        sizeClass(type),
        styleBg ? "" : bgClass(block),
      )}
    >
      <CardInner block={block} type={type} />
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
        <div className="flex gap-3 md:gap-3.5 md:justify-center overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-3 px-3 md:mx-0 md:px-0 py-1">
          {data.map((b, i) => (
            <Tile key={b.id} block={b} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default PromoBanner;
