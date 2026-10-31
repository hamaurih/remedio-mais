import { describe, expect, it } from 'vitest';
import { crmEnabled, projectCrmOrder, confirmedCustomerOrders } from '@/lib/unifiedCrm';

describe('CRM projection', () => {
  it('is off unless explicitly enabled', () => {
    expect(crmEnabled(undefined)).toBe(false);
    expect(crmEnabled('false')).toBe(false);
    expect(crmEnabled('true')).toBe(true);
  });
  it('keeps independent dimensions and channel without mutating prices', () => {
    const order = { id: 'a', status: 'em_separacao', source: 'ia', sales_channel: 'site', payment_status: 'pending', fulfillment_status: 'picking', prescription_original_required: true, prescription_original_status: 'pending_collection', total: 42, order_items: [{ id: 'i', requires_prescription: true, prescription_condition: 'pending' }] };
    const before = JSON.stringify(order);
    expect(projectCrmOrder(order)).toMatchObject({ channel: 'whatsapp', commercial: 'confirmed', payment: 'pending', fulfillment: 'picking', originalBlocked: true, prescriptionItems: 1 });
    expect(JSON.stringify(order)).toBe(before);
  });
  it('does not treat paid as original validated or refunded as lost', () => {
    expect(projectCrmOrder({ id: 'a', status: 'entregue', payment_status: 'refunded', prescription_original_required: true }).commercial).toBe('won');
    expect(projectCrmOrder({ id: 'a', payment_status: 'approved', prescription_original_required: true }).originalBlocked).toBe(true);
  });
  it('keeps unknown channels/status explicit and pickup distinct', () => {
    expect(projectCrmOrder({ id: 'a', status: 'future', sales_channel: 'future' })).toMatchObject({ channel: 'unknown', commercial: 'unknown' });
    expect(projectCrmOrder({ id: 'a', status: 'pronto_retirada', delivery_status: 'pickup_ready' })).toMatchObject({ commercial: 'confirmed', delivery: 'pickup_ready' });
  });
  it('does not merge guests or conflicting customer IDs by phone', () => {
    const orders = [{ id: 'a', user_id: 'u1', customer_phone: '11999999999' }, { id: 'b', user_id: 'u2', customer_phone: '11999999999' }, { id: 'c', user_id: null, customer_phone: '11999999999' }, { id: 'd', user_id: 'u1' }];
    expect(confirmedCustomerOrders(orders[0], orders).map(o => o.id)).toEqual(['a', 'd']);
    expect(confirmedCustomerOrders(orders[2], orders).map(o => o.id)).toEqual(['c']);
  });
});

it.each([
  [{ status: 'em_atendimento', order_status: 'pago' }, 'confirmed'],
  [{ order_status: 'pronto_para_retirada' }, 'confirmed'],
  [{ status: 'separando' }, 'confirmed'],
  [{ delivery_status: 'picked_up' }, 'won'],
])('projects real domain aliases %j', (order, commercial) => expect(projectCrmOrder({ id: 'a', ...order }).commercial).toBe(commercial));

it.each([
  [{ status: 'novo', fulfillment_status: 'delivered' }, 'won'],
  [{ status: 'aprovado', fulfillment_status: 'cancelled' }, 'cancelled'],
  [{ status: 'novo', delivery_status: 'delivered' }, 'won'],
  [{ status: 'novo', delivery_status: 'pickup_ready' }, 'confirmed'],
  [{ status: 'novo', delivery_status: 'out_for_delivery' }, 'confirmed'],
  [{ status: 'novo', fulfillment_status: 'picking' }, 'confirmed'],
  [{ status: 'novo', fulfillment_status: 'packed' }, 'confirmed'],
  [{ status: 'novo', fulfillment_status: 'shipped' }, 'confirmed'],
  [{ status: 'entregue', fulfillment_status: 'cancelled' }, 'unknown'],
])('reconciles operational evidence without inventing terminal conflicts %j', (order, commercial) => expect(projectCrmOrder({ id: 'a', ...order }).commercial).toBe(commercial));
