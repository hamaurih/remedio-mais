import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_DASHBOARD_RANGES = [
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "365", label: "12 meses" },
] as const;

export type AdminDashboardRangeKey = (typeof ADMIN_DASHBOARD_RANGES)[number]["key"];

export function useAdminDashboardData() {
  const [rangeKey, setRangeKey] = useState<AdminDashboardRangeKey>("30");
  const days = Number(rangeKey);
  const since = useMemo(() => startOfDay(subDays(new Date(), days - 1)).toISOString(), [days]);

  const kpis = useQuery({
    queryKey: ["admin_bi_kpis", days],
    queryFn: async () => {
      const headP = <T,>(p: any) => p as Promise<{ count: number | null }>;
      const [
        prodAll, prodActive, prodLow, prodSale, prodNoEAN, prodNoEANStock,
        ordersAll, ordersPaid, ordersPending, ordersCancelled, ordersInRange,
        revenueAll, revenuePaid, revenueRange,
        customers, presc, prescPending,
        stockAgg, syncRecent,
      ] = await Promise.all([
        headP(supabase.from("products").select("id", { count: "exact", head: true })),
        headP(supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true)),
        headP(supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true).lte("stock", 5)),
        headP(supabase.from("products").select("id", { count: "exact", head: true }).or("on_sale.eq.true,promo_price.not.is.null")),
        headP(supabase.from("products").select("id", { count: "exact", head: true }).or("barcode.is.null,barcode.eq.")),
        headP(supabase.from("products").select("id", { count: "exact", head: true }).or("barcode.is.null,barcode.eq.").gt("stock", 0)),
        headP(supabase.from("orders").select("id", { count: "exact", head: true })),
        headP(supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "approved")),
        headP(supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "pending")),
        headP(supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "cancelled")),
        headP(supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since)),
        supabase.from("orders").select("total"),
        supabase.from("orders").select("total").eq("payment_status", "approved"),
        supabase.from("orders").select("total").eq("payment_status", "approved").gte("created_at", since),
        headP(supabase.from("profiles").select("id", { count: "exact", head: true })),
        headP(supabase.from("prescriptions").select("id", { count: "exact", head: true })),
        headP(supabase.from("prescriptions").select("id", { count: "exact", head: true }).in("status", ["recebida", "pendente"])),
        supabase.from("products").select("stock,price").eq("active", true).gt("stock", 0),
        headP(supabase.from("product_sync_logs").select("id", { count: "exact", head: true }).gte("created_at", since)),
      ]);

      const sum = (rows: any[] | null, key = "total") =>
        (rows || []).reduce((acc, r) => acc + Number(r[key] || 0), 0);
      const stockValue = (stockAgg.data || []).reduce(
        (acc, row) => acc + Number(row.stock || 0) * Number(row.price || 0),
        0,
      );

      return {
        prodAll: prodAll.count || 0,
        prodActive: prodActive.count || 0,
        prodLow: prodLow.count || 0,
        prodSale: prodSale.count || 0,
        prodNoEAN: prodNoEAN.count || 0,
        prodNoEANStock: prodNoEANStock.count || 0,
        ordersAll: ordersAll.count || 0,
        ordersPaid: ordersPaid.count || 0,
        ordersPending: ordersPending.count || 0,
        ordersCancelled: ordersCancelled.count || 0,
        ordersInRange: ordersInRange.count || 0,
        revenueAll: sum(revenueAll.data),
        revenuePaid: sum(revenuePaid.data),
        revenueRange: sum(revenueRange.data),
        ticket: ordersPaid.count ? sum(revenuePaid.data) / (ordersPaid.count || 1) : 0,
        customers: customers.count || 0,
        presc: presc.count || 0,
        prescPending: prescPending.count || 0,
        stockValue,
        syncRecent: syncRecent.count || 0,
      };
    },
  });

  const series = useQuery({
    queryKey: ["admin_bi_series", days],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("created_at,total,payment_status")
        .gte("created_at", since)
        .order("created_at");
      const buckets: Record<string, { date: string; receita: number; pedidos: number }> = {};
      for (let i = 0; i < days; i++) {
        const date = format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd");
        buckets[date] = { date, receita: 0, pedidos: 0 };
      }
      (data || []).forEach((order: any) => {
        const date = format(new Date(order.created_at), "yyyy-MM-dd");
        if (!buckets[date]) return;
        buckets[date].pedidos += 1;
        if (order.payment_status === "approved") buckets[date].receita += Number(order.total || 0);
      });
      return Object.values(buckets);
    },
  });

  const topProducts = useQuery({
    queryKey: ["admin_bi_top_products", days],
    queryFn: async () => {
      const { data: orderRows } = await supabase
        .from("orders")
        .select("id")
        .gte("created_at", since)
        .in("payment_status", ["approved", "pending"]);
      const ids = (orderRows || []).map((order: any) => order.id);
      if (!ids.length) return [] as any[];
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name,quantity,total")
        .in("order_id", ids);
      const map = new Map<string, { name: string; qtd: number; receita: number }>();
      (items || []).forEach((item: any) => {
        const key = item.product_name || "—";
        const current = map.get(key) || { name: key, qtd: 0, receita: 0 };
        current.qtd += Number(item.quantity || 0);
        current.receita += Number(item.total || 0);
        map.set(key, current);
      });
      return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 10);
    },
  });

  const catalog = useQuery({
    queryKey: ["admin_bi_catalog"],
    queryFn: async () => {
      const { data: products } = await supabase
        .from("products")
        .select("category_id,stock,price,active")
        .eq("active", true);
      const { data: categories } = await supabase.from("categories").select("id,name");
      const map = new Map<string, { name: string; qtd: number; valor: number }>();
      (products || []).forEach((product: any) => {
        const category = categories?.find((row: any) => row.id === product.category_id);
        const key = category?.name || "Sem categoria";
        const current = map.get(key) || { name: key, qtd: 0, valor: 0 };
        current.qtd += 1;
        current.valor += Number(product.stock || 0) * Number(product.price || 0);
        map.set(key, current);
      });
      return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 10);
    },
  });

  const lowStock = useQuery({
    queryKey: ["admin_bi_low_stock"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,stock,minimum_stock,price")
        .eq("active", true)
        .lte("stock", 5)
        .order("stock")
        .limit(8);
      return data || [];
    },
  });

  const recentOrders = useQuery({
    queryKey: ["admin_bi_recent_orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,customer_name,total,payment_status,order_status,created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  return {
    rangeKey,
    setRangeKey,
    days,
    kpis,
    series,
    topProducts,
    catalog,
    lowStock,
    recentOrders,
  };
}
