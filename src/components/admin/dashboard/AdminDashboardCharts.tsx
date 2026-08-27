import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PALETTE = [
  "hsl(var(--primary))",
  "#16a34a",
  "#f59e0b",
  "#0ea5e9",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#f43f5e",
];

type SalesPoint = { date: string; receita: number; pedidos: number };
type TopProduct = { name: string; qtd: number; receita: number };
type CatalogItem = { name: string; qtd: number; valor: number };

type DashboardChartsProps = {
  days: number;
  series?: SalesPoint[];
  topProducts?: TopProduct[];
  catalog?: CatalogItem[];
  paymentStatus?: {
    paid: number;
    pending: number;
    cancelled: number;
  };
};

export function AdminDashboardCharts({
  days,
  series,
  topProducts,
  catalog,
  paymentStatus,
}: DashboardChartsProps) {
  const hasPayments = !!paymentStatus && (paymentStatus.paid + paymentStatus.pending + paymentStatus.cancelled) > 0;

  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Receita & Pedidos</CardTitle>
            <Badge variant="outline">{days} dias</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {series?.some((d) => d.receita || d.pedidos) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => format(new Date(d), days > 90 ? "MMM" : "dd/MM", { locale: ptBR })}
                      fontSize={12}
                    />
                    <YAxis yAxisId="left" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} />
                    <Tooltip
                      formatter={(v: any, name) => name === "Receita" ? formatBRL(Number(v)) : v}
                      labelFormatter={(d) => format(new Date(d), "dd/MM/yyyy")}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="receita" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" dataKey="pedidos" name="Pedidos" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Ainda sem pedidos no período. O gráfico aparece automaticamente assim que entrarem vendas." />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Status de pagamento</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              {hasPayments ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      dataKey="value"
                      data={[
                        { name: "Pagos", value: paymentStatus!.paid },
                        { name: "Pendentes", value: paymentStatus!.pending },
                        { name: "Cancelados", value: paymentStatus!.cancelled },
                      ]}
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {["#16a34a", "#f59e0b", "#ef4444"].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Sem pedidos cadastrados ainda." />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top 10 — Mais vendidos ({days}d)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-80">
              {topProducts?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" fontSize={12} />
                    <YAxis dataKey="name" type="category" width={140} fontSize={11} tickFormatter={(v) => v.length > 22 ? `${v.slice(0, 22)}…` : v} />
                    <Tooltip formatter={(v, n) => n === "receita" ? formatBRL(Number(v)) : v} />
                    <Bar dataKey="qtd" name="Quantidade" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Os campeões de venda aparecem aqui assim que houver pedidos pagos no período." />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Catálogo por categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="h-80">
              {catalog?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={catalog} margin={{ bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" fontSize={11} angle={-30} textAnchor="end" interval={0} height={60} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(v, n) => n === "valor" ? formatBRL(Number(v)) : v} />
                    <Bar dataKey="qtd" name="Produtos" radius={[4, 4, 0, 0]}>
                      {catalog.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Sem categorias ativas." />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-center text-sm text-muted-foreground px-6">
      {text}
    </div>
  );
}
