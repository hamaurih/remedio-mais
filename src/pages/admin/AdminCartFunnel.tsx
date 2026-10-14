import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ShoppingCart, CreditCard, CheckCircle2, Clock3, AlertTriangle } from "lucide-react";

type Summary = {
  window_hours?: number;
  sessions?: number;
  active_now?: number;
  stalled_carts?: number;
  checkout_started?: number;
  checkout_abandoned?: number;
  payment_attempted?: number;
  payment_abandoned?: number;
  converted?: number;
  abandoned_24h?: number;
  cart_value_open?: number;
  conversion_rate_checkout?: number;
};

type Row = {
  session_id: string;
  user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  classification: string;
  stage: string;
  status: string;
  cart_value: number;
  item_count: number;
  payment_method: string | null;
  order_id: string | null;
  first_item_at: string | null;
  checkout_started_at: string | null;
  payment_attempted_at: string | null;
  converted_at: string | null;
  last_activity_at: string;
};

const brl = (v: number | null | undefined) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v: string | null | undefined) => v ? new Date(v).toLocaleString("pt-BR") : "—";

const labels: Record<string, string> = {
  comprou: "Comprou",
  pagamento_abandonado: "Foi pagar e não concluiu",
  checkout_abandonado: "Abandonou checkout",
  carrinho_parado: "Carrinho parado",
  carrinho_ativo: "Carrinho ativo",
  limpo: "Carrinho esvaziado",
  ativo: "Ativo",
};

export default function AdminCartFunnel() {
  const [filter, setFilter] = useState("all");

  const summaryQ = useQuery({
    queryKey: ["cart-funnel-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_cart_funnel_summary", { p_hours: 168 });
      if (error) throw error;
      return (data || {}) as Summary;
    },
    refetchInterval: 60_000,
  });

  const listQ = useQuery({
    queryKey: ["cart-funnel-list", filter],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_cart_funnel_list", { p_limit: 200, p_filter: filter });
      if (error) throw error;
      return (data || []) as Row[];
    },
    refetchInterval: 60_000,
  });

  const s = summaryQ.data || {};
  const refresh = () => { void summaryQ.refetch(); void listQ.refetch(); };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Funil de Carrinhos e Checkout</h1>
          <p className="text-sm text-muted-foreground">Dados first-party da própria loja. Janela principal: últimos 7 dias.</p>
        </div>
        <Button variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Carrinhos ativos agora" value={s.active_now ?? 0} icon={<ShoppingCart className="h-4 w-4" />} note="atividade nos últimos 30 min" />
        <Metric title="Carrinhos parados" value={s.stalled_carts ?? 0} icon={<Clock3 className="h-4 w-4" />} note="sem checkout há mais de 30 min" />
        <Metric title="Abandonaram checkout" value={s.checkout_abandoned ?? 0} icon={<AlertTriangle className="h-4 w-4" />} note="entraram no checkout e não geraram pedido" />
        <Metric title="Foram pagar e não compraram" value={s.payment_abandoned ?? 0} icon={<CreditCard className="h-4 w-4" />} note="pedido criado, pagamento não aprovado" />
        <Metric title="Compras concluídas" value={s.converted ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} note="pagamento aprovado" />
        <Metric title="Checkouts iniciados" value={s.checkout_started ?? 0} icon={<ShoppingCart className="h-4 w-4" />} note="últimos 7 dias" />
        <Metric title="Conversão do checkout" value={`${Number(s.conversion_rate_checkout || 0).toFixed(1)}%`} icon={<CheckCircle2 className="h-4 w-4" />} note="compras ÷ checkouts iniciados" />
        <Metric title="Valor em carrinhos abertos" value={brl(s.cart_value_open)} icon={<ShoppingCart className="h-4 w-4" />} note="não convertido e não limpo" />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Quem está em cada etapa</CardTitle>
          <div className="flex flex-wrap gap-2">
            {[['all','Todos'],['stalled','Parados'],['checkout','Checkout sem compra'],['payment','Pagamento sem compra'],['converted','Compraram']].map(([k,l]) => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{l}</Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead><TableHead>Situação</TableHead><TableHead>Itens</TableHead><TableHead>Valor</TableHead><TableHead>Pagamento</TableHead><TableHead>Última atividade</TableHead><TableHead>Pedido</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(listQ.data || []).map((r) => (
                  <TableRow key={r.session_id}>
                    <TableCell>
                      <div className="font-medium">{r.customer_name || (r.user_id ? "Cliente identificado" : "Visitante não identificado")}</div>
                      <div className="text-xs text-muted-foreground">{r.customer_phone || r.customer_email || (r.user_id ? r.user_id.slice(0,8) : "Ainda não fez login")}</div>
                    </TableCell>
                    <TableCell><StatusBadge value={r.classification} /></TableCell>
                    <TableCell>{r.item_count}</TableCell>
                    <TableCell>{brl(r.cart_value)}</TableCell>
                    <TableCell>{r.payment_method === "credit_card" ? "Cartão" : r.payment_method === "pix" ? "Pix" : "—"}</TableCell>
                    <TableCell>{dt(r.last_activity_at)}</TableCell>
                    <TableCell>{r.order_id ? r.order_id.slice(0,8).toUpperCase() : "—"}</TableCell>
                  </TableRow>
                ))}
                {!listQ.isLoading && (listQ.data || []).length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro neste filtro.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Um visitante só é identificado pelo nome/contato depois de autenticar no site. O painel não envia esses dados pessoais para a Meta.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, note, icon }: { title: string; value: string | number; note: string; icon: React.ReactNode }) {
  return <Card><CardContent className="p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs font-medium">{title}</span>{icon}</div><div className="text-2xl font-extrabold mt-2">{value}</div><div className="text-[11px] text-muted-foreground mt-1">{note}</div></CardContent></Card>;
}

function StatusBadge({ value }: { value: string }) {
  const destructive = value.includes("abandonado");
  const secondary = value === "carrinho_parado" || value === "limpo";
  return <Badge variant={destructive ? "destructive" : secondary ? "secondary" : "default"}>{labels[value] || value}</Badge>;
}
