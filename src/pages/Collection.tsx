import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { ProductCard, Product } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { COLLECTIONS, CollectionTheme, fetchCollectionProducts, getCollection } from "@/lib/collections";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import NotFound from "@/pages/NotFound";

export const COLLECTION_THEME_CLASS: Record<CollectionTheme, string> = {
  yellow: "bg-highlight text-highlight-foreground",
  red: "bg-primary/10 text-foreground",
  blue: "bg-sky-100 text-foreground",
  green: "bg-emerald-100 text-foreground",
  neutral: "bg-secondary/40 text-foreground",
};

interface CollectionPageProps {
  /** slug fixo quando a rota é dedicada (ex: /ofertas) */
  slug?: string;
}

export default function Collection({ slug: fixedSlug }: CollectionPageProps) {
  const params = useParams<{ slug?: string }>();
  const slug = fixedSlug ?? params.slug;
  const def = getCollection(slug);
  const { data: settings } = useStoreSettings();

  const { data: products, isLoading } = useQuery({
    queryKey: ["collection", slug, (settings as any)?.bestsellers_period_days],
    enabled: !!def,
    queryFn: () =>
      fetchCollectionProducts(def!.slug, {
        limit: def!.limit,
        bestsellerDays: Number((settings as any)?.bestsellers_period_days ?? 30),
        autoPriceDrop: (settings as any)?.best_offers_auto_price_drop ?? undefined,
      }),
  });

  if (!def) return <NotFound />;

  const title = def.slug === "melhores-ofertas" ? ((settings as any)?.best_offers_title || def.title) : def.title;
  const description = def.slug === "melhores-ofertas" ? ((settings as any)?.best_offers_subtitle || def.description) : def.description;
  const theme: CollectionTheme = def.slug === "melhores-ofertas"
    ? (((settings as any)?.best_offers_theme as CollectionTheme) || "yellow")
    : def.theme;

  return (
    <Layout>
      <Seo title={title} description={description} path={def.route ?? `/colecao/${slug}`} />
      <section className={COLLECTION_THEME_CLASS[theme] ?? COLLECTION_THEME_CLASS.neutral}>
        <div className="container py-8">
          <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
          <p className="text-sm md:text-base opacity-80 mt-1">{description}</p>
        </div>
      </section>

      <div className="container py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
          </div>
        ) : (products?.length ?? 0) === 0 ? (
          <div className="text-center py-16">
            <p className="font-semibold">Nenhum produto disponível nesta coleção agora.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Produtos sem estoque ou com oferta expirada não são exibidos.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">{products!.length} produto(s)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {products!.map((p: Product) => <ProductCard key={(p as any).id} p={p} />)}
            </div>
          </>
        )}
      </div>

      <nav className="container pb-10">
        <p className="text-xs text-muted-foreground mb-2">Outras coleções</p>
        <div className="flex flex-wrap gap-2">
          {COLLECTIONS.filter((c) => c.active && c.slug !== def.slug).map((c) => (
            <a key={c.slug} href={c.route} className="text-xs border rounded-full px-3 py-1 hover:bg-secondary">
              {c.title}
            </a>
          ))}
        </div>
      </nav>
    </Layout>
  );
}
