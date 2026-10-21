import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/store";
import { buildCustomerPurchaseInsights } from "@/lib/customerPurchaseInsights";
import { Clock3, Repeat2, ShoppingBag, Sparkles, TrendingUp } from "lucide-react";

const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";

export function CustomerPurchaseSummary({ order, orders, onOpen }: { order: any; orders: any[]; onOpen: () => void }) {
  const insight = buildCustomerPurchaseInsights(order, orders);
  const purchaseLabel = insight.purchaseCount <= 1 && insight.priorPurchaseCount === 0
    ? "1ª compra"
    : `${insight.purchaseCount} compras`;

  return (
    <div className="mt-1 space-y-0.5">
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        <span>{purchaseLabel}</span>
        <span>·</span>
        <span>{formatBRL(insight.totalSpent)}</span>
        <Badge variant="outline" className="h-4 px-1.5 text-[9px]">{insight.profile}</Badge>
      </div>
      {insight.repeatedCurrentItemCount > 0 && (
        <div className="text-[10px] text-primary flex items-center gap-1">
          <Repeat2 className="h-3 w-3" />
          {insight.repeatedCurrentItemCount === 1
            ? "1 item já comprado antes"
            : `${insight.repeatedCurrentItemCount} itens já comprados antes`}
        </div>
      )}
      <button type="button" onClick={onOpen} className="text-[10px] font-semibold text-primary hover:underline">
        Ver análise do cliente
      </button>
    </div>
  );
}

export function CustomerPurchaseAnalysisDialog({ order, orders, open, onOpenChange }: {
  order: any;
  orders: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!order) return null;
  const insight = buildCustomerPurchaseInsights(order, orders);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Análise comercial · {order.customer_name || "Cliente"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={ShoppingBag} label="Compras" value={String(insight.purchaseCount)} />
          <Metric icon={TrendingUp} label="Total comprado" value={formatBRL(insight.totalSpent)} />
          <Metric icon={TrendingUp} label="Ticket médio" value={formatBRL(insight.averageTicket)} />
          <Metric icon={Clock3} label="Intervalo médio" value={insight.averagePurchaseIntervalDays ? `${insight.averagePurchaseIntervalDays} dias` : "Sem histórico"} />
        </div>

        <div className="flex flex-wrap gap-2 items-center rounded-lg border p-3">
          <Badge>{insight.profile}</Badge>
          <span className="text-xs text-muted-foreground">Primeira compra: {date(insight.firstPurchaseAt)}</span>
          <span className="text-xs text-muted-foreground">Última compra: {date(insight.lastPurchaseAt)}</span>
        </div>

        <section className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2"><Repeat2 className="h-4 w-4" /> Itens deste pedido já comprados antes</h3>
          {insight.repeatedCurrentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item deste pedido aparece em compras anteriores do cliente.</p>
          ) : (
            <div className="space-y-2">
              {insight.repeatedCurrentItems.map((item: any, index: number) => (
                <div key={`${item.product_id || item.product_name}-${index}`} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-sm">{item.product_name}</div>
                    <Badge variant="secondary">{item.previousPurchases} compra{item.previousPurchases === 1 ? "" : "s"} anterior{item.previousPurchases === 1 ? "" : "es"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Última compra anterior: {date(item.lastPurchaseAt)}</div>
                  {item.sensitive && <div className="text-[10px] text-muted-foreground mt-1">Histórico factual apenas; sem inferência ou recomendação clínica.</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">Produtos mais recorrentes</h3>
          {insight.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há histórico suficiente.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-left">
                  <tr><th className="p-2">Produto</th><th className="p-2">Pedidos</th><th className="p-2">Qtd.</th><th className="p-2">Última</th><th className="p-2">Ciclo médio</th></tr>
                </thead>
                <tbody>
                  {insight.topProducts.map((item: any, index: number) => (
                    <tr key={`${item.product_name}-${index}`} className="border-t">
                      <td className="p-2">
                        {item.product_name}
                        {item.sensitive && <div className="text-[10px] text-muted-foreground">Histórico factual</div>}
                      </td>
                      <td className="p-2">{item.purchaseOrders}</td>
                      <td className="p-2">{item.quantity}</td>
                      <td className="p-2">{date(item.lastPurchaseAt)}</td>
                      <td className="p-2">{item.averageIntervalDays ? `${item.averageIntervalDays} dias` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> Padrões de recompra</h3>
          <p className="text-xs text-muted-foreground">Somente produtos não sensíveis entram neste bloco comercial. Itens controlados ou vinculados a receita ficam fora das oportunidades automáticas.</p>
          {insight.recurringOpportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há padrão recorrente suficiente para destacar.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {insight.recurringOpportunities.map((item: any, index: number) => (
                <div key={`${item.product_name}-opp-${index}`} className="rounded-lg border p-3">
                  <div className="font-medium text-sm">{item.product_name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Comprado em {item.purchaseOrders} pedidos
                    {item.averageIntervalDays ? ` · intervalo médio de ${item.averageIntervalDays} dias` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}
