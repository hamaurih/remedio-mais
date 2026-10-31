export const CRM_KANBAN_COLUMNS = [
  { id: "new", label: "Novo contato", manual: true },
  { id: "engaged", label: "Em atendimento", manual: true },
  { id: "conversation", label: "Conversa", manual: true },
  { id: "quote", label: "Orçamento", manual: true },
  { id: "cart", label: "Carrinho", manual: false },
  { id: "checkout", label: "Checkout", manual: false },
  { id: "payment", label: "Pagamento", manual: false },
  { id: "order", label: "Pedido", manual: false },
  { id: "processing", label: "Separação", manual: false },
  { id: "won", label: "Concluído", manual: false },
  { id: "lost", label: "Perdido", manual: false },
  { id: "cancelled", label: "Cancelado", manual: false },
] as const;

export type KanbanStage = (typeof CRM_KANBAN_COLUMNS)[number]["id"];
export type KanbanOpportunity = {
  opportunity_id: string;
  contact_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  contact_kind?: string | null;
  stage: string;
  status: string;
  current_channel: string;
  value: number;
  order_id: string | null;
  order_code?: string | null;
  last_touch_at?: string | null;
};

const MANUAL_FROM = new Set(["new", "engaged", "conversation", "quote", "cart"]);
export const CRM_MANUAL_TARGETS = CRM_KANBAN_COLUMNS.filter(column => column.manual);

export function canMoveCrmOpportunity(row: KanbanOpportunity): boolean {
  return row.status === "open" && !row.order_id && MANUAL_FROM.has(row.stage);
}
export function canMoveCrmTo(row: KanbanOpportunity, stage: string): boolean {
  return canMoveCrmOpportunity(row) && CRM_MANUAL_TARGETS.some(column => column.id === stage) && row.stage !== stage;
}
/** Terminal status wins when legacy automation leaves the previous technical stage in place. */
export function kanbanColumnOf(row: KanbanOpportunity): string {
  if (row.status === "won" || row.status === "lost" || row.status === "cancelled") return row.status;
  return CRM_KANBAN_COLUMNS.some(column => column.id === row.stage) ? row.stage : "unknown";
}
