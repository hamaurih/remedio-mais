import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/store";
import { ArrowRight, BarChart3, Boxes, Building2, CreditCard, FileText, Globe2, Landmark, Megaphone, Package, ReceiptText, Settings, ShoppingBag, ShoppingCart, Store, Tags, UserCog, Users, WalletCards } from "lucide-react";

type Module = { title: string; description: string; to: string; icon: any };

const groups: Array<{ title: string; subtitle: string; modules: Module[] }> = [
  {
    title: "Operação da farmácia",
    subtitle: "Acesso rápido ao que a equipe usa todos os dias.",
    modules: [
      { title: "Vendas e Pedidos", description: "Pedidos do site, status, separação e atendimento.", to: "/admin/pedidos", icon: ShoppingBag },
      { title: "PDV", description: "Venda de balcão, caixa e operação presencial.", to: "/admin/pdv", icon: CreditCard },
      { title: "Estoque", description: "Saldo, movimentações, estoque baixo e inventário.", to: "/admin/estoque", icon: Boxes },
      { title: "Receitas", description: "Fila de receitas, análise, aprovação e acompanhamento.", to: "/admin/receitas", icon: FileText },
    ],
  },
  {
    title: "Gestão e inteligência",
    subtitle: "Decisões de compra, preço, estrutura e desempenho do negócio.",
    modules: [
      { title: "Matriz e Filiais", description: "Cadastro das unidades, regularização legal, sanitária, CRF, ANVISA e fiscal.", to: "/admin/unidades", icon: Building2 },
      { title: "Curva ABC", description: "Produtos A, B e C por faturamento, giro e participação acumulada.", to: "/admin/curva-abc", icon: BarChart3 },
      { title: "BI Executivo", description: "Vendas, faturamento, ticket, estoque e indicadores operacionais.", to: "/admin/bi", icon: BarChart3 },
      { title: "Produtos e Cadastro", description: "Catálogo, EAN, categorias, descrição e publicação.", to: "/admin/produtos", icon: Package },
      { title: "Preços e Ofertas", description: "Preço base, promoções, descontos e monitoramento.", to: "/admin/monitor-precos", icon: Tags },
      { title: "Financeiro", description: "Pagamentos, recebimentos e conciliação das vendas.", to: "/admin/pagamentos", icon: WalletCards },
      { title: "Clientes", description: "Cadastro, histórico e relacionamento com clientes.", to: "/admin/clientes", icon: Users },
      { title: "Vendedores", description: "Convites, acessos e permissões da equipe de vendas.", to: "/admin/vendedores", icon: UserCog },
    ],
  },
  {
    title: "Site e crescimento",
    subtitle: "Controle da loja virtual e aquisição de clientes.",
    modules: [
      { title: "Site e E-commerce", description: "Home, vitrines, banners, menus, campanhas e experiência da loja.", to: "/admin/site", icon: Globe2 },
      { title: "Marketing", description: "Campanhas, ofertas, Meta Ads e conversões.", to: "/admin/campanhas", icon: Megaphone },
      { title: "Configurações", description: "Empresa, integrações, pagamentos e parâmetros do sistema.", to: "/admin/config", icon: Settings },
    ],
  },
];

