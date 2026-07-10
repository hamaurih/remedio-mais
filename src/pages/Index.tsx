import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Product } from "@/components/ProductCard";
import { ProductShelf } from "@/components/ProductShelf";
import { HeroPromoCarousel } from "@/components/HeroPromoCarousel";
import { PromoMosaic } from "@/components/PromoMosaic";
import { BenefitCards } from "@/components/BenefitCards";
import { CampaignShelf } from "@/components/CampaignShelf";
import { DepartmentCarousel } from "@/components/DepartmentCarousel";
import { PrescriptionCTA } from "@/components/PrescriptionCTA";
import { GoogleRatingBlock } from "@/components/GoogleRatingBlock";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useEffect, useRef, useState } from "react";
import type { Product as ProductType } from "@/components/ProductCard";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/productSelect";

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
  const bestsellers = useQuery({
    queryKey: ["shelf_bestsellers"],
    queryFn: async () => {
      // 1) Ordem manual definida no admin (bestseller_rank)
      const ranked = await (supabase as any)
        .from("products")
        .select(PUBLIC_PRODUCT_SELECT)
        .eq("active", true).gt("stock", 0).gt("price", 0)
        .not("bestseller_rank", "is", null)
        .order("bestseller_rank", { ascending: true })
        .limit(12);
      if (ranked.data && ranked.data.length > 0) return ranked.data as Product[];
      // 2) Fallback antigo: tag de prateleira
      const t = await shelfBy("mais-vendidos")();
      if (t) return t;
      // 3) Fallback: destaques
      const feat = await fetchShelf((q) => q.eq("featured", true).gt("price", 0))();
      if (feat.length > 0) return feat;
      // 4) último fallback: recém atualizados
      const { data } = await (supabase as any)
        .from("products")
        .select(PUBLIC_PRODUCT_SELECT)
        .eq("active", true).gt("stock", 0).gt("price", 0)
        .order("updated_at", { ascending: false })
        .limit(12);
      return (data || []) as Product[];
    },
  });
  const meds = useQuery({
    queryKey: ["shelf_meds"],
    queryFn: async () => {
      const t = await shelfBy("medicamentos-populares")();
      if (t) return t;
      const { data: cat } = await supabase.from("categories").select("id").eq("slug", "medicamentos").maybeSingle();
      if (!cat) return [];
      const { data } = await (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true).gt("stock", 0).eq("category_id", cat.id).limit(12);
      return (data || []) as Product[];
    },
  });
  const hygiene = useQuery({
    queryKey: ["shelf_hygiene"],
    queryFn: async () => {
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
      const t = await shelfBy("mamaes-e-bebes")();
      if (t) return t;
      const { data: cat } = await supabase.from("categories").select("id").eq("slug", "mamaes-e-bebes").maybeSingle();
      if (!cat) return [];
      const { data } = await (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true).gt("stock", 0).eq("category_id", cat.id).limit(12);
      return (data || []) as Product[];
    },
  });
  const buildShelf = (slug: string, shelf: string) =>
    useQuery({
      queryKey: [`shelf_${shelf}`],
      queryFn: async () => {
        const t = await shelfBy(shelf)();
        if (t) return t;
        const { data: cat } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
        if (!cat) return [];
        const { data } = await (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true).gt("stock", 0).eq("category_id", cat.id).limit(12);
        return (data || []) as Product[];
      },
    });
  const vitamins = buildShelf("vitaminas", "vitaminas-e-suplementos");
  const firstaid = buildShelf("primeiros-socorros", "primeiros-socorros");

  return (
    <Layout>
      {/* Hero carrossel promocional */}
      <HeroPromoCarousel slides={banners as any} />

      {/* Promo mosaic */}
      <PromoMosaic />

      {/* Active campaign (if any) */}
      <Reveal><CampaignShelf /></Reveal>

      <Reveal><BenefitCards /></Reveal>
      <Reveal><DepartmentCarousel /></Reveal>

      {/* Shelves & sections in requested order */}
      <Reveal>
        <ProductShelf title="Ofertas da Semana" subtitle="Promoções por tempo limitado" badge="Oferta" viewAllLink="/categoria/ofertas" products={offers.data} loading={offers.isLoading} backgroundVariant="red-soft" autoplay />
      </Reveal>
      <Reveal>
        <ProductShelf title="Mais Vendidos" products={bestsellers.data} loading={bestsellers.isLoading} backgroundVariant="light" />
      </Reveal>

      <Reveal><PrescriptionCTA /></Reveal>

      <Reveal>
        <ProductShelf title="Medicamentos Populares" viewAllLink="/categoria/medicamentos" products={meds.data} loading={meds.isLoading} backgroundVariant="white" />
      </Reveal>
      <Reveal>
        <ProductShelf title="Higiene e Beleza" viewAllLink="/categoria/higiene-pessoal" products={hygiene.data} loading={hygiene.isLoading} backgroundVariant="light" />
      </Reveal>
      <Reveal>
        <ProductShelf title="Mamães e Bebês" viewAllLink="/categoria/mamaes-e-bebes" products={babies.data} loading={babies.isLoading} backgroundVariant="white" />
      </Reveal>
      <Reveal>
        <ProductShelf title="Vitaminas e Suplementos" viewAllLink="/categoria/vitaminas" products={vitamins.data} loading={vitamins.isLoading} backgroundVariant="light" />
      </Reveal>
      <Reveal>
        <ProductShelf title="Primeiros Socorros" viewAllLink="/categoria/primeiros-socorros" products={firstaid.data} loading={firstaid.isLoading} backgroundVariant="white" />
      </Reveal>

      <Reveal><GoogleRatingBlock /></Reveal>

      {/* Location */}
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

      <p className="container text-[11px] text-muted-foreground pb-6 text-center">
        As informações dos produtos são meramente informativas. Consulte o farmacêutico.
      </p>
    </Layout>
  );
}
