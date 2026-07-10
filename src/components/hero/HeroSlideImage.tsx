import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface HeroImageSlideData {
  id: string;
  desktop_image_url?: string | null;
  tablet_image_url?: string | null;
  mobile_image_url?: string | null;
  image_url?: string | null;
  background_image_url?: string | null;
  image_alt?: string | null;
  title?: string | null;
  link?: string | null;
  image_fit?: string | null; // cover | contain | left | right | top | bottom
  image_focus?: string | null; // center | left | right | top | bottom | product-right | text-left
}

const FIT_MAP: Record<string, string> = {
  cover: "object-cover",
  contain: "object-contain",
  centralizar: "object-cover",
  left: "object-cover",
  right: "object-cover",
  top: "object-cover",
  bottom: "object-cover",
};

const FOCUS_MAP: Record<string, string> = {
  center: "object-center",
  left: "object-left",
  right: "object-right",
  top: "object-top",
  bottom: "object-bottom",
  "product-right": "object-right",
  "text-left": "object-left",
};

interface Props {
  s: HeroImageSlideData;
  eager?: boolean;
}

export function HeroSlideImage({ s, eager }: Props) {
  const desktop = s.desktop_image_url || s.image_url || s.background_image_url || "";
  const tablet = s.tablet_image_url || desktop;
  const mobile = s.mobile_image_url || tablet || desktop;
  const fit = FIT_MAP[s.image_fit || "cover"] || "object-cover";
  const focus = FOCUS_MAP[s.image_focus || "center"] || "object-center";
  const alt = s.image_alt || s.title || "Banner promocional";

  const Wrapper: any = s.link ? Link : "div";
  const wrapperProps: any = s.link ? { to: s.link } : {};

  return (
    <Wrapper {...wrapperProps} className="block relative h-full w-full bg-muted/30">
      <picture>
        <source media="(min-width: 1024px)" srcSet={desktop} />
        <source media="(min-width: 640px)" srcSet={tablet} />
        <img
          src={mobile}
          alt={alt}
          className={cn("absolute inset-0 w-full h-full", fit, focus)}
          loading={eager ? "eager" : "lazy"}
          {...(eager ? ({ fetchpriority: "high" } as any) : {})}
          decoding="async"
        />
      </picture>
    </Wrapper>
  );
}
