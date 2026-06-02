import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { ProductCard, Product } from "@/components/ProductCard";

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  const { data } = useQuery({
    queryKey: ["search", q],
    queryFn: async () => {
      if (!q) return [];
      const { data } = await supabase.from("products").select("*").eq("active", true).gt("stock", 0).ilike("name", `%${q}%`).limit(60);
      return (data || []) as Product[];
    },
  });

  return (
    <Layout>
      <div className="container py-6">
        <h1 className="text-2xl font-extrabold">Buscar: "{q}"</h1>
        <p className="text-muted-foreground text-sm mt-1">{data?.length ?? 0} resultados</p>
      </div>
      <div className="container pb-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {data?.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </div>
    </Layout>
  );
}
