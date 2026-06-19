import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import heroImg from "@/assets/hero-pharmacy.jpg";

export type HeroBackground = "light" | "soft-pink" | "soft-blue" | "soft-mint";
export type BannerType = "image" | "auto_product" | "campaign_pro";
export type VisualStyle =
  | "light"
  | "red-soft"
  | "yellow-offer"
  | "wine-premium"
  | "blue-health"
  | "beige-health"
  | "light-neutral";
export type AnimationType = "none" | "float" | "shine" | "slide-in" | "zoom" | "confetti";
export type ProductSize = "small" | "medium" | "large" | "xlarge";

export type HeroSlide = {
  id: string;
  // legacy/common
  title?: string | null;
  subtitle?: string | null;
  cta_text?: string | null;
  link?: string | null;
  image_url?: string | null;
  mobile_image_url?: string | null;
  badge_text?: string | null;
  discount_text?: string | null;
  price_text?: string | null;
  old_price?: number | string | null;
  new_price?: number | string | null;
  product_image_url?: string | null;
  background_image_url?: string | null;
  background_style?: HeroBackground | null;

  // new fields
  banner_type?: BannerType | null;
  published?: boolean | null;
  support_text?: string | null;
  legal_text?: string | null;
  discount_percent?: number | null;
  discount_prefix?: string | null;
  discount_suffix?: string | null;
  background_color?: string | null;
  accent_color?: string | null;
  button_color?: string | null;
  product_position?: "left" | "center" | "right" | null;
  text_position?: "left" | "center" | "right" | null;
  visual_style?: VisualStyle | null;
  linked_entity_type?: "product" | "category" | "campaign" | "manual" | null;
  linked_entity_slug?: string | null;
  animation_type?: AnimationType | null;
  show_text_over_image?: boolean | null;
  image_fit?: "cover" | "contain" | null;
  start_date?: string | null;
  end_date?: string | null;
  product_size?: ProductSize | null;
  show_side_shapes?: boolean | null;
  side_shapes_color?: string | null;
  side_shapes_size?: "small" | "medium" | "large" | null;
  background_intensity?: "off" | "xsoft" | "soft" | "medium" | null;
  title_font?: string | null;
  title_color?: string | null;
  support_color?: string | null;
  legal_color?: string | null;
  title_size?: string | null; // 'sm' | 'md' | 'lg' | 'xl'
};

export const TITLE_FONTS: Record<string, string> = {
  default: "",
  inter: "'Inter', system-ui, sans-serif",
  poppins: "'Poppins', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  oswald: "'Oswald', sans-serif",
  "bebas-neue": "'Bebas Neue', sans-serif",
  "playfair-display": "'Playfair Display', serif",
  "dm-serif-display": "'DM Serif Display', serif",
  archivo: "'Archivo Black', sans-serif",
};

const TITLE_SIZE_FLUID: Record<string, string> = {
  sm: "clamp(1.6rem, 2.6vw, 2.1rem)",
  md: "clamp(1.9rem, 3vw, 2.5rem)",
  lg: "clamp(2.1rem, 3.4vw, 2.9rem)",
  xl: "clamp(2.4rem, 3.8vw, 3.2rem)",
};

const SHAPE_SIZE: Record<string, string> = {
  small:  "w-[90px] md:w-[110px]",
  medium: "w-[120px] md:w-[150px]",
  large:  "w-[150px] md:w-[200px]",
};

const BG_INTENSITY: Record<string, number> = {
  off: 0,
  xsoft: 0.08,
  soft: 0.14,
  medium: 0.22,
};

const FALLBACK: HeroSlide[] = [
  {
    id: "f1",
    banner_type: "campaign_pro",
    title: "Abasteça sua farmacinha",
    support_text: "Cuidado completo para sua saúde",
    legal_text: "Promoção válida enquanto durarem os estoques.",
    discount_prefix: "com até",
    discount_percent: 50,
    discount_suffix: "de desconto",
    cta_text: "confira",
    link: "/categoria/ofertas",
    visual_style: "red-soft",
    text_position: "left",
    product_position: "center",
    animation_type: "float",
    product_size: "large",
    show_side_shapes: true,
  },
];

