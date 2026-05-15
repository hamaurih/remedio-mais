import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, ShoppingBag, FileText, Image as ImageIcon } from "lucide-react";

export default function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ["admin_dashboard"],
    queryFn: async () => {
      const [p, o, r, b] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("prescriptions").select("id", { count: "exact", head: true }),
        supabase.from("banners").select("id", { count: "exact", head: true }).eq("active", true),
      ]);
      return { products: p.count || 0, orders: o.count || 0, prescriptions: r.count || 0, banners: b.count || 0 };
    },
  });

  const cards = [
    { label: "Produtos cadastrados", value: data?.products, icon: Package },
    { label: "Pedidos recebidos", value: data?.orders, icon: ShoppingBag },
    { label: "Receitas", value: data?.prescriptions, icon: FileText },
    { label: "Banners ativos", value: data?.banners, icon: ImageIcon },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-extrabold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border rounded-xl p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{c.label}</div>
              <c.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="text-3xl font-extrabold mt-2">{c.value ?? "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
