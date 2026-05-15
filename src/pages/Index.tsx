import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { ProductCard, Product } from "@/components/ProductCard";
import { Section } from "@/components/Section";
import heroImg from "@/assets/hero-pharmacy.jpg";
import { Link } from "react-router-dom";
import { Truck, Store, MessageCircle, FileText, Star, MapPin, Tag, Pill, Thermometer, Wind, Sun, Droplet, Baby, Sparkles, ShoppingBag, HeartPulse, Bandage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreSettings } from "@/hooks/useStoreSettings";

const ICONS: Record<string, any> = {
  Tag, Pill, Capsule: Pill, Thermometer, Wind, Sun, Droplet, Baby, Sparkles, ShoppingBag, BandageIcon: Bandage, HeartPulse,
};

export default function Index() {
  const { data: settings } = useStoreSettings();

  const { data: cats } = useQuery({
    queryKey: ["home_cats"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("active", true).order("position");
      return data || [];
    },
  });

  const { data: banners } = useQuery({
    queryKey: ["home_banners"],
    queryFn: async () => {
      const { data } = await supabase.from("banners").select("*").eq("active", true).order("position");
      return data || [];
    },
  });

  const fetchProducts = (filter: (q: any) => any) => async () => {
    let q = supabase.from("products").select("*").eq("active", true).limit(10);
    q = filter(q);
    const { data } = await q;
    return (data || []) as Product[];
  };

  const { data: offers } = useQuery({ queryKey: ["offers"], queryFn: fetchProducts((q) => q.eq("on_sale", true)) });
  const { data: featured } = useQuery({ queryKey: ["featured"], queryFn: fetchProducts((q) => q.eq("featured", true)) });
  const { data: meds } = useQuery({ queryKey: ["meds_pop"], queryFn: async () => {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", "medicamentos").maybeSingle();
    if (!cat) return [];
    const { data } = await supabase.from("products").select("*").eq("active", true).eq("category_id", cat.id).limit(10);
    return (data || []) as Product[];
  }});
  const { data: babies } = useQuery({ queryKey: ["babies"], queryFn: async () => {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", "mamaes-e-bebes").maybeSingle();
    if (!cat) return [];
    const { data } = await supabase.from("products").select("*").eq("active", true).eq("category_id", cat.id).limit(10);
    return (data || []) as Product[];
  }});
  const { data: hygiene } = useQuery({ queryKey: ["hygiene"], queryFn: async () => {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", "higiene-pessoal").maybeSingle();
    if (!cat) return [];
    const { data } = await supabase.from("products").select("*").eq("active", true).eq("category_id", cat.id).limit(10);
    return (data || []) as Product[];
  }});

  const Grid = ({ items }: { items?: Product[] }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
      {items?.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  );

  const benefits = [
    { icon: Truck, title: "Entrega rápida", desc: "Em Campina Grande" },
    { icon: Store, title: "Retire na loja", desc: "Compra online" },
    { icon: MessageCircle, title: "WhatsApp", desc: "Atendimento humano" },
    { icon: FileText, title: "Envie sua receita", desc: "Análise da farmácia" },
  ];

  return (
    <Layout>
      {/* Hero */}
      <section className="relative bg-gradient-soft overflow-hidden">
        <div className="container py-8 md:py-14 grid md:grid-cols-2 gap-6 items-center">
          <div className="animate-fade-in">
            <span className="inline-block bg-primary/10 text-primary font-semibold text-xs px-3 py-1 rounded-full mb-3">CAMPINA GRANDE - PB</span>
            <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">
              {settings?.hero_title || "Preço baixo todo dia na Atacadão dos Medicamentos"}
            </h1>
            <p className="mt-3 text-muted-foreground md:text-lg">{settings?.hero_subtitle}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/categoria/ofertas">Ver ofertas</Link></Button>
              <Button asChild size="lg" variant="outline" className="border-whatsapp text-whatsapp hover:bg-whatsapp hover:text-whatsapp-foreground">
                <Link to="/enviar-receita"><FileText className="h-5 w-5 mr-2" /> Enviar receita</Link>
              </Button>
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm">
              <div className="flex text-tag">
                {[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
              </div>
              <span className="font-semibold">4,9 no Google</span>
              <span className="text-muted-foreground">· 62 avaliações</span>
            </div>
          </div>
          <div className="relative">
            <img src={heroImg} alt="Produtos de farmácia" width={1600} height={700} className="rounded-2xl shadow-elevated w-full" />
          </div>
        </div>
      </section>

      {/* Banners carousel */}
      {banners && banners.length > 0 && (
        <section className="container -mt-2">
          <div className="grid md:grid-cols-3 gap-3">
            {banners.slice(0, 3).map((b) => (
              <Link key={b.id} to={b.link || "/"} className="block bg-gradient-hero text-primary-foreground p-5 rounded-xl shadow-card hover:shadow-elevated transition-all">
                <div className="text-xs font-semibold opacity-80">PROMOÇÃO</div>
                <div className="font-extrabold text-lg mt-1">{b.title}</div>
                {b.subtitle && <div className="text-sm opacity-90 mt-1">{b.subtitle}</div>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Benefits */}
      <section className="container mt-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {benefits.map((b) => (
            <div key={b.title} className="bg-card border rounded-xl p-4 flex items-center gap-3 shadow-card">
              <div className="bg-accent text-accent-foreground rounded-full p-2.5"><b.icon className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold text-sm">{b.title}</div>
                <div className="text-xs text-muted-foreground">{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <Section title="Navegue por categoria">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {cats?.map((c: any) => {
            const Ic = ICONS[c.icon] || Pill;
            return (
              <Link key={c.id} to={`/categoria/${c.slug}`} className="bg-card border rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary hover:shadow-elevated transition-all text-center">
                <div className="bg-accent text-accent-foreground rounded-full p-3"><Ic className="h-5 w-5" /></div>
                <div className="text-xs font-semibold leading-tight">{c.name}</div>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section title="Ofertas da semana" link="/categoria/ofertas"><Grid items={offers} /></Section>
      <Section title="Mais vendidos"><Grid items={featured} /></Section>
      <Section title="Medicamentos populares" link="/categoria/medicamentos"><Grid items={meds} /></Section>
      <Section title="Mamães e Bebês" link="/categoria/mamaes-e-bebes"><Grid items={babies} /></Section>
      <Section title="Higiene e Beleza" link="/categoria/higiene-pessoal"><Grid items={hygiene} /></Section>

      {/* Prescription */}
      <section className="container py-8">
        <div className="bg-gradient-hero text-primary-foreground rounded-2xl p-6 md:p-10 grid md:grid-cols-[1fr_auto] items-center gap-4 shadow-elevated">
          <div>
            <h3 className="text-2xl font-extrabold">Tem receita médica?</h3>
            <p className="opacity-90 mt-1">Envie pelo site e nossa equipe analisa rapidinho. Venda sujeita à conferência.</p>
          </div>
          <Button asChild size="lg" variant="secondary"><Link to="/enviar-receita"><FileText className="h-5 w-5 mr-2" /> Enviar receita</Link></Button>
        </div>
      </section>

      {/* Rating + Location */}
      <section className="container py-8 grid md:grid-cols-2 gap-4">
        <div className="bg-card border rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-2 text-tag">
            {[...Array(5)].map((_, i) => <Star key={i} className="h-6 w-6 fill-current" />)}
            <span className="text-3xl font-extrabold text-foreground ml-2">4,9</span>
          </div>
          <p className="text-muted-foreground mt-2">Mais de 62 avaliações no Google. Atendimento que faz a diferença.</p>
        </div>
        <div className="bg-card border rounded-2xl p-6 shadow-card">
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
    </Layout>
  );
}
