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
import { PUBLIC_PRODUCT_SELECT } from "@/lib/productSelect";

const sb = supabase as any;

export default function Department() {
  const { slug } = useParams<{ slug: string }>();
  const [sort, setSort] = useState("popular");
  const [filters, setFilters] = useState<ProductFiltersState>(defaultFilters);

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

  const { data: products } = useQuery({
    queryKey: ["dept_products", dept?.id, productIds, categoryIds, sort, filters],
    queryFn: async () => {
      let q: any = supabase.from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true);
      // Prefer commercial classification via product_taxonomy; fall back to legacy category_id link
      if (productIds && productIds.length > 0) {
        q = q.in("id", productIds);
      } else if (categoryIds.length > 0) {
        q = q.in("category_id", categoryIds);
      } else {
        return [];
      }
      q = buildQuery(q, filters);
      q = sortQuery(q, sort);
      const { data } = await q.limit(240);
      return applyClientFilters((data || []) as Product[], filters);
    },
    enabled: !!dept?.id && productIds !== undefined,
  });

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p: any) => p.manufacturer && set.add(p.manufacturer));
    return Array.from(set).sort();
  }, [products]);

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

  const count = products?.length ?? 0;

  return (
    <Layout>
      <div className="container py-6">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold" style={{ color: dept?.band_color || undefined }}>
              {dept?.name || "Departamento"}
            </h1>
            {dept?.description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{dept.description}</p>}
            <p className="text-muted-foreground text-sm mt-1">{count} produtos</p>
          </div>
          <MobileFilters value={filters} onChange={setFilters} hideCategories manufacturers={manufacturers} totalCount={count} />
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
        <ProductFilters value={filters} onChange={setFilters} hideCategories manufacturers={manufacturers} />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <ActiveFilterChips value={filters} onChange={setFilters} />
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[200px] ml-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {products?.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
          {count === 0 && (
            <div className="text-center py-16 space-y-4">
              <p className="text-muted-foreground">Nenhum produto neste departamento ainda.</p>
              <Button asChild><Link to="/">Ver todos os produtos</Link></Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
