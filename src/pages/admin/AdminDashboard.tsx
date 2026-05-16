import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Package, ShoppingBag, FileText, Tag, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatBRL } from "@/lib/store";

export default function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ["admin_dashboard_v2"],
    queryFn: async () => {
      const [all, active, low, sale, orders, presc, lastProducts, lastOrders, lastPresc] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("products").select("id, name, stock, minimum_stock").lte("stock", 5).order("stock").limit(10),
        supabase.from("products").select("id", { count: "exact", head: true }).or("on_sale.eq.true,promo_price.not.is.null"),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("prescriptions").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id, name, price, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("orders").select("id, customer_name, total, status, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("prescriptions").select("id, customer_name, status, created_at").order("created_at", { ascending: false }).limit(5),
      ]);
      return {
        total: all.count || 0, active: active.count || 0, lowList: low.data || [],
        sale: sale.count || 0, orders: orders.count || 0, presc: presc.count || 0,
        lastProducts: lastProducts.data || [], lastOrders: lastOrders.data || [], lastPresc: lastPresc.data || [],
      };
    },
  });

  const cards = [
    { label: "Produtos cadastrados", value: data?.total, icon: Package, to: "/admin/produtos" },
    { label: "Produtos ativos", value: data?.active, icon: CheckCircle2, to: "/admin/produtos" },
    { label: "Estoque baixo", value: data?.lowList?.length, icon: AlertTriangle, to: "/admin/produtos", warn: true },
    { label: "Em oferta", value: data?.sale, icon: Tag, to: "/admin/ofertas" },
    { label: "Pedidos recebidos", value: data?.orders, icon: ShoppingBag, to: "/admin/pedidos" },
    { label: "Receitas enviadas", value: data?.presc, icon: FileText, to: "/admin/receitas" },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-extrabold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((c) => (
          <Link to={c.to} key={c.label} className="bg-card border rounded-xl p-5 shadow-card hover:border-primary transition-colors">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <c.icon className={`h-5 w-5 ${c.warn ? "text-primary" : "text-primary"}`} />
            </div>
            <div className={`text-3xl font-extrabold mt-2 ${c.warn && (c.value ?? 0) > 0 ? "text-primary" : ""}`}>{c.value ?? "—"}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Últimos produtos">
          {data?.lastProducts.map((p: any) => (
            <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span className="truncate">{p.name}</span><span className="text-muted-foreground">{formatBRL(p.price)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Últimos pedidos">
          {data?.lastOrders.map((o: any) => (
            <div key={o.id} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span className="truncate">{o.customer_name}</span><span className="text-muted-foreground">{formatBRL(o.total)}</span>
            </div>
          ))}
          {data?.lastOrders.length === 0 && <div className="text-xs text-muted-foreground">Nenhum pedido ainda.</div>}
        </Panel>
        <Panel title="Últimas receitas">
          {data?.lastPresc.map((p: any) => (
            <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span className="truncate">{p.customer_name}</span><span className="text-xs text-muted-foreground">{p.status}</span>
            </div>
          ))}
          {data?.lastPresc.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma receita ainda.</div>}
        </Panel>
      </div>

      {data && data.lowList.length > 0 && (
        <Panel title="⚠️ Produtos com estoque baixo">
          {data.lowList.map((p: any) => (
            <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span>{p.name}</span><span className="text-primary font-semibold">{p.stock} un.</span>
            </div>
          ))}
        </Panel>
      )}

      <div className="bg-secondary/50 border rounded-xl p-4 text-sm text-muted-foreground">
        💡 <strong>Dicas:</strong> cadastre produtos em <Link to="/admin/produtos" className="text-primary underline">Produtos</Link>,
        marque-os para aparecer nas vitrines da home na aba <em>Vitrine</em>. Gerencie ofertas em <Link to="/admin/ofertas" className="text-primary underline">Ofertas</Link>.
        Configure dados da farmácia em <Link to="/admin/config" className="text-primary underline">Configurações</Link>.
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-card">
      <div className="font-bold mb-3">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
