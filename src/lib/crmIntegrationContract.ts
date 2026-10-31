import { projectCrmOrder, type CrmOrder } from './unifiedCrm';

/** Candidate contract only: no transport, persistence, acknowledgement or side effects. */
export type CrmStage = 'triage' | 'confirmed' | 'awaiting_payment' | 'processing' | 'pickup_ready' | 'shipping' | 'completed' | 'lost' | 'cancelled';
export type CrmStageMapping = Partial<Record<CrmStage, number>>;
export type CrmBinding = {
  tenantId: string; orderId: string; conversationId: string;
  lastVersion: number; seenEventIds: readonly string[];
};
export type CrmEnvelope = {
  eventId: string; tenantId: string; orderId: string; conversationId: string;
  origin: 'erp' | 'aes'; version: number;
  kind: 'order_snapshot' | 'prescription_changed';
  order: CrmOrder; paymentTiming: 'upfront' | 'on_delivery' | 'unknown';
};
type Intent = { action: 'ignore'; reason: string } | { action: 'propose'; stage: CrmStage; stageId: number; version: number; eventId: string };
export function planCrmStage(event: CrmEnvelope, binding: CrmBinding, mapping: CrmStageMapping): Intent {
  const ignore = (reason: string): Intent => ({ action: 'ignore', reason });
  if (!event.eventId?.trim() || !Number.isSafeInteger(event.version) || event.version < 1) return ignore('invalid');
  if (event.origin !== 'erp') return ignore('echo');
  if (!event.tenantId || !event.orderId || !event.conversationId || event.tenantId !== binding.tenantId || event.orderId !== binding.orderId || event.order.id !== binding.orderId || event.conversationId !== binding.conversationId) return ignore('correlation');
  if (binding.seenEventIds.includes(event.eventId)) return ignore('duplicate');
  if (event.version <= binding.lastVersion) return ignore('stale');
  if (event.kind !== 'order_snapshot') return ignore('snapshot_required');
  // Explicit operational fields win over lagging UI labels. Payment/recipe alone never imply completion.
  const statuses = [event.order.status, event.order.order_status];
  const has = (...values: string[]) => statuses.some(s => values.includes(s || ''));
  const projection = projectCrmOrder(event.order);
  if (projection.conflictingState) return ignore('conflicting_state');
  let stage: CrmStage | undefined;
  if (projection.commercial === 'cancelled') stage = 'cancelled';
  else if (projection.commercial === 'won') stage = 'completed';
  else if (event.order.delivery_status === 'pickup_ready' || has('pronto_retirada', 'pronto_para_retirada')) stage = 'pickup_ready';
  else if (has('saiu_para_entrega') || event.order.delivery_status === 'out_for_delivery' || event.order.fulfillment_status === 'shipped') stage = 'shipping';
  else if (has('em_separacao', 'separando') || ['picking', 'packed'].includes(event.order.fulfillment_status || '')) stage = 'processing';
  else if (has('aguardando_pagamento')) {
    if (event.paymentTiming === 'unknown') return ignore('payment_timing_required');
    stage = event.paymentTiming === 'on_delivery' ? 'confirmed' : 'awaiting_payment';
  } else if (has('aprovado', 'confirmado', 'pago')) stage = 'confirmed';
  else if (has('novo', 'em_atendimento')) stage = 'triage';
  if (!stage) return ignore('unknown_state');
  const stageId = mapping[stage];
  if (!Number.isSafeInteger(stageId) || !stageId || stageId < 1) return ignore('unmapped');
  return { action: 'propose', stage, stageId, version: event.version, eventId: event.eventId };
}
