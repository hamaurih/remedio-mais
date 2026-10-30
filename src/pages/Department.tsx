import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { SeoBreadcrumbs } from "@/components/SeoBreadcrumbs";
import { ProductCard, Product } from "@/components/ProductCard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ProductFilters,
  MobileFilters,
  ActiveFilterChips,
  defaultFilters,
  ProductFiltersState,
  applyClientFilters,
  buildQuery,
  sortQuery,
  SORT_OPTIONS,
} from "@/components/ProductFilters";
import { ListingPagination } from "@/components/ListingPagination";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/productSelect";
import { LISTING_PAGE_SIZE, listingRange, pageCount, parseListingPage } from "@/lib/listingPage";
import { loadManufacturerNames } from "@/lib/loadManufacturers";

const sb = supabase as any;

export default function Department() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseListingPage(searchParams.get("pagina"));
  const [sort, setSort] = useState("popular");
  const [filters, setFilters] = useState<ProductFiltersState>(defaultFilters);
  const listRef = useRef<HTMLDivElement>(null);
  const skipScroll = useRef(true);

  const setPage = useCallback((nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("pagina");
    else next.set("pagina", String(nextPage));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const changeFilters = (next: ProductFiltersState) => {
    setFilters(next);
    if (page !== 1) setPage(1);
  };

  const changeSort = (value: string) => {
    setSort(value);
    if (page !== 1) setPage(1);
  };

  const { data: dept } = useQuery({
    queryKey: ["dept", slug],
    queryFn: async () => {
      const { data } = await sb.from("departments").select("*").eq("slug", slug!).eq("active", true).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["dept_categories", dept?.id],
    queryFn: async () => {
      const { data } = await sb.from("categories")
        .select("id, name, slug, image_url, band_color, position")
        .eq("active", true)
        .eq("department_id", dept.id)
        .order("position");
      return data ?? [];
    },
    enabled: !!dept?.id,
  });

  const { data: productIds } = useQuery({
    queryKey: ["dept_product_ids", dept?.id],
    queryFn: async () => {
      const { data } = await sb.from("product_taxonomy")
        .select("product_id")
        .eq("department_id", dept.id);
      return Array.from(new Set((data ?? []).map((r: any) => r.product_id)));
    },
    enabled: !!dept?.id,
  });

  const categoryIds = useMemo(() => categories.map((c: any) => c.id), [categories]);

  const scopeReady = !!dept?.id && productIds !== undefined;

  const applyScope = (q: any) => {
    if (productIds && productIds.length > 0) return q.in("id", productIds);
    if (categoryIds.length > 0) return q.in("category_id", categoryIds);
    return null;
  };

  const { data: listing, isLoading, isError, refetch } = useQuery({
    queryKey: ["dept_products", dept?.id, productIds, categoryIds, sort, filters, page],
    queryFn: async () => {
      const scoped = applyScope((supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT, { count: "exact" }).eq("active", true));
      if (!scoped) return { rows: [] as Product[], total: 0 };
      const { from, to } = listingRange(page);
      const { data, count, error } = await sortQuery(buildQuery(scoped, filters), sort).range(from, to);
      if (error) throw new Error(error.message);
      return { rows: applyClientFilters((data || []) as Product[], filters), total: count ?? 0 };
    },
    enabled: scopeReady,
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["dept_manufacturers", dept?.id, productIds, categoryIds],
    queryFn: async () => {
      if (productIds && productIds.length > 0) return loadManufacturerNames((q) => q.in("id", productIds));
      if (categoryIds.length > 0) return loadManufacturerNames((q) => q.in("category_id", categoryIds));
      return [];
    },
    enabled: scopeReady,
  });

  useEffect(() => {
    if (!listing) return;
    const pages = pageCount(listing.total);
    if (page > pages) setPage(pages);
  }, [listing, page, setPage]);

  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  if (!slug) return null;

  if (dept === null) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Departamento não encontrado</h1>
          <Button asChild className="mt-4"><Link to="/departamentos">Ver todos os departamentos</Link></Button>
        </div>
      </Layout>
    );
  }

  const products = listing?.rows ?? [];
  const total = listing?.total ?? 0;
  const safePage = Math.min(page, pageCount(total));

  return (
    <Layout>
      <Seo
        title={dept?.name || "Departamento"}
        description={dept?.description || `Produtos do departamento ${dept?.name || ""} na farmácia Atacadão dos Medicamentos, em Campina Grande - PB.`}
        path={`/departamento/${slug}`}
      />
      <div className="container py-6">
        <SeoBreadcrumbs
          className="mb-3"
          items={[
            { name: "Início", path: "/" },
            { name: "Departamentos", path: "/departamentos" },
            { name: dept?.name || "Departamento" },
          ]}
        />
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold" style={{ color: dept?.band_color || undefined }}>
              {dept?.name || "Departamento"}
            </h1>
            {dept?.description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{dept.description}</p>}
            <p className="text-muted-foreground text-sm mt-1">{isLoading && !listing ? "Carregando produtos…" : `${total} produtos`}</p>
          </div>
          <MobileFilters value={filters} onChange={changeFilters} hideCategories manufacturers={manufacturers} totalCount={total} />
        </div>

        {categories.length > 0 && (
          <div className="mb-6 -mx-2 px-2 overflow-x-auto">
            <div className="flex gap-2 pb-2">
              {categories.map((c: any) => (
                <Link
                  key={c.id}
                  to={`/categoria/${c.slug}`}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-sm font-medium transition-colors"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="container grid md:grid-cols-[240px_1fr] gap-6 pb-10">
        <ProductFilters value={filters} onChange={changeFilters} hideCategories manufacturers={manufacturers} />

        <div ref={listRef} className="scroll-mt-24">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <ActiveFilterChips value={filters} onChange={changeFilters} manufacturers={manufacturers} />
            <Select value={sort} onValueChange={changeSort}>
              <SelectTrigger className="w-[200px] ml-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isError && (
            <div className="text-center py-16 space-y-3">
              <p className="text-muted-foreground">Não foi possível carregar os produtos.</p>
              <Button variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
            </div>
          )}
          {!isError && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {products.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          )}
          {!isError && !isLoading && total === 0 && (
            <div className="text-center py-16 space-y-4">
              <p className="text-muted-foreground">Nenhum produto neste departamento ainda.</p>
              <Button asChild><Link to="/">Ver todos os produtos</Link></Button>
            </div>
          )}
          <ListingPagination page={safePage} pageSize={LISTING_PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      </div>
    </Layout>
  );
}
