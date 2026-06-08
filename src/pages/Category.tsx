import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { ProductCard, Product } from "@/components/ProductCard";
import { useMemo, useState } from "react";
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

export default function Category() {
  const { slug } = useParams<{ slug: string }>();
  const [sort, setSort] = useState("popular");
  const [filters, setFilters] = useState<ProductFiltersState>(defaultFilters);

  const { data: cat } = useQuery({
    queryKey: ["cat", slug],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("slug", slug!).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  const { data: products } = useQuery({
    queryKey: ["cat_products", slug, sort, filters],
    queryFn: async () => {
      let q: any = supabase.from("products").select("*").eq("active", true);
      if (slug === "ofertas") q = q.eq("on_sale", true);
      else if (cat) q = q.eq("category_id", cat.id);
      else return [];
      q = buildQuery(q, filters);
      q = sortQuery(q, sort);
      const { data } = await q.limit(120);
      return applyClientFilters((data || []) as Product[], filters);
    },
    enabled: !!slug && (slug === "ofertas" || !!cat),
  });

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p: any) => p.manufacturer && set.add(p.manufacturer));
    return Array.from(set).sort();
  }, [products]);

  const title = slug === "ofertas" ? "Ofertas" : cat?.name || "Categoria";
  const count = products?.length ?? 0;

  return (
    <Layout>
      <div className="container py-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{count} produtos</p>
        </div>
        <MobileFilters value={filters} onChange={setFilters} hideCategories manufacturers={manufacturers} totalCount={count} />
      </div>

      <div className="container grid md:grid-cols-[240px_1fr] gap-6 pb-10">
        <ProductFilters value={filters} onChange={setFilters} hideCategories manufacturers={manufacturers} />

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
