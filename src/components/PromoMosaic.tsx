import { useStorefrontTenant } from "@/hooks/useStorefrontTenant";
import { selectStorefrontRows, storefrontQueryKey } from "@/lib/storefrontQuery";
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
  // New link fields
  link_type?: "product" | "category" | "campaign" | "manual";
  product_id?: string | null;
  category_id?: string | null;
  campaign_id?: string | null;
  image_source?: "auto" | "upload" | "manual";
  custom_image_url?: string | null;
  manual_link?: string | null;
  badge_preset?: string | null;
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

type ResolvedTile = MosaicTile & {
  _resolvedTitle: string | null;
  _resolvedSubtitle: string | null;
  _resolvedImage: string | null;
  _resolvedLink: string | null;
  _resolvedBadge: string | null;
};

function autoBadgeFromProduct(p: any): string | null {
  if (!p) return null;
  if (p.on_sale) return "Oferta";
  if (p.controlled) return "Controlado";
  if (p.requires_prescription) return "Receita";
  return null;
}

export function resolveTile(
  tile: MosaicTile,
  refs: { products: Record<string, any>; categories: Record<string, any>; campaigns: Record<string, any> },
): ResolvedTile {
  const t = tile.link_type || "manual";
  let entity: any = null;
  let autoLink: string | null = null;
  let autoBadge: string | null = null;
  let autoImage: string | null = null;
  let autoTitle: string | null = null;
  let autoSubtitle: string | null = null;

  if (t === "product" && tile.product_id) {
    entity = refs.products[tile.product_id];
    if (entity) {
      autoTitle = entity.name;
      autoSubtitle = entity.laboratory || entity.category_name || entity.short_description || null;
      autoImage = entity.image_url;
      autoLink = entity.slug ? `/produto/${entity.slug}` : null;
      autoBadge = autoBadgeFromProduct(entity);
    }
  } else if (t === "category" && tile.category_id) {
    entity = refs.categories[tile.category_id];
    if (entity) {
      autoTitle = entity.name;
      autoSubtitle = entity.description || null;
      autoImage = entity.image_url;
      autoLink = entity.slug ? `/categoria/${entity.slug}` : null;
      autoBadge = "Categoria";
    }
  } else if (t === "campaign" && tile.campaign_id) {
    entity = refs.campaigns[tile.campaign_id];
    if (entity) {
      autoTitle = entity.name;
      autoSubtitle = entity.subtitle || null;
      autoImage = entity.banner_image_url;
      autoLink = entity.slug ? `/campanha/${entity.slug}` : null;
      autoBadge = "Campanha";
    }
  }

  return {
    ...tile,
    _resolvedTitle: tile.title || autoTitle,
    _resolvedSubtitle: tile.subtitle || autoSubtitle,
    _resolvedImage:
      tile.image_source === "manual"
        ? tile.custom_image_url || tile.image_url
        : tile.image_source === "upload"
        ? tile.custom_image_url || tile.image_url
        : tile.image_url || autoImage,
    _resolvedLink: tile.manual_link || tile.link || autoLink,
    _resolvedBadge: tile.badge_text || tile.badge_preset || autoBadge,
  };
}

