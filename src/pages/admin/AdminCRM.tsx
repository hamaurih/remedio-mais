import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CrmKanbanBoard } from "@/components/admin/CrmKanbanBoard";
import { canMoveCrmTo } from "@/lib/crmKanban";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErpMetricCard, ErpPage, ErpPageHeader, ErpPanel, ErpPanelHeader } from "@/components/admin/ErpPageShell";
import { Activity, CircleDollarSign, Columns3, GitBranch, List, MessageCircle, Search, ShoppingCart, UsersRound } from "lucide-react";
import { formatBRL } from "@/lib/store";

type Overview = {
  contacts?: number;
  active_opportunities?: number;
  won?: number;
  lost?: number;
  revenue?: number;
  by_channel?: Record<string, number>;
  by_stage?: Record<string, number>;
};

type OpportunityRow = {
  opportunity_id: string;
  contact_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_cpf: string | null;
  contact_kind: string | null;
  stage: string;
  status: string;
  origin_channel: string;
  current_channel: string;
  value: number;
  order_id: string | null;
  order_code: string | null;
  cart_session_id: string | null;
  conversation_id: string | null;
  first_touch_at: string;
  last_touch_at: string;
  won_at: string | null;
  lost_at: string | null;
  loss_reason: string | null;
  total_count: number;
};

type TimelineEvent = {
  event_id: string;
  event_type: string;
  channel: string;
  source: string;
  occurred_at: string;
  order_id: string | null;
  order_code: string | null;
  cart_session_id: string | null;
  conversation_id: string | null;
  value: number | null;
  path: string | null;
  metadata: Record<string, unknown> | null;
};

const PAGE_SIZE = 50;

const STAGE_LABELS: Record<string, string> = {
  new: "Novo",
  engaged: "Engajado",
  cart: "Carrinho",
  checkout: "Checkout",
  payment: "Pagamento",
  conversation: "Atendimento",
  quote: "Orçamento",
  order: "Pedido",
  processing: "Processando",
  won: "Venda concluída",
  lost: "Perdido",
  cancelled: "Cancelado",
};

const CHANNEL_LABELS: Record<string, string> = {
  site: "Site",
  whatsapp: "WhatsApp / IA",
  balcao: "Balcão / PDV",
  pdv: "Balcão / PDV",
  vendedor: "Vendedor",
  telefone: "Telefone",
  erp: "ERP",
  unknown: "Não identificado",
};

const EVENT_LABELS: Record<string, string> = {
  cart_started: "Adicionou produto ao carrinho",
  checkout_started: "Iniciou checkout",
  payment_attempted: "Iniciou pagamento",
  cart_cleared: "Esvaziou o carrinho",
  order_created: "Pedido criado",
  payment_status_changed: "Pagamento atualizado",
  order_status_changed: "Status do pedido atualizado",
  fulfillment_status_changed: "Separação atualizada",
  delivery_status_changed: "Entrega atualizada",
  purchase_completed: "Compra concluída",
  conversation_started: "Atendimento iniciado",
  message_received: "Mensagem recebida",
  message_sent: "Mensagem enviada",
  human_handoff: "Transferido para atendimento humano",
  quote_created: "Orçamento criado",
  crm_stage_moved: "Etapa comercial movida no Kanban",
};

const dt = (v?: string | null) => v ? new Date(v).toLocaleString("pt-BR") : "—";

