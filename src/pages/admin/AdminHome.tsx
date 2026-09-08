import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/store";
import { AlertTriangle, RefreshCw, ArrowRight, BarChart3, Boxes, Building2, CreditCard, FileText, Globe2, Landmark, Megaphone, Package, ReceiptText, Settings, ShoppingBag, ShoppingCart, Store, Tags, UserCog, Users, WalletCards } from "lucide-react";

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
      const db = supabase;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();
      // Page approved orders so dashboard totals are not truncated by the API row limit.
      const readPaidToday = async () => {
        const rows: Array<{ total: number; order_items: Array<{ quantity: number }> }> = [];
        for (let from = 0; ; from += 500) {
          const { data, error } = await db.from("orders").select("total,order_items(quantity)").eq("payment_status", "approved").gte("created_at", todayIso).order("id").range(from, from + 499);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        return { data: rows, error: null };
      };
      const [ordersToday, paidToday, pendingOrders, lowStock, pendingPrescriptions, customers] = await Promise.all([
        db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        readPaidToday(),
        db.from("orders").select("id", { count: "exact", head: true }).in("payment_status", ["pending", "processing"]),
        db.from("products").select("id", { count: "exact", head: true }).eq("active", true).lte("stock", 5),
        db.from("prescriptions").select("id", { count: "exact", head: true }).in("status", ["recebida", "pendente", "under_review"]),
        db.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      const failed = [ordersToday, paidToday, pendingOrders, lowStock, pendingPrescriptions, customers].find(result => result.error);
      if (failed) throw failed.error;
      const revenueToday = (paidToday.data || []).reduce((sum: number, row: any) => sum + Number(row.total || 0), 0);
      return { customers: customers.count || 0, productsSold: paidToday.data.reduce((sum, order) => sum + order.order_items.reduce((units, item) => units + Number(item.quantity || 0), 0), 0), paidCount: paidToday.data?.length || 0, ordersToday: ordersToday.count || 0, revenueToday, pendingOrders: pendingOrders.count || 0, lowStock: lowStock.count || 0, pendingPrescriptions: pendingPrescriptions.count || 0 };
    },
    refetchInterval: 60_000,
  });
  const k = overview.data;

  return (
    <div className="min-h-full bg-muted/20">
      <div className="max-w-[1480px] mx-auto p-4 md:p-6 lg:p-8 space-y-8">
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="mb-1 text-sm text-muted-foreground">Atacadão dos Medicamentos</p><h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Visão geral</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe a operação e as pendências da farmácia.</p></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={overview.isFetching} onClick={() => overview.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`} />Atualizar</Button><Button asChild><Link to="/admin/pdv"><CreditCard className="mr-2 h-4 w-4" />Abrir PDV</Link></Button></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">Pedidos do e-commerce</Badge><span>Hoje · {new Date().toLocaleDateString("pt-BR")}</span>{overview.dataUpdatedAt > 0 && <span>Atualizado às {new Date(overview.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
          {overview.isError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle className="h-5 w-5 text-destructive" /><span>Não foi possível atualizar os indicadores. {k ? "Os últimos dados carregados foram mantidos." : "Tente novamente."}</span><Button variant="outline" size="sm" onClick={() => overview.refetch()}>Tentar novamente</Button></div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={overview.isLoading}>
            <QuickKpi label="Vendas hoje" value={String(k?.paidCount ?? "—")} detail="Pedidos de hoje com pagamento aprovado" icon={ShoppingCart} to="/admin/pedidos" />
            <QuickKpi label="Faturamento hoje" value={k ? formatBRL(k.revenueToday) : "—"} detail="Valor dos pedidos aprovados de hoje" icon={Landmark} to="/admin/pagamentos" />
            <QuickKpi label="Pedidos de hoje" value={String(k?.ordersToday ?? "—")} detail="Todos os status de pagamento" icon={ShoppingBag} to="/admin/pedidos" />
            <QuickKpi label="Ticket médio hoje" value={k ? formatBRL(k.paidCount ? k.revenueToday / k.paidCount : 0) : "—"} detail="Faturamento ÷ pedidos aprovados" icon={ReceiptText} to="/admin/bi" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <QuickKpi label="Produtos vendidos hoje" value={String(k?.productsSold ?? "—")} detail="Unidades em pedidos aprovados de hoje" icon={Package} to="/admin/bi" />
            <QuickKpi label="Clientes cadastrados" value={String(k?.customers ?? "—")} detail="Total de perfis cadastrados no sistema" icon={Users} to="/admin/clientes" />
            <QuickKpi label="Receitas aguardando análise" value={String(k?.pendingPrescriptions ?? "—")} detail="Acesse a fila para analisar as receitas" icon={FileText} alert={(k?.pendingPrescriptions ?? 0) > 0} to="/admin/receitas" />
            <QuickKpi label="Produtos com estoque baixo" value={String(k?.lowStock ?? "—")} detail="Produtos ativos com até 5 unidades" icon={Boxes} alert={(k?.lowStock ?? 0) > 0} to="/admin/estoque" />
            <QuickKpi label="Pagamentos pendentes" value={String(k?.pendingOrders ?? "—")} detail="Pedidos pendentes ou em processamento" icon={CreditCard} alert={(k?.pendingOrders ?? 0) > 0} to="/admin/pagamentos" />
          </div>
          <Card><CardContent className="p-5"><h2 className="text-base font-semibold">Indicadores ainda indisponíveis</h2><p className="mt-1 text-sm text-muted-foreground">Os módulos atuais não fornecem estes dados de forma consolidada.</p><dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{["Produtos próximos do vencimento", "Contas a receber", "Contas a pagar", "Alertas críticos consolidados"].map(label => <div key={label}><dt className="text-sm font-medium">{label}</dt><dd className="mt-1 text-sm text-muted-foreground">Não disponível</dd></div>)}</dl></CardContent></Card>
        </section>

        {groups.map((group) => <section key={group.title}><div className="mb-4"><h2 className="text-lg font-semibold tracking-tight">{group.title}</h2><p className="text-sm text-muted-foreground mt-0.5">{group.subtitle}</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{group.modules.map((module) => <ModuleCard key={module.title} {...module} />)}</div></section>)}
      </div>
    </div>
  );
}

function QuickKpi({ label, value, detail, to, icon: Icon, alert = false }: { label: string; value: string; detail: string; to: string; icon: any; alert?: boolean }) {
  return <Link to={to} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Card className="h-full transition-colors hover:border-primary/40"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-muted-foreground">{label}</span><Icon className={`h-5 w-5 shrink-0 ${alert ? "text-primary" : "text-muted-foreground"}`} /></div><div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p></CardContent></Card></Link>;
}

function ModuleCard({ title, description, to, icon: Icon }: Module) {
  return <Link to={to} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"><Card className="h-full rounded-lg transition-all duration-200 hover:shadow-sm hover:border-primary/40"><CardContent className="p-4 md:p-5 h-full flex flex-col"><div className="h-11 w-11 rounded-xl grid place-items-center bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><h3 className="font-semibold text-base md:text-lg mt-3">{title}</h3><p className="text-sm text-muted-foreground mt-1 leading-relaxed flex-1">{description}</p><div className="mt-3 pt-4 border-t flex items-center justify-between text-sm font-semibold text-primary"><span>Acessar módulo</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div></CardContent></Card></Link>;
}