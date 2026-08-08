import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { Product } from "@/components/ProductCard";
import { ProductShelf, type ShelfBg } from "@/components/ProductShelf";
import { customShelfSectionKey, type CustomShelf } from "@/hooks/useCustomShelves";

import { HeroPromoCarousel } from "@/components/HeroPromoCarousel";
import { PromoBanner as PromoMiniBannerRow } from "@/components/PromoBanner";
import { PromoMosaic } from "@/components/PromoMosaic";
import { BenefitCards } from "@/components/BenefitCards";
import { CampaignShelf } from "@/components/CampaignShelf";
import { DepartmentCarousel } from "@/components/DepartmentCarousel";
import { PrescriptionCTA } from "@/components/PrescriptionCTA";
import { GoogleRatingBlock } from "@/components/GoogleRatingBlock";
import { Link } from "react-router-dom";
import { PromoTicker } from "@/components/PromoTicker";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useEffect, useRef, useState } from "react";
import type { Product as ProductType } from "@/components/ProductCard";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/productSelect";
import { fetchBestsellers, fetchCollectionProducts } from "@/lib/collections";

function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShow(true); o.disconnect(); } }, { threshold: 0.1 });
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return <div ref={ref} className={show ? "animate-fade-in-up" : "opacity-0"}>{children}</div>;
}


/**
 * Vitrine simples por categoria: curadoria manual → produtos marcados na
 * prateleira → fallback pela categoria. Hook de verdade (não fábrica dentro do
 * componente) para não violar as regras de hooks do React.
 */
function useShelfQuery(slug: string, shelf: string) {
  return useQuery({
    queryKey: [`shelf_${shelf}`],
    queryFn: async () => {
      const { data: curated } = await (supabase as any)
        .from("home_shelf_items")
        .select(`position, products:product_id(${PUBLIC_PRODUCT_SELECT})`)
        .eq("shelf_key", shelf)
        .order("position");
      const manual = ((curated || []) as any[])
        .map((r) => r.products)
        .filter((p) => p && p.active && Number(p.stock ?? 0) > 0);
      if (manual.length > 0) return manual as Product[];

      const { data: tagged } = await (supabase as any)
        .from("products").select(PUBLIC_PRODUCT_SELECT)
        .eq("active", true).gt("stock", 0).contains("shelves", [shelf]).limit(12);
      if (tagged && tagged.length > 0) return tagged as Product[];

      const { data: cat } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
      if (!cat) return [] as Product[];
      const { data } = await (supabase as any)
        .from("products").select(PUBLIC_PRODUCT_SELECT)
        .eq("active", true).gt("stock", 0).eq("category_id", cat.id).limit(12);
      return (data || []) as Product[];
    },
  });
}