export default function AdminHome() {
  const overview = useQuery({
    queryKey: ["admin-home-overview"],
    queryFn: async () => {
      const db = supabase as any;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();
      const [ordersToday, paidToday, pendingOrders, lowStock, pendingPrescriptions] = await Promise.all([
        db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        db.from("orders").select("total").eq("payment_status", "approved").gte("created_at", todayIso),
        db.from("orders").select("id", { count: "exact", head: true }).in("payment_status", ["pending", "processing"]),
        db.from("products").select("id", { count: "exact", head: true }).eq("active", true).lte("stock", 5),
        db.from("prescriptions").select("id", { count: "exact", head: true }).in("status", ["recebida", "pendente", "under_review"]),
      ]);
      const revenueToday = (paidToday.data || []).reduce((sum: number, row: any) => sum + Number(row.total || 0), 0);
      return { ordersToday: ordersToday.count || 0, revenueToday, pendingOrders: pendingOrders.count || 0, lowStock: lowStock.count || 0, pendingPrescriptions: pendingPrescriptions.count || 0 };
    },
    refetchInterval: 60_000,
  });
  const k = overview.data;

  return (
    <div className="min-h-full bg-muted/20">
      <div className="max-w-[1480px] mx-auto p-4 md:p-6 lg:p-8 space-y-8">
        <section className="rounded-3xl border bg-card overflow-hidden shadow-sm">
          <div className="p-6 md:p-8 lg:p-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 mb-3"><div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center"><Store className="h-5 w-5" /></div><Badge variant="secondary">Central Administrativa</Badge></div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Gestão do Atacadão dos Medicamentos</h1>
              <p className="mt-2 text-muted-foreground text-sm md:text-base max-w-2xl">Escolha a área que deseja administrar. As funções do sistema ficam organizadas por módulo, sem precisar procurar em um menu extenso.</p>
            </div>
            <div className="flex flex-wrap gap-2"><Button asChild size="lg"><Link to="/admin/pdv"><CreditCard className="h-4 w-4 mr-2" />Abrir PDV</Link></Button><Button asChild size="lg" variant="outline"><Link to="/admin/curva-abc"><BarChart3 className="h-4 w-4 mr-2" />Curva ABC</Link></Button><Button asChild size="lg" variant="outline"><Link to="/admin/site"><Globe2 className="h-4 w-4 mr-2" />Gerenciar Site</Link></Button></div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 border-t bg-muted/15">
            <QuickKpi label="Vendas hoje" value={String(k?.ordersToday ?? "—")} icon={ShoppingCart} />
            <QuickKpi label="Faturamento hoje" value={formatBRL(k?.revenueToday ?? 0)} icon={Landmark} />
            <QuickKpi label="Pedidos pendentes" value={String(k?.pendingOrders ?? "—")} icon={ReceiptText} alert={(k?.pendingOrders ?? 0) > 0} />
            <QuickKpi label="Estoque baixo" value={String(k?.lowStock ?? "—")} icon={Boxes} alert={(k?.lowStock ?? 0) > 0} />
            <QuickKpi label="Receitas pendentes" value={String(k?.pendingPrescriptions ?? "—")} icon={FileText} alert={(k?.pendingPrescriptions ?? 0) > 0} className="col-span-2 lg:col-span-1" />
          </div>
        </section>

        {groups.map((group) => <section key={group.title}><div className="mb-4"><h2 className="text-xl font-extrabold tracking-tight">{group.title}</h2><p className="text-sm text-muted-foreground mt-0.5">{group.subtitle}</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{group.modules.map((module) => <ModuleCard key={module.title} {...module} />)}</div></section>)}
      </div>
    </div>
  );
}

function QuickKpi({ label, value, icon: Icon, alert = false, className = "" }: { label: string; value: string; icon: any; alert?: boolean; className?: string }) {
  return <div className={`p-4 md:p-5 border-r border-b lg:border-b-0 last:border-r-0 ${className}`}><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Icon className={`h-4 w-4 ${alert ? "text-amber-600" : "text-primary"}`} /> {label}</div><div className="text-xl md:text-2xl font-black mt-1 truncate">{value}</div></div>;
}

function ModuleCard({ title, description, to, icon: Icon }: Module) {
  return <Link to={to} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"><Card className="h-full rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40"><CardContent className="p-5 md:p-6 h-full flex flex-col"><div className="h-11 w-11 rounded-xl grid place-items-center bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><h3 className="font-extrabold text-base md:text-lg mt-5">{title}</h3><p className="text-sm text-muted-foreground mt-1 leading-relaxed flex-1">{description}</p><div className="mt-5 pt-4 border-t flex items-center justify-between text-sm font-semibold text-primary"><span>Acessar módulo</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div></CardContent></Card></Link>;
}