export const VISUAL_STYLES: Record<VisualStyle, { bg: string; accent: string; text: string; button: string; legal: string; shape: string }> = {
  light:           { bg: "bg-gradient-to-br from-white via-white to-[#FAFAFA]",         accent: "text-primary",   text: "text-foreground", button: "bg-primary text-primary-foreground hover:bg-primary/90", legal: "text-muted-foreground", shape: "bg-primary/20" },
  "light-neutral": { bg: "bg-gradient-to-br from-[#FAFAFA] via-white to-[#F1F1F1]",     accent: "text-primary",   text: "text-foreground", button: "bg-primary text-primary-foreground hover:bg-primary/90", legal: "text-muted-foreground", shape: "bg-primary/15" },
  "red-soft":      { bg: "bg-gradient-to-br from-[#FFF5F6] via-white to-[#FFE4E8]",      accent: "text-primary",   text: "text-foreground", button: "bg-primary text-primary-foreground hover:bg-primary/90", legal: "text-muted-foreground", shape: "bg-[#E5253E]/85" },
  "beige-health":  { bg: "bg-gradient-to-br from-[#FBF6EE] via-[#FDF8F0] to-[#F1E6D2]", accent: "text-[#B8410D]", text: "text-[#3A2A1A]",  button: "bg-[#B8410D] text-white hover:bg-[#9c3709]",            legal: "text-[#7a4a00]",        shape: "bg-[#B8410D]/80" },
  "yellow-offer":  { bg: "bg-gradient-to-br from-[#FFF8DB] via-[#FFFBEA] to-[#FFE9A8]", accent: "text-[#B8410D]", text: "text-foreground", button: "bg-[#B8410D] text-white hover:bg-[#9c3709]",            legal: "text-[#7a4a00]",        shape: "bg-[#B8410D]/80" },
  "wine-premium":  { bg: "bg-gradient-to-br from-[#3A0F1A] via-[#4A1322] to-[#2A0A14]", accent: "text-[#F5C46B]", text: "text-white",      button: "bg-[#F5C46B] text-[#3A0F1A] hover:bg-[#e3b258]",         legal: "text-white/70",         shape: "bg-[#F5C46B]/40" },
  "blue-health":   { bg: "bg-gradient-to-br from-[#E6F1FF] via-white to-[#CFE3FF]",      accent: "text-[#0A4DA2]", text: "text-foreground", button: "bg-[#0A4DA2] text-white hover:bg-[#083d83]",             legal: "text-muted-foreground", shape: "bg-[#0A4DA2]/80" },
};

const ANIM_PRODUCT: Record<AnimationType, string> = {
  none: "",
  float: "promo-animate-float",
  shine: "",
  "slide-in": "promo-animate-slide-in",
  zoom: "promo-animate-soft-zoom",
  confetti: "promo-animate-float",
};

const PRODUCT_SIZE: Record<ProductSize, { desk: string; mob: string }> = {
  small:  { desk: "max-h-[55%] max-w-[90%]", mob: "max-h-[140px]" },
  medium: { desk: "max-h-[65%] max-w-[95%]", mob: "max-h-[160px]" },
  large:  { desk: "max-h-[75%] max-w-[100%]", mob: "max-h-[180px]" },
  xlarge: { desk: "max-h-[85%] max-w-[100%]", mob: "max-h-[200px]" },
};

function resolveLink(s: HeroSlide): string {
  if (s.link) return s.link;
  if (s.linked_entity_slug) {
    if (s.linked_entity_type === "campaign") return `/campanha/${s.linked_entity_slug}`;
    if (s.linked_entity_type === "category") return `/categoria/${s.linked_entity_slug}`;
    if (s.linked_entity_type === "product")  return `/produto/${s.linked_entity_slug}`;
  }
  return "/";
}

