import { useDraggable, useDroppable, DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, LockKeyhole, ArrowUpRight } from "lucide-react";
import { formatBRL } from "@/lib/store";
import { CRM_KANBAN_COLUMNS, CRM_MANUAL_TARGETS, canMoveCrmOpportunity, canMoveCrmTo, kanbanColumnOf } from "@/lib/crmKanban";
import type { OpportunityRow } from "@/pages/admin/AdminCRM";

type Props = {
  rows: OpportunityRow[];
  busy: boolean;
  onOpen: (row: OpportunityRow) => void;
  onMove: (row: OpportunityRow, target: string) => Promise<void>;
};
const CHANNELS: Record<string, string> = { site: "Site", whatsapp: "WhatsApp", balcao: "Balcão", pdv: "Balcão", erp: "ERP", vendedor: "Vendedor", telefone: "Telefone" };

function OpportunityCard({ row, busy, onOpen, onMove }: Props & { row: OpportunityRow }) {
  const eligible = canMoveCrmOpportunity(row);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.opportunity_id, disabled: busy || !eligible });
  const style = { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 20 : undefined, opacity: isDragging ? 0.65 : 1, position: "relative" as const };
  return (
    <div ref={setNodeRef} style={style} className="space-y-3 rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md" data-testid="crm-kanban-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{row.customer_name || (row.contact_kind === "guest" ? "Cliente convidado" : "Contato sem nome")}</div>
          <div className="truncate text-xs text-muted-foreground">{row.customer_phone || row.customer_email || "Contato não confirmado"}</div>
        </div>
        {eligible ? (
          <button type="button" aria-label={"Arrastar " + (row.customer_name || "oportunidade")} title="Mover etapa comercial" disabled={busy}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
        ) : <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Etapa automática ou encerrada" />}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="max-w-[136px] truncate text-[10px]">{CHANNELS[row.current_channel] || row.current_channel || "Não identificado"}</Badge>
        <span className="text-sm font-extrabold tabular-nums">{formatBRL(Number(row.value || 0))}</span>
      </div>
      {row.order_code && <div className="text-[11px] text-muted-foreground">Pedido {row.order_code}</div>}
      <div className="flex items-center gap-2 border-t pt-2">
        <Button size="sm" variant="ghost" className="h-8 flex-1 justify-start px-2 text-xs" onClick={() => onOpen(row)}>
          Ver jornada <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
        </Button>
        {eligible && (
          <Select disabled={busy} onValueChange={value => { if (canMoveCrmTo(row, value)) void onMove(row, value); }}>
            <SelectTrigger aria-label={"Mover etapa de " + (row.customer_name || row.opportunity_id)} className="h-8 w-[106px] text-xs">
              <SelectValue placeholder="Mover…" />
            </SelectTrigger>
            <SelectContent>
              {CRM_MANUAL_TARGETS.filter(column => column.id !== row.stage).map(column =>
                <SelectItem key={column.id} value={column.id}>{column.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function KanbanLane({ column, rows, busy, onOpen, onMove }: Props & { column: (typeof CRM_KANBAN_COLUMNS)[number] }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: !column.manual || busy });
  const cards = rows.filter(row => kanbanColumnOf(row) === column.id);
  const total = cards.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return (
    <section aria-label={column.label} className="w-[276px] shrink-0 rounded-xl border bg-muted/30">
      <div className="sticky top-0 z-10 space-y-2 rounded-t-xl border-b bg-card/95 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold">{column.label}</h3>
          <Badge variant="secondary" className="tabular-nums">{cards.length}</Badge>
        </div>
        <p className="text-xs font-semibold tabular-nums text-muted-foreground">{formatBRL(total)}</p>
      </div>
      <div ref={setNodeRef} className={"min-h-40 max-h-[65vh] space-y-2 overflow-y-auto p-2 transition-colors " + (isOver && column.manual ? "bg-primary/10 ring-2 ring-inset ring-primary/40" : "")}>
        {cards.map(row => <OpportunityCard key={row.opportunity_id} row={row} rows={rows} busy={busy} onOpen={onOpen} onMove={onMove} />)}
        {!cards.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          {column.manual ? "Solte oportunidades comerciais aqui" : "Nenhuma oportunidade nesta página"}
        </div>}
      </div>
    </section>
  );
}

export function CrmKanbanBoard({ rows, busy, onOpen, onMove }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || busy) return;
    const row = rows.find(item => item.opportunity_id === active.id);
    const target = String(over.id);
    if (row && canMoveCrmTo(row, target)) void onMove(row, target);
  };
  return (
    <div className="space-y-2 p-3 md:p-4">
      <p className="text-xs text-muted-foreground">Visão Kanban desta página: os cartões podem ser movidos entre etapas comerciais. Carrinho, checkout, pagamento, pedidos e vendas finalizadas são atualizados pelo sistema. Nenhuma movimentação libera receita, altera estoque ou confirma pagamento.</p>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3" aria-label="Quadro Kanban CRM">
          {CRM_KANBAN_COLUMNS.map(column => <KanbanLane key={column.id} column={column} rows={rows} busy={busy} onOpen={onOpen} onMove={onMove} />)}
          {rows.some(row => kanbanColumnOf(row) === "unknown") && <section className="w-[276px] shrink-0 space-y-2 rounded-xl border bg-muted/30 p-3"><h3 className="font-bold">A reconciliar</h3><p className="text-xs text-muted-foreground">Etapa não mapeada; verifique a jornada antes de agir.</p>{rows.filter(row => kanbanColumnOf(row) === "unknown").map(row => <OpportunityCard key={row.opportunity_id} row={row} rows={rows} busy={busy} onOpen={onOpen} onMove={onMove} />)}</section>}
        </div>
      </DndContext>
      <p className="text-xs text-muted-foreground">Contagem e valores de cada coluna correspondem apenas aos cartões carregados nesta página. Use os filtros e a paginação para consultar mais registros.</p>
    </div>
  );
}
