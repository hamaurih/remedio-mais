import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { ProductCard, Product } from "@/components/ProductCard";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
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

export default function Category() {
  const { slug, sub } = useParams<{ slug: string; sub?: string }>();
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

  const { data: products } = useQuery({
    queryKey: ["cat_products", slug, sub, sort, filters, siblingIds, subProductIds],
    queryFn: async () => {
      let q: any = (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("active", true);
      if (slug === "ofertas") q = q.eq("on_sale", true);
      else if (cat) {
        if (isHub && siblingIds && siblingIds.length > 0) {
          q = q.in("category_id", siblingIds);
        } else {
          q = q.eq("category_id", cat.id);
        }
      } else return [];
      if (subcategory) {
        if (!subProductIds || subProductIds.length === 0) return [];
        q = q.in("id", subProductIds);
      }
      q = buildQuery(q, filters);
      q = sortQuery(q, sort);
      const { data } = await q.limit(240);
      return applyClientFilters((data || []) as Product[], filters);
    },
    enabled: !!slug && (slug === "ofertas" || !!cat) && (!isHub || !!siblingIds) && (!sub || subProductIds !== undefined),
  });

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p: any) => p.manufacturer && set.add(p.manufacturer));
    return Array.from(set).sort();
  }, [products]);

  const title = slug === "ofertas" ? "Ofertas" : (subcategory?.name || cat?.name || "Categoria");
  const count = products?.length ?? 0;

  return (
    <Layout>
      <Seo
        title={subcategory ? `${subcategory.name} - ${cat?.name ?? ""}` : title}
        description={`${title} com preço baixo na farmácia Atacadão dos Medicamentos. ${count} produtos disponíveis com entrega em Campina Grande - PB.`}
        path={sub && cat ? `/categoria/${cat.slug}/${sub}` : `/categoria/${slug}`}
      />
      <div className="container py-6 flex items-end justify-between gap-3">
        <div>
          {subcategory && cat && (
            <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Link to={`/categoria/${cat.slug}`} className="hover:text-primary">{cat.name}</Link>
              <ChevronRight className="h-3 w-3" />
              <span>{subcategory.name}</span>
            </nav>
          )}
          <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{count} produtos</p>
          {subcategory?.description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{subcategory.description}</p>}
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
