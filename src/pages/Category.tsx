import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { ProductCard, Product } from "@/components/ProductCard";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function Category() {
  const { slug } = useParams<{ slug: string }>();
  const [sort, setSort] = useState("popular");
  const [onlyPromo, setOnlyPromo] = useState(false);
  const [noPresc, setNoPresc] = useState(false);

  const { data: cat } = useQuery({
    queryKey: ["cat", slug],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("slug", slug!).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  const { data: products } = useQuery({
    queryKey: ["cat_products", slug, sort, onlyPromo, noPresc],
    queryFn: async () => {
      let q = supabase.from("products").select("*").eq("active", true);
      if (slug === "ofertas") q = q.eq("on_sale", true);
      else if (cat) q = q.eq("category_id", cat.id);
      else return [];
      if (onlyPromo) q = q.eq("on_sale", true);
      if (noPresc) q = q.eq("requires_prescription", false);
      if (sort === "price_asc") q = q.order("price", { ascending: true });
      else if (sort === "price_desc") q = q.order("price", { ascending: false });
      else if (sort === "new") q = q.order("created_at", { ascending: false });
      else q = q.order("featured", { ascending: false });
      const { data } = await q.limit(60);
      return (data || []) as Product[];
    },
    enabled: !!slug && (slug === "ofertas" || !!cat),
  });

  const title = slug === "ofertas" ? "Ofertas" : cat?.name || "Categoria";

  return (
    <Layout>
      <div className="container py-6">
        <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
        <p className="text-muted-foreground text-sm mt-1">{products?.length ?? 0} produtos</p>
      </div>

      <div className="container grid md:grid-cols-[220px_1fr] gap-6">
        <aside className="hidden md:block bg-card border rounded-xl p-4 h-fit shadow-card">
          <h3 className="font-semibold mb-3">Filtros</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="promo" checked={onlyPromo} onCheckedChange={(v) => setOnlyPromo(!!v)} />
              <Label htmlFor="promo" className="cursor-pointer">Em promoção</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="nopresc" checked={noPresc} onCheckedChange={(v) => setNoPresc(!!v)} />
              <Label htmlFor="nopresc" className="cursor-pointer">Sem necessidade de receita</Label>
            </div>
          </div>
        </aside>

        <div>
          <div className="flex justify-end mb-4">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="popular">Mais vendidos</SelectItem>
                <SelectItem value="price_asc">Menor preço</SelectItem>
                <SelectItem value="price_desc">Maior preço</SelectItem>
                <SelectItem value="new">Novidades</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {products?.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
          {products?.length === 0 && <p className="text-center text-muted-foreground py-12">Nenhum produto encontrado.</p>}
        </div>
      </div>
    </Layout>
  );
}
