import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { SeoBreadcrumbs } from "@/components/SeoBreadcrumbs";
import { ProductCard, Product } from "@/components/ProductCard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ProductFilters,
  MobileFilters,
  ActiveFilterChips,
  defaultFilters,
  filtersAreDefault,
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

export default function Category() {
  const { slug, sub } = useParams<{ slug: string; sub?: string }>();
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

  const { data: cat } = useQuery({
    queryKey: ["cat", slug],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("slug", slug!).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  // Resolve subcategory if present in URL
  const { data: subcategory } = useQuery({
    queryKey: ["subcat", cat?.id, sub],
    queryFn: async () => {
      if (!cat?.id || !sub) return null;
      const { data } = await sb.from("subcategories").select("*").eq("category_id", cat.id).eq("slug", sub).maybeSingle();
      return data;
    },
    enabled: !!cat?.id && !!sub,
  });

  // Sibling categories (when this is a hub like "Medicamentos" within "Medicamentos e Saúde")
  const isHub = !!cat?.macro_group && !!cat?.name &&
    cat.macro_group.toLowerCase().includes(cat.name.toLowerCase());

  const { data: siblingIds } = useQuery({
    queryKey: ["cat_siblings", cat?.macro_group, isHub],
    queryFn: async () => {
      if (!isHub || !cat?.macro_group) return null;
      const { data } = await supabase
        .from("categories")
        .select("id")
        .eq("active", true)
        .eq("macro_group", cat.macro_group);
      return (data ?? []).map((r: any) => r.id);
    },
    enabled: !!cat && isHub,
  });

  // When subcategory filter is active, fetch matching product IDs via product_taxonomy
  const { data: subProductIds } = useQuery({
    queryKey: ["sub_product_ids", subcategory?.id],
    queryFn: async () => {
      if (!subcategory?.id) return null;
      const { data } = await sb.from("product_taxonomy").select("product_id").eq("subcategory_id", subcategory.id);
      return (data ?? []).map((r: any) => r.product_id);
    },
    enabled: !!subcategory?.id,
  });

  const scopeReady = !!slug && (slug === "ofertas" || !!cat) && (!isHub || !!siblingIds) && (!sub || subProductIds !== undefined);

  const applyScope = (q: any) => {
    let next = q;
    if (slug === "ofertas") next = next.eq("on_sale", true);
    else if (cat) {
      if (isHub && siblingIds && siblingIds.length > 0) next = next.in("category_id", siblingIds);
      else next = next.eq("category_id", cat.id);
    }
    if (subcategory) {
      if (!subProductIds || subProductIds.length === 0) return next.in("id", ["00000000-0000-0000-0000-000000000000"]);
      next = next.in("id", subProductIds);
    }
    return next;
  };

  const { data: listing, isLoading, isError, refetch } = useQuery({
    queryKey: ["cat_products", slug, sub, sort, filters, siblingIds, subProductIds, page],
    queryFn: async () => {
      const { from, to } = listingRange(page);
      if (slug !== "ofertas" && !cat) return { rows: [] as Product[], total: 0, fallback: false };
      if (subcategory && (!subProductIds || subProductIds.length === 0)) return { rows: [] as Product[], total: 0, fallback: false };
      let q: any = (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT, { count: "exact" }).eq("active", true);
      q = applyScope(q);
      q = buildQuery(q, filters);
      q = sortQuery(q, sort);
      const { data, count, error } = await q.range(from, to);
      if (error) throw new Error(error.message);
      const total = count ?? 0;
      if (total === 0 && page === 1 && !subcategory && slug !== "ofertas" && filtersAreDefault(filters)) {
        const { data: fallback, error: fallbackError } = await (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT)
          .eq("active", true).gt("stock", 0).gt("price", 0).limit(LISTING_PAGE_SIZE);
        if (fallbackError) throw new Error(fallbackError.message);
        const rows = applyClientFilters((fallback || []) as Product[], filters);
        return { rows, total: rows.length, fallback: true };
      }
      return { rows: applyClientFilters((data || []) as Product[], filters), total, fallback: false };
    },
    enabled: scopeReady,
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["cat_manufacturers", slug, sub, siblingIds, subProductIds],
    queryFn: async () => {
      if (subcategory && (!subProductIds || subProductIds.length === 0)) return [];
      return loadManufacturerNames((q) => applyScope(q));
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

  const title = slug === "ofertas" ? "Ofertas" : (subcategory?.name || cat?.name || "Categoria");
  const products = listing?.rows ?? [];
  const total = listing?.total ?? 0;
  const safePage = Math.min(page, pageCount(total));

  return (
    <Layout>
      <Seo
        title={subcategory ? `${subcategory.name} - ${cat?.name ?? ""}` : title}
        description={`${title} com preço baixo na farmácia Atacadão dos Medicamentos. ${total} produtos disponíveis com entrega em Campina Grande - PB.`}
        path={sub && cat ? `/categoria/${cat.slug}/${sub}` : `/categoria/${slug}`}
      />
      <div className="container py-6 flex items-end justify-between gap-3">
        <div>
          <SeoBreadcrumbs
            className="mb-2"
            items={[
              { name: "Início", path: "/" },
              ...(cat ? [{ name: cat.name, path: subcategory ? `/categoria/${cat.slug}` : undefined }] : []),
              ...(subcategory ? [{ name: subcategory.name }] : []),
            ]}
          />
          <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{isLoading && !listing ? "Carregando produtos…" : `${total} produtos`}</p>
          {subcategory?.description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{subcategory.description}</p>}
        </div>
        <MobileFilters value={filters} onChange={changeFilters} hideCategories manufacturers={manufacturers} totalCount={total} />
      </div>

      <div className="container grid md:grid-cols-[240px_1fr] gap-6 pb-10">
        <ProductFilters value={filters} onChange={changeFilters} hideCategories manufacturers={manufacturers} />

        <div ref={listRef} className="scroll-mt-24">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <ActiveFilterChips value={filters} onChange={changeFilters} manufacturers={manufacturers} />
            <Select value={sort} onValueChange={changeSort}>
              <SelectTrigger className="w-[200px] ml-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                ))}
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
              <p className="text-muted-foreground">Nenhum produto encontrado com esses filtros.</p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={() => changeFilters(defaultFilters)}>Limpar filtros</Button>
                <Button asChild><Link to="/">Ver todos os produtos</Link></Button>
              </div>
            </div>
          )}
          <ListingPagination page={safePage} pageSize={LISTING_PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      </div>
    </Layout>
  );
}