export default function Index() {
  const { data: settings } = useStoreSettings();

  const { data: banners } = useQuery({
    queryKey: ["home_banners"],
    queryFn: async () =>
      (await supabase.from("banners").select("*").eq("active", true).eq("placement", "hero").order("position")).data || [],
  });

  const fetchShelf = (mod: (q: any) => any) => async () => {
    let q = (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true).gt("stock", 0).limit(12);
    q = mod(q);
    const { data } = await q;
    return (data || []) as Product[];
  };

  // Curadoria manual definida em Admin > Vitrines da Home
  const manualShelf = async (key: string): Promise<Product[] | null> => {
    const { data } = await (supabase as any)
      .from("home_shelf_items")
      .select(`position, products:product_id(${PUBLIC_PRODUCT_SELECT})`)
      .eq("shelf_key", key)
      .order("position");
    const list = ((data || []) as any[])
      .map((r) => r.products)
      .filter((p) => p && p.active && Number(p.stock ?? 0) > 0);
    return list.length > 0 ? (list as Product[]) : null;
  };

  const shelfBy = (slug: string) => async () => {
    // Prefer products explicitly tagged with the shelf, fallback to category
    const { data: tagged } = await (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true).gt("stock", 0).contains("shelves", [slug]).limit(12);
    if (tagged && tagged.length > 0) return tagged as Product[];
    return null;
  };

  const offers = useQuery({
    queryKey: ["shelf_offers"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      // 0) curadoria manual
      const manual = await manualShelf("ofertas-da-semana");
      if (manual) return manual;
      // 1) shelf tag
      const tagged = await (supabase as any)
        .from("products")
        .select(PUBLIC_PRODUCT_SELECT)
        .eq("active", true).gt("stock", 0).gt("price", 0)
        .contains("shelves", ["ofertas-da-semana"])
        .limit(12);
      if (tagged.data && tagged.data.length > 0) return tagged.data as Product[];
      // 2) on_sale
      const onSale = await (supabase as any)
        .from("products")
        .select(PUBLIC_PRODUCT_SELECT)
        .eq("active", true).gt("stock", 0).gt("price", 0)
        .eq("on_sale", true)
        .or(`promotion_start.is.null,promotion_start.lte.${nowIso}`)
        .or(`promotion_end.is.null,promotion_end.gte.${nowIso}`)
        .limit(12);
      if (onSale.data && onSale.data.length > 0) return onSale.data as Product[];
      // 3) promo_price < price
      const promo = await (supabase as any)
        .from("products")
        .select(PUBLIC_PRODUCT_SELECT)
        .eq("active", true).gt("stock", 0).gt("price", 0)
        .not("promo_price", "is", null)
        .limit(24);
      const promoFiltered = (promo.data || []).filter((p: any) => p.promo_price != null && Number(p.promo_price) < Number(p.price)).slice(0, 12);
      if (promoFiltered.length > 0) return promoFiltered as Product[];
      // 4) fallback: recém atualizados
      const recent = await (supabase as any)
        .from("products")
        .select(PUBLIC_PRODUCT_SELECT)
        .eq("active", true).gt("stock", 0).gt("price", 0)
        .order("updated_at", { ascending: false })
        .limit(12);
      return (recent.data || []) as Product[];
    },
  });
  // Ranking automático por unidades realmente vendidas (função do banco)
  const bestsellerDays = Number((settings as any)?.bestsellers_period_days ?? 30);
  const bestsellerLimit = Number((settings as any)?.bestsellers_limit ?? 12);
  const bestsellers = useQuery({
    queryKey: ["shelf_bestsellers", bestsellerDays, bestsellerLimit],
    queryFn: async () => await fetchBestsellers(bestsellerDays, bestsellerLimit),
  });

  // Melhores Ofertas: elegibilidade comercial (oferta/campanha/curadoria), ordenada por desconto
  const bestOffers = useQuery({
    queryKey: ["shelf_best_offers", (settings as any)?.best_offers_limit, (settings as any)?.best_offers_auto_price_drop],
    queryFn: async () =>
      await fetchCollectionProducts("melhores-ofertas", {
        limit: Number((settings as any)?.best_offers_limit ?? 12),
        autoPriceDrop: (settings as any)?.best_offers_auto_price_drop ?? false,
      }),
  });

  const meds = useQuery({
    queryKey: ["shelf_meds"],
    queryFn: async () => await fetchCollectionProducts("medicamentos-populares", { limit: 12, bestsellerDays: 90 }),
  });
  const hygiene = useQuery({
    queryKey: ["shelf_hygiene"],
    queryFn: async () => {
      const manual = await manualShelf("higiene-e-beleza");
      if (manual) return manual;
      const t = await shelfBy("higiene-e-beleza")();
      if (t) return t;
      const { data: cat } = await supabase.from("categories").select("id").eq("slug", "higiene-pessoal").maybeSingle();
      if (!cat) return [];
      const { data } = await (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true).gt("stock", 0).eq("category_id", cat.id).limit(12);
      return (data || []) as Product[];
    },
  });
  const babies = useQuery({
    queryKey: ["shelf_babies"],
    queryFn: async () => {
      const manual = await manualShelf("mamaes-e-bebes");
      if (manual) return manual;
      const t = await shelfBy("mamaes-e-bebes")();
      if (t) return t;
      const { data: cat } = await supabase.from("categories").select("id").eq("slug", "mamaes-e-bebes").maybeSingle();
      if (!cat) return [];
      const { data } = await (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true).gt("stock", 0).eq("category_id", cat.id).limit(12);
      return (data || []) as Product[];
    },
  });
  const vitamins = useShelfQuery("vitaminas", "vitaminas-e-suplementos");
  const firstaid = useShelfQuery("primeiros-socorros", "primeiros-socorros");


  const { data: layout } = useQuery({
    queryKey: ["home_layout"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("home_layout")
        .select("section_key,enabled,position")
        .eq("enabled", true)
        .order("position");
      return (data || []) as { section_key: string; enabled: boolean; position: number }[];
    },
  });

  // Vitrines personalizadas criadas em Admin > Vitrines da Home
  const customShelves = useQuery({
    queryKey: ["home_custom_shelves_with_products"],
    queryFn: async () => {
      const { data: defs } = await (supabase as any)
        .from("home_custom_shelves")
        .select("*")
        .eq("active", true)
        .order("created_at");
      const list = (defs || []) as CustomShelf[];
      const out: (CustomShelf & { products: Product[] })[] = [];
      for (const d of list) {
        const items = await manualShelf(d.shelf_key);
        out.push({ ...d, products: (items || []).slice(0, d.max_items || 12) });
      }
      return out;
    },
  });

  const shelfSections: Record<string, React.ReactNode> = {
    shelf_offers: <Reveal><ProductShelf title="Ofertas da Semana" subtitle="Promoções por tempo limitado" badge="Oferta" viewAllLink="/ofertas" products={offers.data} loading={offers.isLoading} backgroundVariant="red-soft" autoplay /></Reveal>,
    shelf_best_offers: <Reveal><ProductShelf title={(settings as any)?.best_offers_title || "Melhores Ofertas"} subtitle={(settings as any)?.best_offers_subtitle || "Os maiores descontos da loja"} badge="Melhor preço" viewAllLink="/melhores-ofertas" products={bestOffers.data} loading={bestOffers.isLoading} backgroundVariant="highlight" /></Reveal>,
    shelf_bestsellers: <Reveal><ProductShelf title="Mais Vendidos" subtitle={`Ranking por unidades vendidas (últimos ${bestsellerDays} dias)`} viewAllLink="/mais-vendidos" products={bestsellers.data} loading={bestsellers.isLoading} backgroundVariant="light" /></Reveal>,
    shelf_meds: <Reveal><ProductShelf title="Medicamentos Populares" viewAllLink="/medicamentos-populares" products={meds.data} loading={meds.isLoading} backgroundVariant="white" /></Reveal>,
    shelf_hygiene: <Reveal><ProductShelf title="Higiene e Beleza" viewAllLink="/categoria/higiene-pessoal" products={hygiene.data} loading={hygiene.isLoading} backgroundVariant="light" /></Reveal>,
    shelf_babies: <Reveal><ProductShelf title="Mamães e Bebês" viewAllLink="/categoria/mamaes-e-bebes" products={babies.data} loading={babies.isLoading} backgroundVariant="white" /></Reveal>,
    shelf_vitamins: <Reveal><ProductShelf title="Vitaminas e Suplementos" viewAllLink="/categoria/vitaminas" products={vitamins.data} loading={vitamins.isLoading} backgroundVariant="light" /></Reveal>,
    shelf_firstaid: <Reveal><ProductShelf title="Primeiros Socorros" viewAllLink="/categoria/primeiros-socorros" products={firstaid.data} loading={firstaid.isLoading} backgroundVariant="white" /></Reveal>,
  };

  const customSections: Record<string, React.ReactNode> = {};
  (customShelves.data || []).forEach((s) => {
    if (s.products.length === 0) return;
    customSections[customShelfSectionKey(s.shelf_key)] = (
      <Reveal>
        <ProductShelf
          title={s.title}
          subtitle={s.subtitle || undefined}
          badge={s.badge || undefined}
          viewAllLink={s.view_all_link || undefined}
          products={s.products}
          backgroundVariant={(s.background_variant || "white") as ShelfBg}
        />
      </Reveal>
    );
  });

  const shelfKeys = Object.keys(shelfSections);
  const shelvesBlock = <>{[...shelfKeys, ...Object.keys(customSections)].map((k) => <div key={k}>{shelfSections[k] ?? customSections[k]}</div>)}</>;



  const locationBlock = (
    <Reveal>
      <section className="container py-4">
        <div className="bg-card border rounded-2xl p-6 shadow-card hover:shadow-elevated transition-shadow">
          <div className="flex items-start gap-3">
            <MapPin className="h-6 w-6 text-primary shrink-0" />
            <div>
              <div className="font-semibold">{settings?.address}</div>
              <div className="text-sm text-muted-foreground mt-1">{settings?.hours}</div>
              <Button asChild variant="link" className="px-0 mt-2">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings?.address || "")}`} target="_blank" rel="noopener">Como chegar →</a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );

  const SECTIONS: Record<string, React.ReactNode> = {
    promo_ticker: <PromoTicker />,
    hero_carousel: <HeroPromoCarousel slides={banners as any} />,
    promo_mini_banner_row: <PromoMiniBannerRow />,
    promo_mosaic: <PromoMosaic />,
    campaign_shelf: <Reveal><CampaignShelf /></Reveal>,
    benefit_cards: <Reveal><BenefitCards /></Reveal>,
    department_carousel: <Reveal><DepartmentCarousel /></Reveal>,
    product_shelves: shelvesBlock,
    ...shelfSections,
    ...customSections,
    prescription_cta: <Reveal><PrescriptionCTA /></Reveal>,
    google_rating: <Reveal><GoogleRatingBlock /></Reveal>,
    location: locationBlock,
  };

  const defaultOrder = [
    "promo_ticker",
    "hero_carousel",
    "promo_mini_banner_row",
    "promo_mosaic",
    "benefit_cards",
    "campaign_shelf",
    "department_carousel",
    ...shelfKeys,
    ...Object.keys(customSections),
    "prescription_cta",
    "google_rating",
    "location",
  ];

  const order = layout && layout.length > 0
    ? layout.map((r) => r.section_key)
    : defaultOrder;

  return (
    <Layout>
      <Seo
        title="Atacadão dos Medicamentos | Farmácia em Campina Grande - PB"
        description="Farmácia Atacadão dos Medicamentos em Campina Grande - PB. Preço baixo todo dia, entrega local e atendimento pelo WhatsApp."
        path="/"
      />
      {order.map((key) => (
        <div key={key}>{SECTIONS[key] ?? null}</div>
      ))}

      <p className="container text-[11px] text-muted-foreground pb-6 text-center">
        As informações dos produtos são meramente informativas. Consulte o farmacêutico.
      </p>
    </Layout>
  );
}

