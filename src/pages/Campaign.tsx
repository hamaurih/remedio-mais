import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { ProductShelf } from "@/components/ProductShelf";
import { CampaignAutoBanner } from "@/components/CampaignAutoBanner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@/components/ProductCard";
import { Seo } from "@/components/Seo";

export default function Campaign() {
  const { slug } = useParams();

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["public_campaign", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("campaigns")
        .select("*")
        .eq("slug", slug)
        .eq("active", true)
        .eq("published", true)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["public_campaign_products", campaign?.id],
    enabled: !!campaign?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("campaign_products")
        .select("position, featured_slot, products:product_id(*)")
        .eq("campaign_id", campaign.id)
        .order("position");
      return ((data ?? []) as any[])
        .map((r) => ({ ...r.products, featured_slot: r.featured_slot }))
        .filter((p) => p && p.active);
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-10">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (!campaign) {
    return <Navigate to="/" replace />;
  }

  const mode = campaign.banner_mode || "manual_url";
  const ctaHref = campaign.banner_link || `/campanha/${campaign.slug}`;

  // Featured slot products (1, 2, 3) for auto banner
  const featured = (products || [])
    .filter((p) => p.featured_slot)
    .sort((a, b) => (a.featured_slot ?? 99) - (b.featured_slot ?? 99));
  const autoProducts =
    featured.length > 0
      ? featured
      : (products || []).filter((p) => p.image_url).slice(0, 3);

  return (
    <Layout>
      <Seo title={campaign.name} description={campaign.subtitle || `Confira as ofertas da campanha ${campaign.name} na Farmácia Atacadão dos Medicamentos.`} path={`/campanha/${campaign.slug || slug}`} />
      <section className="container mt-6 md:mt-8">
        {mode === "auto_products" && (
          <CampaignAutoBanner
            name={campaign.name}
            subtitle={campaign.subtitle}
            ctaText={campaign.cta_text || "Aproveitar agora"}
            ctaHref={ctaHref}
            visualStyle={campaign.visual_style}
            products={autoProducts}
          />
        )}
        {mode === "upload" && campaign.banner_image_url && (
          <img
            src={campaign.banner_image_url}
            alt={campaign.name}
            className="w-full max-h-[420px] object-cover rounded-2xl"
          />
        )}
        {mode === "manual_url" && campaign.banner_image_url && (
          <img
            src={campaign.banner_image_url}
            alt={campaign.name}
            className="w-full max-h-[420px] object-cover rounded-2xl"
          />
        )}
        {(mode === "none" || (!campaign.banner_image_url && mode !== "auto_products")) && (
          <div className="bg-gradient-to-br from-primary/10 to-transparent rounded-2xl p-6 md:p-10">
            <div className="text-[11px] uppercase tracking-wider font-extrabold text-primary">
              Campanha
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold mt-2">{campaign.name}</h1>
            {campaign.subtitle && (
              <p className="text-muted-foreground mt-2">{campaign.subtitle}</p>
            )}
            {campaign.cta_text && (
              <div className="mt-4">
                <Button asChild>
                  <a href={ctaHref}>{campaign.cta_text} →</a>
                </Button>
              </div>
            )}
          </div>
        )}

        {mode !== "none" && (
          <div className="mt-4">
            <h1 className="text-2xl md:text-3xl font-extrabold">{campaign.name}</h1>
            {campaign.subtitle && (
              <p className="text-muted-foreground mt-1">{campaign.subtitle}</p>
            )}
          </div>
        )}
      </section>

      {products && products.length > 0 && (
        <ProductShelf
          title={`Produtos de ${campaign.name}`}
          products={products as Product[]}
          backgroundVariant="white"
        />
      )}
    </Layout>
  );
}