function isWithinDates(s: HeroSlide): boolean {
  const now = Date.now();
  if (s.start_date && new Date(s.start_date).getTime() > now) return false;
  if (s.end_date && new Date(s.end_date).getTime() < now) return false;
  return true;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const textAlignClass = (pos?: string | null) =>
  pos === "center" ? "items-center text-center" : pos === "right" ? "items-end text-right" : "items-start text-left";

export function HeroSlide({ s }: { s: HeroSlide }) {
  const type: BannerType = (s.banner_type as BannerType) || "image";
  const style = VISUAL_STYLES[(s.visual_style as VisualStyle) || "red-soft"];
  const anim = (s.animation_type as AnimationType) || "none";
  const productImg = s.product_image_url || s.image_url || heroImg;
  const link = resolveLink(s);

  // 1) Imagem completa
  if (type === "image") {
    const fit = s.image_fit === "contain" ? "object-contain" : "object-cover";
    return (
      <Link to={link} className="block relative h-full w-full">
        {(s.image_url || s.background_image_url) && (
          <img
            src={s.image_url || s.background_image_url || ""}
            alt={s.title || "Banner"}
            className={cn("absolute inset-0 w-full h-full", fit, anim === "zoom" && "promo-animate-soft-zoom")}
          />
        )}
        {s.show_text_over_image && (s.title || s.subtitle || s.cta_text) && (
          <div className={cn("absolute inset-0 flex flex-col justify-center p-6 md:p-10 bg-gradient-to-r from-black/50 via-black/20 to-transparent text-white", textAlignClass(s.text_position))}>
            {s.title && <h2 className="text-2xl md:text-4xl font-extrabold drop-shadow-lg max-w-2xl">{s.title}</h2>}
            {s.subtitle && <p className="mt-2 text-sm md:text-base max-w-md drop-shadow">{s.subtitle}</p>}
            {s.cta_text && (
              <Button asChild size="lg" className="mt-4 font-bold shadow-lg" style={s.button_color ? { backgroundColor: s.button_color } : undefined}>
                <span>{s.cta_text}</span>
              </Button>
            )}
          </div>
        )}
      </Link>
    );
  }

  // 3) Campanha profissional — also used as visual layout for auto_product
  const discount = s.discount_percent;
  const customBg = s.background_color ? { backgroundColor: s.background_color } : undefined;
  const customAccent = s.accent_color ? { color: s.accent_color } : undefined;
  const customBtn = s.button_color ? { backgroundColor: s.button_color } : undefined;
  const productSize = PRODUCT_SIZE[(s.product_size as ProductSize) || "large"];
  const showShapes = s.show_side_shapes !== false;
  const shapeStyle = s.side_shapes_color ? { backgroundColor: s.side_shapes_color } : undefined;
  const shapeSize = SHAPE_SIZE[(s.side_shapes_size as string) || "medium"];
  const bgIntensity = BG_INTENSITY[(s.background_intensity as string) ?? "xsoft"] ?? 0.08;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", !s.background_color && style.bg)} style={customBg}>
      {s.background_image_url && bgIntensity > 0 && (
        <img
          src={s.background_image_url}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover blur-[2px]"
          style={{ opacity: bgIntensity }}
        />
      )}

      {/* Side decorative organic shapes (behind content) */}
      {showShapes && (
        <>
          <div
            aria-hidden
            style={shapeStyle}
            className={cn(
              "pointer-events-none absolute -left-12 md:-left-16 top-1/2 -translate-y-1/2 h-[160%] z-0 rounded-[100%] opacity-90",
              shapeSize,
              !s.side_shapes_color && style.shape,
            )}
          />
          <div
            aria-hidden
            style={shapeStyle}
            className={cn(
              "pointer-events-none absolute -right-12 md:-right-16 top-1/2 -translate-y-1/2 h-[160%] z-0 rounded-[100%] opacity-90",
              shapeSize,
              !s.side_shapes_color && style.shape,
            )}
          />
        </>
      )}

      {/* Soft glow halo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 right-1/4 h-72 w-72 rounded-full bg-white/40 blur-3xl" />
      </div>

      {anim === "shine" && <div className="promo-shine-overlay absolute inset-0 pointer-events-none z-0" />}
      {anim === "confetti" && (
        <div className="promo-confetti-overlay z-0">
          <span /><span /><span /><span /><span /><span />
        </div>
      )}

      {/* Desktop layout: 32% | 38% | 30% */}
      <div
        className="hidden md:grid relative h-full items-center gap-4 lg:gap-6 px-12 lg:px-16 pb-6"
        style={{ gridTemplateColumns: "32% 38% 30%" }}
      >
        {/* LEFT: tagline */}
        <div className={cn("z-10 flex flex-col justify-center min-w-0 max-w-[360px]", textAlignClass(s.text_position || "left"), style.text)}>
          {s.badge_text && (
            <span className="inline-flex items-center self-start bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-[0.12em] px-3 py-1 rounded-full mb-2 shadow-sm">
              {s.badge_text}
            </span>
          )}
          {s.title && (
            <h2
              className="font-extrabold tracking-tight break-words"
              style={{
                fontFamily: s.title_font && s.title_font !== "default" ? TITLE_FONTS[s.title_font] : undefined,
                color: s.title_color || undefined,
                fontSize: TITLE_SIZE_FLUID[s.title_size || "lg"],
                lineHeight: 1.0,
              }}
            >
              {s.title}
            </h2>
          )}
          {s.subtitle && (
            <p className="mt-3 opacity-80" style={{ fontSize: "clamp(0.8rem, 1.1vw, 1rem)", color: s.support_color || undefined }}>
              {s.subtitle}
            </p>
          )}
          {s.support_text && (
            <p className="mt-2 font-medium opacity-90" style={{ fontSize: "clamp(0.8rem, 1.1vw, 1rem)", color: s.support_color || undefined }}>
              {s.support_text}
            </p>
          )}
          {/* CTA stays here when there is no discount */}
          {discount == null && s.cta_text && (
            <Button
              asChild
              className={cn("mt-4 self-start font-bold uppercase tracking-wider rounded-full shadow-md h-12 px-8", !s.button_color && style.button)}
              style={customBtn}
            >
              <Link to={link}>{s.cta_text}</Link>
            </Button>
          )}
        </div>

        {/* CENTER: product */}
        <div className="relative z-[5] h-full flex items-center justify-center min-w-0">
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 h-4 w-[60%] rounded-[50%] bg-foreground/20 blur-2xl" />
          <img
            src={productImg}
            alt={s.title || "Produto"}
            className={cn(
              "relative object-contain drop-shadow-[0_24px_24px_rgba(0,0,0,0.25)] max-w-full",
              ANIM_PRODUCT[anim],
            )}
            style={{ maxHeight: "75%" }}
          />
        </div>

        {/* RIGHT: discount + CTA */}
        <div className="z-10 flex flex-col items-center justify-center text-center min-w-0">
          {discount != null ? (
            <>
              {s.discount_prefix && (
                <div
                  className={cn("font-semibold uppercase tracking-wider leading-none", style.accent)}
                  style={{ ...customAccent, fontSize: "clamp(0.7rem, 1vw, 0.9rem)" }}
                >
                  {s.discount_prefix}
                </div>
              )}
              <div className={cn("font-extrabold leading-none tracking-tight mt-1", style.accent)} style={customAccent}>
                <span style={{ fontSize: "clamp(3.2rem, 6.5vw, 5.5rem)" }}>{discount}</span>
                <span className="align-top" style={{ fontSize: "clamp(1.6rem, 3vw, 2.5rem)" }}>%</span>
              </div>
              {s.discount_suffix && (
                <div
                  className={cn("font-semibold uppercase tracking-wider mt-1", style.accent)}
                  style={{ ...customAccent, fontSize: "clamp(0.7rem, 1vw, 0.9rem)" }}
                >
                  {s.discount_suffix}
                </div>
              )}
              {s.cta_text && (
                <Button
                  asChild
                  className={cn("mt-4 font-bold uppercase tracking-wider rounded-full shadow-md h-12 px-8", !s.button_color && style.button)}
                  style={customBtn}
                >
                  <Link to={link}>{s.cta_text}</Link>
                </Button>
              )}
            </>
          ) : s.new_price != null ? (
            <div className={cn("font-extrabold", style.accent)} style={{ ...customAccent, fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>{brl(Number(s.new_price))}</div>
          ) : null}
        </div>

        {/* Legal text — bottom right */}
        {s.legal_text && (
          <p
            className={cn("absolute bottom-2 right-6 leading-tight text-right opacity-70 z-10", style.legal)}
            style={{ maxWidth: "260px", fontSize: "clamp(9px, 0.8vw, 11px)", color: s.legal_color || undefined }}
          >
            {s.legal_text}
          </p>
        )}
      </div>

      {/* Mobile layout */}
      <div className="md:hidden relative h-full min-h-[420px] flex flex-col items-center text-center px-5 py-5 gap-3">
        <div className={cn("w-full flex flex-col items-center", style.text)}>
          {s.title && (
            <h2
              className="font-extrabold leading-tight"
              style={{
                fontFamily: s.title_font && s.title_font !== "default" ? TITLE_FONTS[s.title_font] : undefined,
                color: s.title_color || undefined,
                fontSize: "clamp(1.4rem, 6vw, 2rem)",
              }}
            >
              {s.title}
            </h2>
          )}
          {s.support_text && <p className="text-xs mt-1 opacity-80" style={{ color: s.support_color || undefined }}>{s.support_text}</p>}
        </div>

        <div className="flex-1 flex items-center justify-center w-full">
          <img
            src={productImg}
            alt={s.title || "Produto"}
            className={cn("object-contain drop-shadow-xl max-h-[180px] w-auto", ANIM_PRODUCT[anim])}
          />
        </div>

        <div className="flex flex-col items-center w-full">
          {discount != null && (
            <div className={cn("flex items-end gap-1 font-extrabold leading-none", style.accent)} style={customAccent}>
              {s.discount_prefix && <span className="text-[10px] uppercase tracking-wider self-end mb-1">{s.discount_prefix}</span>}
              <span className="text-5xl">{discount}</span>
              <span className="text-xl mb-1">%</span>
              {s.discount_suffix && <span className="text-[10px] uppercase tracking-wider self-end mb-1">{s.discount_suffix}</span>}
            </div>
          )}
          {s.cta_text && (
            <Button
              asChild
              size="sm"
              className={cn("mt-2 font-bold uppercase tracking-wider rounded-full px-6", !s.button_color && style.button)}
              style={customBtn}
            >
              <Link to={link}>{s.cta_text}</Link>
            </Button>
          )}
          {s.legal_text && <p className={cn("mt-2 text-[10px] leading-tight max-w-[34ch]", style.legal)} style={{ color: s.legal_color || undefined }}>{s.legal_text}</p>}
        </div>
      </div>
    </div>
  );
}

export function HeroSlider({ slides }: { slides?: HeroSlide[] }) {
  const filtered = (slides || []).filter((s) => s.published !== false && isWithinDates(s));
  const data = filtered.length > 0 ? filtered : FALLBACK;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || data.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % data.length), 6000);
    return () => clearInterval(t);
  }, [paused, data.length]);

  const [touchX, setTouchX] = useState<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => setTouchX(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) setIdx((i) => (i + (dx < 0 ? 1 : -1) + data.length) % data.length);
    setTouchX(null);
  };

  return (
    <section
      className="relative overflow-hidden border border-border md:rounded-2xl md:mx-4 lg:mx-auto lg:container md:my-3 shadow-sm bg-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative w-full h-[440px] md:h-[clamp(300px,38vw,440px)]">

        {data.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "absolute inset-0 transition-all duration-700 ease-out",
              i === idx ? "opacity-100 translate-x-0" : "opacity-0 pointer-events-none",
              i < idx && "-translate-x-4",
              i > idx && "translate-x-4",
            )}
            aria-hidden={i !== idx}
          >
            <HeroSlide s={s} />
          </div>
        ))}

        {data.length > 1 && (
          <>
            <button
              aria-label="Anterior"
              onClick={() => setIdx((i) => (i - 1 + data.length) % data.length)}
              className="flex absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 bg-background/90 backdrop-blur text-primary rounded-full h-9 w-9 sm:h-10 sm:w-10 items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.15)] opacity-80 hover:opacity-100 hover:scale-105 transition-all z-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              aria-label="Próximo"
              onClick={() => setIdx((i) => (i + 1) % data.length)}
              className="flex absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 bg-background/90 backdrop-blur text-primary rounded-full h-9 w-9 sm:h-10 sm:w-10 items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.15)] opacity-80 hover:opacity-100 hover:scale-105 transition-all z-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
              {data.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    i === idx ? "bg-primary w-7" : "bg-muted-foreground/30 w-2 hover:bg-muted-foreground/60",
                  )}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
