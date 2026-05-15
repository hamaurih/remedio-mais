import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Product } from "@/components/ProductCard";
import { ProductCarousel } from "@/components/ProductCarousel";
import { HeroSlider } from "@/components/HeroSlider";
import { PromoMosaic } from "@/components/PromoMosaic";
import { Link } from "react-router-dom";
import {
  Truck, Store, MessageCircle, FileText, MapPin, Tag, Pill,
  Thermometer, Wind, Sun, Droplet, Baby, Sparkles, ShoppingBag, HeartPulse, Bandage,
  BadgePercent, Stethoscope, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useEffect, useRef, useState } from "react";

const ICONS: Record<string, any> = {
  Tag, Pill, Capsule: Pill, Thermometer, Wind, Sun, Droplet, Baby, Sparkles, ShoppingBag, BandageIcon: Bandage, HeartPulse,
};

const DEPARTAMENTOS = [
  { name: "Ofertas", slug: "ofertas", icon: Tag, color: "from-primary/15 to-primary/5" },
  { name: "Medicamentos", slug: "medicamentos", icon: Pill, color: "from-blue-500/15 to-blue-500/5" },
  { name: "Genéricos", slug: "genericos", icon: BadgePercent, color: "from-green-500/15 to-green-500/5" },
  { name: "Mamães e Bebês", slug: "mamaes-e-bebes", icon: Baby, color: "from-pink-400/20 to-pink-400/5" },
  { name: "Higiene e Beleza", slug: "higiene-pessoal", icon: Sparkles, color: "from-purple-500/15 to-purple-500/5" },
  { name: "Vitaminas", slug: "vitaminas", icon: Sun, color: "from-amber-500/20 to-amber-500/5" },
  { name: "Primeiros Socorros", slug: "primeiros-socorros", icon: Bandage, color: "from-red-500/15 to-red-500/5" },
  { name: "Conveniência", slug: "conveniencia", icon: ShoppingBag, color: "from-teal-500/15 to-teal-500/5" },
];

const BENEFITS = [
  { icon: Truck, title: "Entrega rápida", desc: "Em Campina Grande" },
  { icon: Store, title: "Retire na loja", desc: "Reserve online" },
  { icon: MessageCircle, title: "Peça pelo WhatsApp", desc: "Atendimento humano" },
  { icon: FileText, title: "Envie sua receita", desc: "Análise da farmácia" },
  { icon: BadgePercent, title: "Preço baixo todo dia", desc: "Ofertas reais" },
];

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

function Shelf({ title, link, items, loading, alt }: { title: string; link?: string; items?: Product[]; loading?: boolean; alt?: boolean }) {
  return (
    <Reveal>
      <section className={alt ? "bg-secondary/40" : ""}>
        <div className="container py-6 md:py-8">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
              <span className="inline-block w-1 h-6 bg-primary rounded-full" />
              {title}
            </h2>
            {link && (
              <Link to={link} className="text-sm text-primary font-bold hover:underline whitespace-nowrap">
                Ver todos →
              </Link>
            )}
          </div>
          <ProductCarousel items={items} loading={loading} />
        </div>
      </section>
    </Reveal>
  );
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

  return (
    <Layout>
      {/* Hero slider */}
      <HeroSlider slides={banners as any} />

      {/* Benefits */}
      <Reveal>
        <section className="container mt-6 md:mt-8">
          <div className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="snap-start shrink-0 w-[70%] sm:w-[45%] md:w-auto bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-card hover:shadow-elevated hover:-translate-y-1 hover:border-primary/40 transition-all duration-200"
              >
                <div className="bg-accent text-accent-foreground rounded-full p-2.5 shrink-0">
                  <b.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm leading-tight">{b.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Departamentos */}
      <Reveal>
        <section className="container py-8 md:py-10">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
              <span className="inline-block w-1 h-6 bg-primary rounded-full" />
              Navegue por Departamento
            </h2>
          </div>
          <div className="flex md:grid md:grid-cols-4 lg:grid-cols-8 gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
            {DEPARTAMENTOS.map((d) => (
              <Link
                key={d.slug}
                to={`/categoria/${d.slug}`}
                className={`snap-start shrink-0 w-32 md:w-auto bg-gradient-to-br ${d.color} border border-border rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center hover:shadow-elevated hover:border-primary/30 hover:scale-[1.03] transition-all duration-200 aspect-square md:aspect-[4/3]`}
              >
                <div className="bg-card text-primary rounded-full p-3 shadow-card">
                  <d.icon className="h-5 w-5 md:h-6 md:w-6" />
                </div>
                <div className="text-xs md:text-sm font-bold leading-tight">{d.name}</div>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Shelves */}
      <Shelf title="Ofertas da Semana" link="/categoria/ofertas" items={offers.data} loading={offers.isLoading} />
      <Shelf title="Mais Vendidos" items={bestsellers.data} loading={bestsellers.isLoading} />
      <Shelf title="Medicamentos Populares" link="/categoria/medicamentos" items={meds.data} loading={meds.isLoading} />
      <Shelf title="Higiene e Beleza" link="/categoria/higiene-pessoal" items={hygiene.data} loading={hygiene.isLoading} />
      <Shelf title="Mamães e Bebês" link="/categoria/mamaes-e-bebes" items={babies.data} loading={babies.isLoading} />

      {/* Prescription CTA */}
      <Reveal>
        <section className="container py-8">
          <div className="bg-gradient-hero text-primary-foreground rounded-2xl p-6 md:p-10 grid md:grid-cols-[1fr_auto] items-center gap-4 shadow-elevated relative overflow-hidden">
            <div className="absolute -right-10 -top-10 opacity-10">
              <Stethoscope className="h-48 w-48" />
            </div>
            <div className="relative">
              <h3 className="text-2xl md:text-3xl font-extrabold">Tem receita médica?</h3>
              <p className="opacity-90 mt-1 max-w-xl">Envie pelo site e nossa equipe analisa rapidinho. Venda sujeita à apresentação e conferência da receita.</p>
            </div>
            <Button asChild size="lg" variant="secondary" className="relative font-bold">
              <Link to="/enviar-receita"><FileText className="h-5 w-5 mr-2" /> Enviar receita</Link>
            </Button>
          </div>
        </section>
      </Reveal>

      {/* Rating + Location */}
      <Reveal>
        <section className="container py-8 grid md:grid-cols-2 gap-4">
          <div className="bg-card border rounded-2xl p-6 shadow-card hover:shadow-elevated transition-shadow">
            <div className="flex items-center gap-2 text-tag">
              {[...Array(5)].map((_, i) => <Star key={i} className="h-6 w-6 fill-current" />)}
              <span className="text-3xl font-extrabold text-foreground ml-2">4,9</span>
            </div>
            <p className="text-muted-foreground mt-2">Mais de 62 avaliações no Google. Atendimento que faz a diferença.</p>
          </div>
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
