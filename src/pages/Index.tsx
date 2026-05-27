import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Product } from "@/components/ProductCard";
import { ProductShelf } from "@/components/ProductShelf";
import { HeroSlider } from "@/components/HeroSlider";
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
    queryFn: async () => (await supabase.from("banners").select("*").eq("active", true).order("position")).data || [],
  });

  const fetchShelf = (mod: (q: any) => any) => async () => {
    let q = supabase.from("products").select("*").eq("active", true).limit(12);
    q = mod(q);
    const { data } = await q;
    return (data || []) as Product[];
  };

  const shelfBy = (slug: string) => async () => {
    // Prefer products explicitly tagged with the shelf, fallback to category
    const { data: tagged } = await supabase.from("products").select("*").eq("active", true).contains("shelves", [slug]).limit(12);
    if (tagged && tagged.length > 0) return tagged as Product[];
    return null;
  };

  const offers = useQuery({
    queryKey: ["shelf_offers"],
    queryFn: async () => {
      const t = await shelfBy("ofertas-da-semana")();
      if (t) return t;
      return await fetchShelf((q) => q.eq("on_sale", true).order("updated_at", { ascending: false }))();
    },
  });
  const bestsellers = useQuery({
    queryKey: ["shelf_bestsellers"],
    queryFn: async () => {
      const t = await shelfBy("mais-vendidos")();
      if (t) return t;
      return await fetchShelf((q) => q.eq("featured", true))();
    },
  });
  const meds = useQuery({
    queryKey: ["shelf_meds"],
    queryFn: async () => {
      const t = await shelfBy("medicamentos-populares")();
      if (t) return t;
      const { data: cat } = await supabase.from("categories").select("id").eq("slug", "medicamentos").maybeSingle();
      if (!cat) return [];
      const { data } = await supabase.from("products").select("*").eq("active", true).eq("category_id", cat.id).limit(12);
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
      const { data } = await supabase.from("products").select("*").eq("active", true).eq("category_id", cat.id).limit(12);
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
      const { data } = await supabase.from("products").select("*").eq("active", true).eq("category_id", cat.id).limit(12);
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
        const { data } = await supabase.from("products").select("*").eq("active", true).eq("category_id", cat.id).limit(12);
        return (data || []) as Product[];
      },
    });
  const vitamins = buildShelf("vitaminas", "vitaminas-e-suplementos");
  const firstaid = buildShelf("primeiros-socorros", "primeiros-socorros");

  return (
    <Layout>
      {/* Hero slider */}
      <HeroSlider slides={banners as any} />

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
