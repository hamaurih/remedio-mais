import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/components/ProductCard";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/productSelect";

const LIMIT = 10;

export function useRelatedProducts(product: any | null | undefined) {
  return useQuery({
    queryKey: ["related-products", product?.id],
    enabled: !!product?.id,
    queryFn: async (): Promise<Product[]> => {
      if (!product?.id) return [];

      // 1) Manual: product_related
      const { data: manualLinks } = await supabase
        .from("product_related")
        .select("related_product_id, position")
        .eq("product_id", product.id)
        .order("position", { ascending: true });
      const ids = (manualLinks || []).map((l: any) => l.related_product_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("products")
          .select(PUBLIC_PRODUCT_SELECT)
          .in("id", ids)
          .eq("active", true);
        const byId = new Map((data || []).map((p: any) => [p.id, p]));
        return ids.map((id) => byId.get(id)).filter(Boolean) as Product[];
      }

      // 2) Auto: mesmo princípio ativo → mesma categoria+fabricante → mesma categoria
      const collected = new Map<string, any>();
      const push = (rows: any[]) => {
        for (const r of rows) {
          if (r.id === product.id) continue;
          if (!collected.has(r.id)) collected.set(r.id, r);
          if (collected.size >= LIMIT) break;
        }
      };

      if (product.active_ingredient) {
        const { data } = await supabase
          .from("products")
          .select(PUBLIC_PRODUCT_SELECT)
          .eq("active", true)
          .gt("stock", 0)
          .ilike("active_ingredient", product.active_ingredient.trim())
          .neq("id", product.id)
          .limit(LIMIT);
        push(data || []);
      }

      if (collected.size < LIMIT && product.category_id && product.manufacturer) {
        const { data } = await supabase
          .from("products")
          .select(PUBLIC_PRODUCT_SELECT)
          .eq("active", true)
          .gt("stock", 0)
          .eq("category_id", product.category_id)
          .eq("manufacturer", product.manufacturer)
          .neq("id", product.id)
          .limit(LIMIT);
        push(data || []);
      }

      if (collected.size < LIMIT && product.category_id) {
        const { data } = await supabase
          .from("products")
          .select(PUBLIC_PRODUCT_SELECT)
          .eq("active", true)
          .gt("stock", 0)
          .eq("category_id", product.category_id)
          .neq("id", product.id)
          .limit(LIMIT);
        push(data || []);
      }

      return Array.from(collected.values()) as Product[];
    },
  });
}