function TileCard({ tile, large }: { tile: ResolvedTile; large?: boolean }) {
  const bg = BG[tile.bg_style] ?? BG["soft-pink"];
  const Icon = defaultIconFor(tile._resolvedTitle);
  const href = tile._resolvedLink;
  const Wrapper: any = href ? Link : "div";
  const wrapperProps = href ? { to: href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        bg,
        "rounded-2xl flex flex-col justify-between overflow-hidden relative shadow-sm hover:shadow-md transition-all duration-300 group",
        large ? "p-6 col-span-2 row-span-2" : "p-5 hover:-translate-y-0.5",
      )}
    >
      <div className="absolute -top-16 -left-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />

      {tile._resolvedImage ? (
        <div
          className={cn(
            "absolute -right-2 -bottom-2 pointer-events-none",
            large ? "h-44 w-44 md:h-56 md:w-56" : "h-28 w-28",
          )}
        >
          <div className="absolute inset-x-3 bottom-2 h-2 rounded-full bg-foreground/10 blur-md" />
          <img
            src={tile._resolvedImage}
            alt={tile._resolvedTitle ?? ""}
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
        {tile._resolvedBadge && (
          <span className="inline-block bg-primary text-primary-foreground text-[11px] font-bold uppercase px-2.5 py-1 rounded-full">
            {tile._resolvedBadge}
          </span>
        )}
        {tile._resolvedTitle && (
          <h3
            className={cn(
              "mt-2 font-extrabold leading-tight text-foreground",
              large ? "text-3xl lg:text-4xl" : "text-lg",
            )}
          >
            {tile._resolvedTitle}
          </h3>
        )}
        {tile._resolvedSubtitle && (
          <p className={cn("text-muted-foreground mt-1", large ? "" : "text-sm")}>
            {tile._resolvedSubtitle}
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

function useRefs(tiles: MosaicTile[]) {
  const storefront = useStorefrontTenant();
  const productIds = Array.from(
    new Set(tiles.filter((t) => t.link_type === "product" && t.product_id).map((t) => t.product_id!)),
  );
  const categoryIds = Array.from(
    new Set(tiles.filter((t) => t.link_type === "category" && t.category_id).map((t) => t.category_id!)),
  );
  const campaignIds = Array.from(
    new Set(tiles.filter((t) => t.link_type === "campaign" && t.campaign_id).map((t) => t.campaign_id!)),
  );

  const { data: products } = useQuery({
    queryKey: storefrontQueryKey(storefront, ["mosaic_refs_products", productIds.sort().join(",")]),
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data } = await selectStorefrontRows("products", 
          "id,name,slug,image_url,short_description,laboratory,category_name,on_sale,requires_prescription,controlled,price,promo_price",
        , storefront)
        .in("id", productIds);
      return data || [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: storefrontQueryKey(storefront, ["mosaic_refs_categories", categoryIds.sort().join(",")]),
    enabled: categoryIds.length > 0,
    queryFn: async () => {
      const { data } = await selectStorefrontRows("categories", "id,name,slug,image_url,description", storefront)
        .in("id", categoryIds);
      return data || [];
    },
  });

  const { data: campaigns } = useQuery({
    queryKey: storefrontQueryKey(storefront, ["mosaic_refs_campaigns", campaignIds.sort().join(",")]),
    enabled: campaignIds.length > 0,
    queryFn: async () => {
      const { data } = await selectStorefrontRows("campaigns", "id,name,slug,banner_image_url,subtitle,cta_text", storefront)
        .in("id", campaignIds);
      return data || [];
    },
  });

  const idx = (arr: any[] | undefined) =>
    (arr || []).reduce((acc: Record<string, any>, x) => {
      acc[x.id] = x;
      return acc;
    }, {});

  return {
    products: idx(products),
    categories: idx(categories),
    campaigns: idx(campaigns),
  };
}

export function PromoMosaic() {
  const storefront = useStorefrontTenant();
  const { data } = useQuery({
    queryKey: storefrontQueryKey(storefront, ["home_mosaic_tiles"]),
    queryFn: async () => {
      const { data } = await selectStorefrontRows("home_mosaic_tiles", "*", storefront)
        .eq("active", true)
        .order("position");
      return (data ?? []) as MosaicTile[];
    },
  });

  const tiles = data && data.length > 0 ? data : FALLBACK;
  const refs = useRefs(tiles);
  const resolved = tiles.map((t) => resolveTile(t, refs));
  const large = resolved.find((t) => t.size === "lg") ?? resolved[0];
  const smalls = resolved.filter((t) => t.id !== large.id).slice(0, 4);

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
            to={t._resolvedLink || "#"}
            className={cn(
              BG[t.bg_style] ?? BG["soft-pink"],
              "snap-start shrink-0 w-[85%] h-40 rounded-2xl p-5 flex flex-col justify-between overflow-hidden relative shadow-sm",
            )}
          >
            {t._resolvedImage ? (
              <img
                src={t._resolvedImage}
                alt={t._resolvedTitle ?? ""}
                loading="lazy"
                className="absolute -right-2 -bottom-2 h-28 w-28 object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.15)]"
              />
            ) : null}
            <div className="relative">
              {t._resolvedBadge && (
                <span className="inline-block bg-primary text-primary-foreground text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mb-1">
                  {t._resolvedBadge}
                </span>
              )}
              <h4 className="text-lg font-extrabold leading-tight text-foreground">
                {t._resolvedTitle}
              </h4>
              {t._resolvedSubtitle && (
                <p className="text-xs text-muted-foreground mt-1">{t._resolvedSubtitle}</p>
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
