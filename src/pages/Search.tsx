import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useSearchParams } from "react-router-dom";
import { ProductCard, Product } from "@/components/ProductCard";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { trackSearch } from "@/lib/metaEvents";
import { Seo } from "@/components/Seo";

const SEARCH_RESULT_CAP = 120;

function rankRow(name: string, term: string) {
  const n = (name || "").toLowerCase();
  const t = term.toLowerCase();
  if (n.startsWith(t)) return 0;
  if (n.split(/\s+/).some((w) => w.startsWith(t))) return 1;
  if (n.includes(t)) return 2;
  return 3;
}

function searchOrFilter(term: string) {
  const numeric = /^\d+$/.test(term);
  return [
    `name.ilike.%${term}%`,
    `manufacturer.ilike.%${term}%`,
    `active_ingredient.ilike.%${term}%`,
    `category_name.ilike.%${term}%`,
    numeric ? `barcode.eq.${term}` : null,
    numeric ? `trier_barcode.eq.${term}` : null,
    numeric ? `sku.eq.${term}` : null,
  ].filter(Boolean).join(",");
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const page = parseListingPage(params.get("pagina"));
  const [sort, setSort] = useState("popular");
  const [filters, setFilters] = useState<ProductFiltersState>(defaultFilters);
  const listRef = useRef<HTMLDivElement>(null);
  const skipScroll = useRef(true);
  const previousQuery = useRef(q);

  const setPage = useCallback((nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete("pagina");
    else next.set("pagina", String(nextPage));
    setParams(next, { replace: true });
  }, [params, setParams]);

  const changeFilters = (next: ProductFiltersState) => {
    setFilters(next);
    if (page !== 1) setPage(1);
  };

  const changeSort = (value: string) => {
    setSort(value);
    if (page !== 1) setPage(1);
  };

  // Meta Search: apenas o termo digitado pelo cliente.
  useEffect(() => { if (q) trackSearch(q); }, [q]);

  useEffect(() => {
    if (previousQuery.current === q) return;
    previousQuery.current = q;
    if (page !== 1) setPage(1);
  }, [q, page, setPage]);

  const { data: listing, isLoading, isError, refetch } = useQuery({
    queryKey: ["search", q, sort, filters, page],
    queryFn: async () => {
      if (!q) return { rows: [] as Product[], total: 0, capped: false };
      const term = q.replace(/[%_]/g, "");
      const orFilter = searchOrFilter(term);
      const { from, to } = listingRange(page);
      let categoryIds: string[] | null = null;
      if (filters.categorySlugs.length) {
        const { data: cs, error } = await supabase.from("categories").select("id, slug").in("slug", filters.categorySlugs);
        if (error) throw new Error(error.message);
        categoryIds = (cs ?? []).map((c) => c.id);
        if (categoryIds.length === 0) return { rows: [] as Product[], total: 0, capped: false };
      }

      // The builder is thenable. Apply limit/range before awaiting it,
      // otherwise the request runs without pagination.
      const scoped = () => {
        let qb: any = (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT, { count: "exact" }).eq("active", true).or(orFilter);
        qb = buildQuery(qb, filters);
        if (categoryIds) qb = qb.in("category_id", categoryIds);
        return qb;
      };

      if (sort === "popular") {
        const { data, count, error } = await scoped().limit(SEARCH_RESULT_CAP);
        if (error) throw new Error(error.message);
        const ranked = applyClientFilters((data || []) as Product[], filters);
        ranked.sort((a: any, b: any) => rankRow(a.name, term) - rankRow(b.name, term));
        return {
          rows: ranked.slice(from, to + 1),
          total: ranked.length,
          capped: (count ?? 0) > SEARCH_RESULT_CAP,
        };
      }

      const { data, count, error } = await sortQuery(scoped(), sort).range(from, to);
      if (error) throw new Error(error.message);
      return { rows: applyClientFilters((data || []) as Product[], filters), total: count ?? 0, capped: false };
    },
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["search_manufacturers", q],
    queryFn: async () => {
      if (!q) return [];
      const orFilter = searchOrFilter(q.replace(/[%_]/g, ""));
      return loadManufacturerNames((query) => query.or(orFilter));
    },
    enabled: q.length > 0,
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

  const products = listing?.rows ?? [];
  const total = listing?.total ?? 0;
  const safePage = Math.min(page, pageCount(total));

  return (
    <Layout>
      <Seo title={q ? `Busca: ${q}` : "Buscar produtos"} description="Encontre medicamentos, genéricos, higiene e beleza com os melhores preços na Farmácia Atacadão dos Medicamentos." path="/buscar" noindex />
      <div className="container py-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Buscar: "{q}"</h1>
          <p className="text-muted-foreground text-sm mt-1">{isLoading && !listing ? "Carregando resultados…" : `${total} resultados`}</p>
        </div>
        <MobileFilters value={filters} onChange={changeFilters} manufacturers={manufacturers} totalCount={total} />
      </div>

      <div className="container grid md:grid-cols-[240px_1fr] gap-6 pb-10">
        <ProductFilters value={filters} onChange={changeFilters} manufacturers={manufacturers} />

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
              <p className="text-muted-foreground">Não foi possível carregar a busca.</p>
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
          {listing?.capped && (
            <p className="text-xs text-muted-foreground text-center mt-4">A ordenação por relevância usa os {SEARCH_RESULT_CAP} primeiros resultados da busca.</p>
          )}
          <ListingPagination page={safePage} pageSize={LISTING_PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      </div>
    </Layout>
  );
}
