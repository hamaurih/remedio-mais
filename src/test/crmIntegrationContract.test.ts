import { describe, expect, it } from 'vitest';
import { planCrmStage, type CrmEnvelope, type CrmBinding } from '@/lib/crmIntegrationContract';
const binding: CrmBinding = { tenantId: 'tenant', orderId: 'order', conversationId: 'conversation', lastVersion: 4, seenEventIds: ['seen'] };
const event: CrmEnvelope = { eventId: 'new', tenantId: 'tenant', orderId: 'order', conversationId: 'conversation', origin: 'erp', version: 5, kind: 'order_snapshot', order: { id: 'order', status: 'em_separacao', payment_status: 'pending' }, paymentTiming: 'on_delivery' };
const mapping = { processing: 11011, pickup_ready: 999, completed: 11013, triage: 11006, confirmed: 11009, awaiting_payment: 11010, shipping: 11012, lost: 81161 };
describe('offline CRM stage intent contract', () => {
  it('supports delivery payment without waiting for upfront payment', () => expect(planCrmStage(event, binding, mapping)).toEqual({ action: 'propose', stageId: 11011, stage: 'processing', version: 5, eventId: 'new' }));
  it.each([
    [{ eventId: 'seen' }, 'duplicate'], [{ version: 3 }, 'stale'], [{ origin: 'aes' }, 'echo'], [{ conversationId: 'other' }, 'correlation'], [{ tenantId: 'other' }, 'correlation'], [{ orderId: 'other' }, 'correlation'], [{ version: NaN }, 'invalid'], [{ kind: 'prescription_changed' }, 'snapshot_required'],
  ])('rejects unsafe event %j', (patch, reason) => expect(planCrmStage({ ...event, ...patch } as CrmEnvelope, binding, mapping)).toEqual({ action: 'ignore', reason }));
  it('requires pickup-specific mapping; never claims delivery', () => {
    const pickup = { ...event, order: { id: 'order', status: 'pronto_retirada', delivery_status: 'pickup_ready' } };
    expect(planCrmStage(pickup, binding, mapping)).toMatchObject({ stage: 'pickup_ready', stageId: 999 });
    expect(planCrmStage(pickup, binding, { ...mapping, pickup_ready: undefined })).toEqual({ action: 'ignore', reason: 'unmapped' });
  });
  it('does not move by prescription pending or payment alone', () => {
    expect(planCrmStage({ ...event, order: { id: 'order', status: 'entregue', prescription_original_required: true, prescription_original_status: 'pending_collection' } }, binding, mapping)).toMatchObject({ stage: 'completed' });
    expect(planCrmStage({ ...event, order: { id: 'order', status: 'new_future', payment_status: 'approved' } }, binding, mapping)).toEqual({ action: 'ignore', reason: 'unknown_state' });
  });
  it('does not wait for prepayment for on-delivery orders', () => {
    expect(planCrmStage({ ...event, order: { id: 'order', status: 'aguardando_pagamento' } }, binding, mapping)).toMatchObject({ stage: 'confirmed' });
  });
});

it.each([
  [{ status: 'em_atendimento', order_status: 'pago', payment_status: 'approved' }, 'confirmed'],
  [{ order_status: 'pronto_para_retirada', fulfillment_status: 'packed' }, 'pickup_ready'],
  [{ status: 'separando' }, 'processing'],
  [{ delivery_status: 'picked_up' }, 'completed'],
  [{ delivery_status: 'out_for_delivery' }, 'shipping'],
])('recognizes actual legacy domain aliases %j', (order, stage) => {
  expect(planCrmStage({ ...event, order: { id: 'order', ...order } }, binding, mapping)).toMatchObject({ action: 'propose', stage });
});

it('requires a separate cancellation mapping, never falls back to lost', () => {
  const cancelled = { ...event, order: { id: 'order', status: 'cancelado' } };
  expect(planCrmStage(cancelled, binding, mapping)).toEqual({ action: 'ignore', reason: 'unmapped' });
  expect(planCrmStage(cancelled, binding, { ...mapping, cancelled: 12345 })).toMatchObject({ stage: 'cancelled', stageId: 12345 });
});

it('does not propose a stage for contradictory terminal evidence', () => {
  expect(planCrmStage({ ...event, order: { id: 'order', status: 'entregue', fulfillment_status: 'cancelled' } }, binding, { ...mapping, cancelled: 12345 })).toEqual({ action: 'ignore', reason: 'conflicting_state' });
});
