import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useSearchParams } from "react-router-dom";
import { ProductCard, Product } from "@/components/ProductCard";
import { useEffect, useMemo, useState } from "react";
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
import { PUBLIC_PRODUCT_SELECT } from "@/lib/productSelect";
import { trackSearch } from "@/lib/metaEvents";

function rankRow(name: string, term: string) {
  const n = (name || "").toLowerCase();
  const t = term.toLowerCase();
  if (n.startsWith(t)) return 0;
  if (n.split(/\s+/).some((w) => w.startsWith(t))) return 1;
  if (n.includes(t)) return 2;
  return 3;
}

export default function Search() {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const [sort, setSort] = useState("popular");
  const [filters, setFilters] = useState<ProductFiltersState>(defaultFilters);

  // Meta Search: apenas o termo digitado pelo cliente.
  useEffect(() => { if (q) trackSearch(q); }, [q]);

  const { data: products } = useQuery({
    queryKey: ["search", q, sort, filters],
    queryFn: async () => {
      if (!q) return [];
      const term = q.replace(/[%_]/g, "");
      const numeric = /^\d+$/.test(term);
      const orFilter = [
        `name.ilike.%${term}%`,
        `manufacturer.ilike.%${term}%`,
        `active_ingredient.ilike.%${term}%`,
        `category_name.ilike.%${term}%`,
        numeric ? `barcode.eq.${term}` : null,
      ]
        .filter(Boolean)
        .join(",");

      let qb: any = (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true).or(orFilter);
      qb = buildQuery(qb, filters);
      if (filters.categorySlugs.length) {
        const { data: cs } = await supabase
          .from("categories")
          .select("id, slug")
          .in("slug", filters.categorySlugs);
        const ids = (cs ?? []).map((c) => c.id);
        if (ids.length) qb = qb.in("category_id", ids);
      }
      qb = sortQuery(qb, sort);
      const { data } = await qb.limit(120);
      const rows = applyClientFilters((data || []) as Product[], filters);
      if (sort === "popular") {
        rows.sort((a: any, b: any) => rankRow(a.name, term) - rankRow(b.name, term));
      }
      return rows;
    },
  });

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p: any) => p.manufacturer && set.add(p.manufacturer));
    return Array.from(set).sort();
  }, [products]);

  const count = products?.length ?? 0;

  return (
    <Layout>
      <div className="container py-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Buscar: "{q}"</h1>
          <p className="text-muted-foreground text-sm mt-1">{count} resultados</p>
        </div>
        <MobileFilters value={filters} onChange={setFilters} manufacturers={manufacturers} totalCount={count} />
      </div>

      <div className="container grid md:grid-cols-[240px_1fr] gap-6 pb-10">
        <ProductFilters value={filters} onChange={setFilters} manufacturers={manufacturers} />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <ActiveFilterChips value={filters} onChange={setFilters} />
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[200px] ml-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {products?.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
          {count === 0 && (
            <div className="text-center py-16 space-y-4">
              <p className="text-muted-foreground">Nenhum produto encontrado com esses filtros.</p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={() => setFilters(defaultFilters)}>Limpar filtros</Button>
                <Button asChild><Link to="/">Ver todos os produtos</Link></Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
