import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErpPanel } from '@/components/admin/ErpPageShell';
import { CustomerPurchaseAnalysisDialog } from '@/components/admin/CustomerPurchaseInsights';
import { COMMERCIAL_LABELS, UNIFIED_CRM_ENABLED, confirmedCustomerOrders, projectCrmOrder, type CrmOrder } from '@/lib/unifiedCrm';
import { formatBRL } from '@/lib/store';

const PAGE_SIZE = 50;
const CHANNELS: Record<string, string> = { site: 'Site', whatsapp: 'WhatsApp / IA', pdv: 'Balcão (futuro)', erp: 'ERP', unknown: 'Não identificado' };

export function UnifiedCrmPanel() {
  const { isAdmin } = useAuth();
  // Mount the loader only after both gates: OFF/unauthorized means no CRM query.
  if (!UNIFIED_CRM_ENABLED || !isAdmin) return null;
  return <UnifiedCrmLoader />;
}
function UnifiedCrmLoader() {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['admin-unified-crm-preview', page],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders')
        .select('id,user_id,customer_name,created_at,total,delivery_fee,source,sales_channel,status,order_status,payment_status,fulfillment_status,delivery_status,prescription_original_required,prescription_original_status,order_items(id,product_id,product_name,quantity,unit_price,item_status,requires_prescription,controlled,prescription_condition)')
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      if (error) throw error;
      // source exists in migrations but is missing from the generated legacy types.
      return (data || []) as unknown as CrmOrder[];
    },
  });
  return <UnifiedCrmView key={page} orders={(query.data || []).slice(0, PAGE_SIZE)} loading={query.isPending} error={query.isError} retry={() => query.refetch()} page={page} setPage={setPage} hasNext={(query.data?.length || 0) > PAGE_SIZE} />;
}

type ViewProps = { orders: CrmOrder[]; loading: boolean; error: boolean; retry: () => void; page: number; setPage: (page: number) => void; hasNext: boolean };
export function UnifiedCrmView({ orders, loading, error, retry, page, setPage, hasNext }: ViewProps) {
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('all');
  const [analysis, setAnalysis] = useState<CrmOrder | null>(null);
  const filtered = orders.filter(order => {
    const match = [order.id, order.customer_name, order.user_id].some(v => v?.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
    return match && (channel === 'all' || projectCrmOrder(order).channel === channel);
  });
  return <ErpPanel className="mb-6">
    <section aria-labelledby="unified-crm-title" className="space-y-4 p-4">
      <div><h2 id="unified-crm-title" className="text-lg font-semibold">CRM unificado · prévia</h2>
        <p className="text-sm text-muted-foreground">Somente leitura do ERP. Integração A&S não ativada; leads sem pedido não importados. Balcão preparado para fase futura; sem conexão PDV/Trier.</p>
        <p className="text-xs text-muted-foreground">Página {page + 1}, até 50 pedidos. Busca e análise limitadas a esta página, não ao histórico completo. Oportunidades de recompra na análise existente.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Buscar nesta página" placeholder="Cliente, ID do cliente ou pedido" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={channel} onValueChange={setChannel}><SelectTrigger aria-label="Canal nesta página" className="sm:w-52"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">Todos os canais</SelectItem>{Object.entries(CHANNELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
        </SelectContent></Select>
      </div>
      {loading ? <p role="status">Carregando pedidos…</p> : error ? <Alert variant="destructive"><AlertDescription>Não foi possível ler os pedidos. Verifique seu acesso e tente novamente.</AlertDescription><Button variant="outline" onClick={retry}>Tentar novamente</Button></Alert> : <>
        <Table><TableHeader><TableRow><TableHead>Cliente / Pedido</TableHead><TableHead>Origem</TableHead><TableHead>Comercial</TableHead><TableHead>Pagamento</TableHead><TableHead>Receita</TableHead><TableHead>Logística</TableHead><TableHead>Total</TableHead><TableHead>Análise</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map(order => {
            const projection = projectCrmOrder(order);
            return <TableRow key={order.id}>
              <TableCell><div className="font-medium">{order.customer_name || 'Cliente sem nome'}</div><div className="text-xs font-mono">{order.id}</div><div className="text-xs text-muted-foreground">{order.user_id ? `Cliente ERP: ${order.user_id}` : 'Sem vínculo de cadastro; não unificado'}</div></TableCell>
              <TableCell><Badge variant="outline">{CHANNELS[projection.channel]}</Badge><div className="text-xs text-muted-foreground">{order.source || order.sales_channel || '—'}</div></TableCell>
              <TableCell>{COMMERCIAL_LABELS[projection.commercial]}<div className="text-xs text-muted-foreground">Derivado, não estágio A&S</div></TableCell>
              <TableCell>{projection.payment}</TableCell>
              <TableCell>{projection.prescriptionItems} item(ns) com receita<div className="text-xs">{projection.originalBlocked ? 'Original pendente: não liberar separação/dispensação' : order.prescription_original_required ? 'Original validada' : 'Original não exigida'}</div>{(order.order_items || []).filter(i => i.item_status !== 'removido' && (i.requires_prescription || i.controlled)).map((item, index) => <div key={item.id || index} className="text-xs">Item {index + 1}: {item.prescription_condition || 'A verificar'}</div>)}</TableCell>
              <TableCell>{projection.fulfillment}<div className="text-xs">{projection.delivery}</div></TableCell>
              <TableCell>{order.total == null ? '—' : formatBRL(order.total)}</TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => setAnalysis(order)}>Analisar</Button></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
        {!filtered.length && <p className="text-sm text-muted-foreground">{orders.length ? 'Nenhum resultado nos filtros desta página.' : 'Nenhum pedido nesta página.'}</p>}
      </>}
      <div className="flex gap-2"><Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="outline" disabled={!hasNext || loading || error} onClick={() => setPage(page + 1)}>Próxima</Button></div>
      <CustomerPurchaseAnalysisDialog order={analysis} orders={analysis ? confirmedCustomerOrders(analysis, orders) : []} open={!!analysis} onOpenChange={open => !open && setAnalysis(null)} scopeLabel="Análise limitada aos pedidos desta página; não representa o histórico completo do cliente." showFinancial />
    </section>
  </ErpPanel>;
}
