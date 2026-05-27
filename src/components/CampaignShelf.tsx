import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ProductShelf } from "./ProductShelf";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { Product } from "./ProductCard";

const STYLE_BG: Record<string, string> = {
  light: "bg-gradient-to-br from-white to-[#F7F7F8] border border-border",
  "soft-pink": "bg-gradient-to-br from-[#FFF1F3] to-white border border-primary/15",
  "soft-blue": "bg-gradient-to-br from-[#EEF4FF] to-white border border-sky-200/40",
  "soft-mint": "bg-gradient-to-br from-[#ECFBF3] to-white border border-emerald-200/40",
};

type Campaign = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  banner_image_url: string | null;
  banner_link: string | null;
  cta_text: string | null;
  visual_style: string;
};

export function CampaignShelf() {
  // Active + published campaigns within window (RLS already enforces this)
  const { data: campaigns } = useQuery({
    queryKey: ["active_campaigns"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("campaigns")
        .select("id,name,slug,subtitle,banner_image_url,banner_link,cta_text,visual_style,position")
        .eq("active", true)
        .eq("published", true)
        .order("position");
      return (data ?? []) as Campaign[];
    },
  });

  const campaign = campaigns?.[0];

  const { data: products } = useQuery({
    queryKey: ["campaign_products", campaign?.id],
    enabled: !!campaign?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("campaign_products")
        .select("position, products:product_id(*)")
        .eq("campaign_id", campaign!.id)
        .order("position");
      const list = ((data ?? []) as any[])
        .map((r) => r.products)
        .filter((p) => p && p.active);
      return list as Product[];
    },
  });

  if (!campaign) return null;

  const bg = STYLE_BG[campaign.visual_style] ?? STYLE_BG.light;

  return (
    <section className="container mt-6 md:mt-10">
      <div className={cn("rounded-2xl p-5 md:p-6 relative overflow-hidden shadow-sm", bg)}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 relative">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider font-extrabold text-primary">
              Campanha
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mt-1">
              {campaign.name}
            </h2>
            {campaign.subtitle && (
              <p className="text-sm md:text-base text-muted-foreground mt-1">
                {campaign.subtitle}
              </p>
            )}
          </div>
          {campaign.banner_link && (
            <Button asChild className="shrink-0">
              <Link to={campaign.banner_link}>
                {campaign.cta_text || "Ver campanha"} →
              </Link>
            </Button>
          )}
        </div>

        {campaign.banner_image_url && (
          <div className="mt-4">
            {campaign.banner_link ? (
              <Link to={campaign.banner_link} className="block">
                <img
                  src={campaign.banner_image_url}
                  alt={campaign.name}
                  loading="lazy"
                  className="w-full max-h-56 md:max-h-72 object-cover rounded-xl"
                />
              </Link>
            ) : (
              <img
                src={campaign.banner_image_url}
                alt={campaign.name}
                loading="lazy"
                className="w-full max-h-56 md:max-h-72 object-cover rounded-xl"
              />
            )}
          </div>
        )}
      </div>

      {products && products.length > 0 && (
        <ProductShelf
          title={`Destaques de ${campaign.name}`}
          products={products}
          backgroundVariant="white"
        />
      )}
    </section>
  );
}
