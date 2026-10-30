import { describe, expect, it, beforeEach } from 'vitest';
import { adminAccess, strongAdminPassword } from '@/lib/adminAccess';
import { addToCart, getCart, updateQty } from '@/lib/store';

describe('acesso administrativo', () => {
  it('exige login próprio, papel staff e AAL2', () => {
    expect(adminAccess(false, false, false, false)).toBe('login');
    expect(adminAccess(true, false, false, true)).toBe('denied');
    expect(adminAccess(true, true, false, false)).toBe('login');
    expect(adminAccess(true, true, false, true)).toBe('allowed');
    expect(adminAccess(true, false, true, true)).toBe('allowed');
  });
  it('exige senha longa com maiúscula, minúscula, número e símbolo', () => {
    expect(strongAdminPassword('abc12345')).toBe(false);
    expect(strongAdminPassword('SenhaForte123!')).toBe(true);
  });
});
describe('limites de estoque', () => {
  beforeEach(() => localStorage.clear());
  it('não adiciona produto esgotado', () => {
    expect(addToCart({ id: 'p', name: 'Produto', price: 10, available_stock: 0 })).toBe(false);
    expect(getCart()).toEqual([]);
  });
  it('considera quantidade acumulada e impede aumento além do disponível', () => {
    const item = { id: 'p', name: 'Produto', price: 10, available_stock: 2 };
    expect(addToCart(item, 2)).toBe(true);
    expect(addToCart(item)).toBe(false);
    updateQty('p', 3);
    expect(getCart()[0].quantity).toBe(2);
    updateQty('p', 3, 4);
    expect(getCart()[0].quantity).toBe(3);
  });
});
