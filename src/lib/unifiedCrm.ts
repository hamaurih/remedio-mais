/** Read-only projections. Never use a commercial label as authorization to fulfill. */
export type CrmOrder = {
  id: string; user_id?: string | null; customer_name?: string | null;
  customer_phone?: string | null; created_at?: string; total?: number;
  source?: string | null; sales_channel?: string | null;
  status?: string | null; order_status?: string | null; payment_status?: string | null;
  fulfillment_status?: string | null; delivery_status?: string | null;
  prescription_original_required?: boolean; prescription_original_status?: string | null;
  order_items?: Array<{ id?: string; requires_prescription?: boolean; controlled?: boolean; item_status?: string; prescription_condition?: string | null }>;
};
export type CommercialPhase = 'open' | 'confirmed' | 'won' | 'cancelled' | 'unknown';
export const COMMERCIAL_LABELS: Record<CommercialPhase, string> = {
  open: 'Em atendimento', confirmed: 'Pedido confirmado', won: 'Concluído', cancelled: 'Cancelado', unknown: 'A reconciliar',
};
export function crmEnabled(value?: string) { return value === 'true'; }
export const UNIFIED_CRM_ENABLED = crmEnabled(import.meta.env.VITE_UNIFIED_CRM_PREVIEW);

export function projectCrmOrder(order: CrmOrder) {
  const channel = order.source === 'ia' || order.sales_channel === 'whatsapp' ? 'whatsapp'
    : ['site', 'pdv', 'erp'].includes(order.sales_channel || '') ? order.sales_channel! : 'unknown';
  const statuses = [order.status, order.order_status];
  const cancelled = statuses.some(s => ['cancelado', 'cancelled'].includes(s || ''))
    || order.fulfillment_status === 'cancelled' || order.delivery_status === 'cancelled';
  const completed = statuses.some(s => ['entregue', 'retirado', 'finalizado', 'concluido'].includes(s || ''))
    || order.fulfillment_status === 'delivered' || ['delivered', 'picked_up'].includes(order.delivery_status || '');
  const conflictingState = cancelled && completed;
  let commercial: CommercialPhase = 'unknown';
  if (conflictingState) commercial = 'unknown';
  else if (cancelled) commercial = 'cancelled';
  else if (completed) commercial = 'won';
  else if (['picking', 'packed', 'shipped'].includes(order.fulfillment_status || '')
    || ['pickup_ready', 'out_for_delivery'].includes(order.delivery_status || '')
    || statuses.some(s => ['aprovado', 'em_separacao', 'pronto_retirada', 'pronto_para_retirada', 'pago', 'separando', 'saiu_para_entrega', 'aguardando_pagamento', 'confirmado'].includes(s || ''))) commercial = 'confirmed';
  else if (statuses.some(s => ['novo', 'em_atendimento'].includes(s || ''))) commercial = 'open';
  return {
    channel, commercial, conflictingState,
    payment: order.payment_status || 'unknown', fulfillment: order.fulfillment_status || 'unknown',
    delivery: order.delivery_status || 'unknown',
    originalBlocked: Boolean(order.prescription_original_required && order.prescription_original_status !== 'validated'),
    prescriptionItems: (order.order_items || []).filter(i => i.item_status !== 'removido' && (i.requires_prescription || i.controlled)).length,
  };
}
/** Strong identity only. Unlinked guests must be reconciled, never guessed. */
export function confirmedCustomerOrders<T extends CrmOrder>(order: T, orders: T[]): T[] {
  return orders.filter(other => order.user_id ? other.user_id === order.user_id : other.id === order.id);
}
