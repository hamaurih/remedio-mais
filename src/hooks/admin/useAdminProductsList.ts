import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type UseAdminProductsListParams = {
  search: string;
  catFilter: string;
  manuFilter: string;
  statusFilter: string;
  page: number;
  pageSize: number;
};

export function useAdminProductsList({
  search,
  catFilter,
  manuFilter,
  statusFilter,
  page,
  pageSize,
}: UseAdminProductsListParams) {
  const { data: productsResp } = useQuery({
    queryKey: ["admin_products", { search, catFilter, manuFilter, statusFilter, page, pageSize }],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_products_list", {
        _search: search || null,
        _category_id: catFilter === "all" ? null : catFilter,
        _manufacturer: manuFilter === "all" ? null : manuFilter,
        _status: statusFilter,
        _page: page,
        _page_size: pageSize,
      });
      if (error) throw error;
      const rows = (data?.rows || []).map((r: any) => ({
        ...r,
        categories: r.categories ?? (r.category_display_name ? { name: r.category_display_name } : null),
      }));
      return { rows, count: data?.total ?? data?.count ?? 0 };
    },
  });

  const products = productsResp?.rows || [];
  const totalCount = productsResp?.count || 0;

  const { data: cats } = useQuery({
    queryKey: ["admin_cats_list"],
    queryFn: async () => (await supabase.from("categories").select("*").order("position")).data || [],
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["admin_manufacturers"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("manufacturer").not("manufacturer", "is", null).limit(5000);
      const unique = new Set<string>();
      (data || []).forEach((p: any) => { if (p.manufacturer) unique.add(p.manufacturer); });
      return Array.from(unique).sort((a, b) => a.localeCompare(b));
    },
  });

  const { data: trierAdjust = {} } = useQuery({
    queryKey: ["recent_trier_price_changes"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await (supabase as any)
        .from("product_price_history")
        .select("product_id,old_price,new_price,changed_at,change_type,source")
        .eq("source", "trier")
        .gte("changed_at", since)
        .order("changed_at", { ascending: false })
        .limit(3000);
      const map: Record<string, any> = {};
      (data || []).forEach((row: any) => {
        if (row.product_id && !map[row.product_id]) map[row.product_id] = row;
      });
      return map;
    },
    staleTime: 60_000,
  });

  const isAdjustFilter = statusFilter.startsWith("readjusted");
  const adjustIds = useMemo(() => Object.keys(trierAdjust || {}), [trierAdjust]);

  const { data: adjustedRows = [] } = useQuery({
    queryKey: ["admin_products_readjusted", adjustIds.length, statusFilter],
    enabled: isAdjustFilter && adjustIds.length > 0,
    queryFn: async () => {
      const out: any[] = [];
      for (let i = 0; i < adjustIds.length; i += 300) {
        const chunk = adjustIds.slice(i, i + 300);
        const { data, error } = await (supabase as any)
          .from("products")
          .select("*, categories(name)")
          .in("id", chunk);
        if (error) throw error;
        out.push(...(data || []));
      }
      return out;
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (isAdjustFilter) {
      const term = search.trim().toLowerCase();
      return adjustedRows.filter((product: any) => {
        const adjustment = (trierAdjust as Record<string, any>)[product.id];
        if (!adjustment) return false;
        const diff = Number(adjustment.new_price ?? 0) - Number(adjustment.old_price ?? 0);
        if (statusFilter === "readjusted_up" && diff <= 0) return false;
        if (statusFilter === "readjusted_down" && diff >= 0) return false;
        if (catFilter !== "all" && product.category_id !== catFilter) return false;
        if (manuFilter !== "all" && product.manufacturer !== manuFilter) return false;
        if (term && !`${product.name ?? ""} ${product.barcode ?? ""} ${product.sku ?? ""}`.toLowerCase().includes(term)) return false;
        return true;
      });
    }
    if (statusFilter !== "low") return products;
    return products.filter((product: any) => product.stock <= (product.minimum_stock ?? 5));
  }, [products, statusFilter, isAdjustFilter, adjustedRows, trierAdjust, search, catFilter, manuFilter]);

  const effTotal = isAdjustFilter ? filtered.length : totalCount;
  const effTotalPages = Math.max(1, Math.ceil(effTotal / pageSize));
  const pageRows = isAdjustFilter ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;

  return {
    cats,
    manufacturers,
    trierAdjust,
    pageRows,
    effTotal,
    effTotalPages,
  };
}