export default function AdminCRM() {
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [stage, setStage] = useState("all");
  const [status, setStatus] = useState("open");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const queryClient = useQueryClient();
  const pageSize = viewMode === "kanban" ? 200 : PAGE_SIZE;
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<OpportunityRow | null>(null);

  const overviewQ = useQuery({
    queryKey: ["crm-overview", days],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_crm_overview", { p_days: Number(days) });
      if (error) throw error;
      return (data || {}) as Overview;
    },
    refetchInterval: 60_000,
  });

  const listQ = useQuery({
    queryKey: ["crm-opportunities", page, pageSize, search, channel, stage, status],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_crm_opportunity_list", {
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_search: search.trim() || null,
        p_channel: channel,
        p_stage: stage,
        p_status: status,
      });
      if (error) throw error;
      return (data || []) as OpportunityRow[];
    },
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });

  const moveQ = useMutation({
    mutationFn: async ({ row, target }: { row: OpportunityRow; target: string }) => {
      if (!canMoveCrmTo(row, target)) throw new Error("Etapa controlada pelo sistema.");
      const { data, error } = await (supabase as any).rpc("admin_crm_move_opportunity", {
        p_opportunity_id: row.opportunity_id,
        p_expected_stage: row.stage,
        p_new_stage: target,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm-opportunities"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-timeline"] }),
      ]);
    },
  });
  const moveOpportunity = async (row: OpportunityRow, target: string) => {
    if (!canMoveCrmTo(row, target)) return;
    try {
      await moveQ.mutateAsync({ row, target });
      toast.success("Etapa comercial atualizada.");
    } catch (error) {
      console.error("CRM Kanban move failed", error);
      toast.error("Não foi possível mover o cartão. Atualize o quadro e tente novamente.");
      void listQ.refetch();
    }
  };

  const timelineQ = useQuery({
    queryKey: ["crm-timeline", selected?.contact_id, selected?.opportunity_id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_crm_timeline", {
        p_contact_id: selected?.contact_id || null,
        p_opportunity_id: selected?.contact_id ? null : selected?.opportunity_id || null,
        p_limit: 500,
      });
      if (error) throw error;
      return (data || []) as TimelineEvent[];
    },
  });

  const rows = listQ.data || [];
  const total = Number(rows[0]?.total_count || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const overview = overviewQ.data || {};
  const channelEntries = useMemo(() => Object.entries(overview.by_channel || {}).sort((a,b) => b[1]-a[1]), [overview.by_channel]);

  const resetPage = (fn: () => void) => {
    fn();
    setPage(0);
  };

  return (
    <ErpPage className="[&_table]:min-w-[1050px]">
      <ErpPageHeader
        title="CRM Omnichannel"
        description="Jornada única do cliente entre site, carrinho, checkout, pedidos, WhatsApp/IA e balcão. ERP é a fonte de verdade."
        eyebrow="Vendas"
        icon={GitBranch}
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="365">12 meses</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <ErpMetricCard label="Contatos" value={overview.contacts ?? "—"} icon={UsersRound} />
        <ErpMetricCard label="Oportunidades abertas" value={overview.active_opportunities ?? "—"} icon={Activity} />
        <ErpMetricCard label="Vendas" value={overview.won ?? "—"} icon={ShoppingCart} />
        <ErpMetricCard label="Perdas" value={overview.lost ?? "—"} icon={Activity} tone={Number(overview.lost || 0) > 0 ? "warning" : "default"} />
        <ErpMetricCard label="Receita atribuída" value={formatBRL(Number(overview.revenue || 0))} icon={CircleDollarSign} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ErpPanel>
          <ErpPanelHeader title="Canais da jornada" description="Origem atual das oportunidades no período." />
          <div className="flex flex-wrap gap-2 p-4">
            {channelEntries.length ? channelEntries.map(([key, value]) => (
              <Badge key={key} variant="outline" className="px-3 py-1.5">
                {CHANNEL_LABELS[key] || key}: <strong className="ml-1">{value}</strong>
              </Badge>
            )) : <span className="text-sm text-muted-foreground">Sem dados no período.</span>}
          </div>
        </ErpPanel>
        <ErpPanel>
          <ErpPanelHeader title="Funil aberto" description="Onde as oportunidades estão paradas agora." />
          <div className="flex flex-wrap gap-2 p-4">
            {Object.entries(overview.by_stage || {}).map(([key, value]) => (
              <Badge key={key} variant={key === "payment" || key === "checkout" ? "secondary" : "outline"} className="px-3 py-1.5">
                {STAGE_LABELS[key] || key}: <strong className="ml-1">{value}</strong>
              </Badge>
            ))}
          </div>
        </ErpPanel>
      </div>

      <ErpPanel>
        <ErpPanelHeader
          title="Jornadas e oportunidades"
          description="Busca e filtros executados no banco. Kanban por padrão, lista disponível para conferência."
          actions={<div role="group" aria-label="Modo de visualização do CRM" className="flex gap-1 rounded-lg border p-1">
            <Button size="sm" variant={viewMode === "kanban" ? "secondary" : "ghost"} onClick={() => { setViewMode("kanban"); setPage(0); }}><Columns3 className="mr-1.5 h-4 w-4" />Kanban</Button>
            <Button size="sm" variant={viewMode === "table" ? "secondary" : "ghost"} onClick={() => { setViewMode("table"); setPage(0); }}><List className="mr-1.5 h-4 w-4" />Lista</Button>
          </div>}
        />
        <div className="grid gap-2 border-b p-4 md:grid-cols-[minmax(240px,1fr)_180px_180px_160px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cliente, telefone, e-mail, CPF ou pedido"
              value={search}
              onChange={(e) => resetPage(() => setSearch(e.target.value))}
            />
          </div>
          <Select value={channel} onValueChange={(v) => resetPage(() => setChannel(v))}>
            <SelectTrigger><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="site">Site</SelectItem>
              <SelectItem value="whatsapp">WhatsApp / IA</SelectItem>
              <SelectItem value="balcao">Balcão / PDV</SelectItem>
              <SelectItem value="vendedor">Vendedor</SelectItem>
              <SelectItem value="telefone">Telefone</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stage} onValueChange={(v) => resetPage(() => setStage(v))}>
            <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {Object.entries(STAGE_LABELS).map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => resetPage(() => setStatus(v))}>
            <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="open">Aberta</SelectItem>
              <SelectItem value="won">Ganha</SelectItem>
              <SelectItem value="lost">Perdida</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {listQ.isError ? (
          <div className="p-8 text-center text-sm text-destructive">Não foi possível carregar o CRM. Verifique as permissões e tente novamente.</div>
        ) : listQ.isPending ? <div role="status" className="p-8 text-center text-sm text-muted-foreground">Carregando oportunidades reais…</div> : viewMode === "kanban" ? (
          <CrmKanbanBoard rows={rows} busy={listQ.isFetching || moveQ.isPending} onOpen={setSelected} onMove={moveOpportunity} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead><TableHead>Canal</TableHead><TableHead>Etapa</TableHead>
                <TableHead>Situação</TableHead><TableHead>Valor</TableHead><TableHead>Pedido</TableHead>
                <TableHead>Último toque</TableHead><TableHead>Jornada</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.opportunity_id}>
                    <TableCell>
                      <div className="font-semibold">{row.customer_name || (row.contact_kind === "guest" ? "Cliente convidado" : "Contato não identificado")}</div>
                      <div className="text-xs text-muted-foreground">{row.customer_phone || row.customer_email || row.customer_cpf || "Sem contato confirmado"}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{CHANNEL_LABELS[row.current_channel] || row.current_channel}</Badge></TableCell>
                    <TableCell>{STAGE_LABELS[row.stage] || row.stage}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="font-semibold">{formatBRL(Number(row.value || 0))}</TableCell>
                    <TableCell className="font-mono text-xs">{row.order_code || (row.order_id ? row.order_id.slice(0,8).toUpperCase() : "—")}</TableCell>
                    <TableCell className="text-xs">{dt(row.last_touch_at)}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => setSelected(row)}>Ver jornada</Button></TableCell>
                  </TableRow>
                ))}
                {!listQ.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma oportunidade com estes filtros.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between border-t p-4 text-sm">
          <span className="text-muted-foreground">{total} oportunidade(s) · página {page + 1} de {totalPages} · até {pageSize} por página</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0 || listQ.isFetching} onClick={() => setPage((p) => Math.max(0,p-1))}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || listQ.isFetching} onClick={() => setPage((p) => p+1)}>Próxima</Button>
          </div>
        </div>
      </ErpPanel>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Jornada · {selected?.customer_name || selected?.order_code || "Contato"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3 text-sm">
                <Info label="Canal atual" value={CHANNEL_LABELS[selected.current_channel] || selected.current_channel} />
                <Info label="Etapa" value={STAGE_LABELS[selected.stage] || selected.stage} />
                <Info label="Valor" value={formatBRL(Number(selected.value || 0))} />
              </div>
              {selected.conversation_id && (
                <div className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4" /> Conversa vinculada</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{selected.conversation_id}</div>
                </div>
              )}
              <div className="space-y-3">
                {(timelineQ.data || []).map((event) => <TimelineItem key={event.event_id} event={event} />)}
                {!timelineQ.isLoading && !(timelineQ.data || []).length && <div className="text-sm text-muted-foreground">Ainda não há eventos registrados para esta jornada.</div>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ErpPage>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "won" ? "default" : status === "lost" || status === "cancelled" ? "destructive" : "secondary";
  const label = status === "won" ? "Ganha" : status === "lost" ? "Perdida" : status === "cancelled" ? "Cancelada" : "Aberta";
  return <Badge variant={variant as any}>{label}</Badge>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const metadata = event.metadata || {};
  const change = metadata.from != null || metadata.to != null
    ? `${String(metadata.from ?? "—")} → ${String(metadata.to ?? "—")}`
    : null;
  return (
    <div className="relative border-l-2 border-primary/20 pl-4 pb-3">
      <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-semibold text-sm">{EVENT_LABELS[event.event_type] || event.event_type}</div>
        <Badge variant="outline">{CHANNEL_LABELS[event.channel] || event.channel}</Badge>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{dt(event.occurred_at)}{event.order_code ? ` · Pedido ${event.order_code}` : ""}</div>
      {change && <div className="text-xs mt-1">{change}</div>}
      {event.path && <div className="text-xs text-muted-foreground mt-1">Página: {event.path}</div>}
      {event.conversation_id && <div className="text-xs text-muted-foreground mt-1">Conversa: {event.conversation_id}</div>}
    </div>
  );
}
