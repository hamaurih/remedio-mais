import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/store";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  CreditCard,
  FileText,
  Globe2,
  HardDriveDownload,
  Landmark,
  Package,
  ReceiptText,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  UserCog,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";

type Module = {
  title: string;
  description: string;
  to: string;
  icon: any;
  emphasis?: "primary" | "default";
};

const groups: Array<{ title: string; subtitle: string; modules: Module[] }> = [
  {
    title: "Operação",
    subtitle: "Rotinas que precisam de acesso rápido durante o expediente.",
    modules: [
      { title: "Vendas e Pedidos", description: "Pedidos do site, status, separação e atendimento.", to: "/admin/pedidos", icon: ShoppingBag, emphasis: "primary" },
      { title: "PDV e Balcão", description: "Venda presencial, caixa e operação do balcão.", to: "/admin/pdv", icon: CreditCard, emphasis: "primary" },
      { title: "WhatsApp e IA", description: "Pedidos originados no atendimento automatizado e humano.", to: "/admin/ia-vendas", icon: Bot },
      { title: "Receitas", description: "Fila de análise, aprovação e acompanhamento farmacêutico.", to: "/admin/receitas", icon: FileText },
      { title: "Estoque", description: "Saldo, reserva, movimentações, inventário e itens críticos.", to: "/admin/estoque", icon: Boxes },
      { title: "BI Executivo", description: "Vendas, faturamento, ticket e saúde da operação.", to: "/admin/bi", icon: BarChart3 },
    ],
  },
  {
    title: "Gestão financeira e suprimentos",
    subtitle: "Compra, fornecedores, recebimentos e fluxo financeiro em um único bloco.",
    modules: [
      { title: "Compra inteligente", description: "Sugestões de compra com base em giro e necessidade.", to: "/admin/compras", icon: ShoppingCart },
      { title: "Pedidos e Recebimentos", description: "Pedidos de compra, entrada de mercadorias e conferência.", to: "/admin/compras-operacionais", icon: Package },
      { title: "Fornecedores", description: "Cadastro e relacionamento com fornecedores.", to: "/admin/fornecedores", icon: Truck },
      { title: "Contas a Pagar", description: "Vencimentos, pagamentos e compromissos da operação.", to: "/admin/contas-a-pagar", icon: WalletCards },
      { title: "Receber e Caixa", description: "Recebimentos, fluxo de caixa e acompanhamento financeiro.", to: "/admin/contas-a-receber", icon: Landmark },
      { title: "Cielo e Pagamentos", description: "Meios de pagamento, conciliação e parâmetros da Cielo.", to: "/admin/pagamentos", icon: CreditCard },
    ],
  },
  {
    title: "Cadastros, estrutura e crescimento",
    subtitle: "Catálogo, unidades, clientes, equipe, site e integrações.",
    modules: [
      { title: "Produtos e Preços", description: "Catálogo, EAN, preço, publicação e regras comerciais.", to: "/admin/produtos", icon: Package },
      { title: "Matriz e Filiais", description: "Unidades, regularização e parâmetros operacionais.", to: "/admin/unidades", icon: Building2 },
      { title: "Clientes", description: "Histórico de pedidos, endereços e relacionamento.", to: "/admin/clientes", icon: Users },
      { title: "Cadastros do Site", description: "Contas criadas no e-commerce, inclusive sem compra.", to: "/admin/cadastros", icon: UserPlus },
      { title: "Vendedores", description: "Acessos, permissões e equipe comercial.", to: "/admin/vendedores", icon: UserCog },
      { title: "Site e E-commerce", description: "Home, vitrines, banners, menus e experiência da loja.", to: "/admin/site", icon: Globe2 },
      { title: "Configurações", description: "Empresa, parâmetros do sistema e integrações.", to: "/admin/config", icon: Settings },
      { title: "Backup e Recuperação", description: "Integridade, histórico e recuperação protegida.", to: "/admin/backups", icon: HardDriveDownload },
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
        db.from("orders").select("id", { count: "exact", head: true }).in("payment_status", ["approved", "partially_refunded"]).gte("created_at", todayIso),
        db.from("orders").select("total").eq("payment_status", "approved").gte("created_at", todayIso),
        db.from("orders").select("id", { count: "exact", head: true }).in("payment_status", ["pending", "processing"]),
        db.from("products").select("id", { count: "exact", head: true }).eq("active", true).lte("stock", 5),
        db.from("prescriptions").select("id", { count: "exact", head: true }).in("status", ["recebida", "pendente", "under_review"]),
      ]);

      const revenueToday = (paidToday.data || []).reduce(
        (sum: number, row: any) => sum + Number(row.total || 0),
        0,
      );

      return {
        ordersToday: ordersToday.count || 0,
        revenueToday,
        pendingOrders: pendingOrders.count || 0,
        lowStock: lowStock.count || 0,
        pendingPrescriptions: pendingPrescriptions.count || 0,
      };
    },
    refetchInterval: 60_000,
  });

  const k = overview.data;
  const alerts = [
    {
      label: "Pedidos aguardando ação",
      value: k?.pendingOrders ?? 0,
      to: "/admin/pedidos",
      icon: ReceiptText,
    },
    {
      label: "Itens com estoque baixo",
      value: k?.lowStock ?? 0,
      to: "/admin/estoque",
      icon: Boxes,
    },
    {
      label: "Receitas pendentes",
      value: k?.pendingPrescriptions ?? 0,
      to: "/admin/receitas",
      icon: FileText,
    },
  ].filter((item) => item.value > 0);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-[1480px] space-y-7 p-4 md:p-6 lg:p-8">
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="flex flex-col gap-6 p-6 md:p-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Store className="h-5 w-5" />
                </div>
                <Badge variant="secondary">Central Administrativa</Badge>
                <Badge variant="outline">Operação em tempo real</Badge>
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                Gestão do Atacadão dos Medicamentos
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                Comece pela operação do dia. Compras, financeiro, cadastros e integrações ficam organizados
                abaixo por área de responsabilidade.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link to="/admin/pdv"><CreditCard className="mr-2 h-4 w-4" />Abrir PDV</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/admin/pedidos"><ShoppingBag className="mr-2 h-4 w-4" />Ver pedidos</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/admin/bi"><BarChart3 className="mr-2 h-4 w-4" />Abrir BI</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t bg-muted/15 lg:grid-cols-4">
            <QuickKpi label="Vendas líquidas hoje" value={String(k?.ordersToday ?? "—")} icon={ShoppingCart} />
            <QuickKpi label="Faturamento hoje" value={formatBRL(k?.revenueToday ?? 0)} icon={Landmark} />
            <QuickKpi label="Pedidos pendentes" value={String(k?.pendingOrders ?? "—")} icon={ReceiptText} alert={(k?.pendingOrders ?? 0) > 0} />
            <QuickKpi label="Receitas pendentes" value={String(k?.pendingPrescriptions ?? "—")} icon={FileText} alert={(k?.pendingPrescriptions ?? 0) > 0} />
          </div>
        </section>

        {alerts.length > 0 && (
          <section className="rounded-2xl border border-amber-500/25 bg-amber-50/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-extrabold">Atenção operacional</h2>
              <span className="text-xs text-muted-foreground">Itens que merecem ação agora</span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {alerts.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex items-center justify-between rounded-xl border bg-background/80 px-4 py-3 text-sm transition hover:border-amber-500/40 hover:bg-background"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <item.icon className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="truncate font-semibold">{item.label}</span>
                  </div>
                  <span className="ml-3 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700">
                    {item.value}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {groups.map((group) => (
          <section key={group.title}>
            <div className="mb-4">
              <h2 className="text-lg font-extrabold tracking-tight md:text-xl">{group.title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{group.subtitle}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {group.modules.map((module) => <ModuleCard key={module.title} {...module} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function QuickKpi({
  label,
  value,
  icon: Icon,
  alert = false,
}: {
  label: string;
  value: string;
  icon: any;
  alert?: boolean;
}) {
  return (
    <div className="border-b border-r p-4 last:border-r-0 lg:border-b-0 md:p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className={`h-4 w-4 ${alert ? "text-amber-600" : "text-primary"}`} />
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-black tabular-nums md:text-2xl">{value}</div>
    </div>
  );
}

function ModuleCard({ title, description, to, icon: Icon, emphasis = "default" }: Module) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card
        className={[
          "h-full rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          emphasis === "primary" ? "border-primary/25 bg-primary/[0.025]" : "hover:border-primary/30",
        ].join(" ")}
      >
        <CardContent className="flex h-full items-start gap-4 p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-extrabold leading-tight">{title}</h3>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
