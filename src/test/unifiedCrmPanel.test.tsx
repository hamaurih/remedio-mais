import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// This UI fixture must never initialize the real Supabase client or auth storage.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get() { throw new Error('Real backend disabled in CRM UI tests'); } }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));
import { UnifiedCrmView } from '@/components/admin/UnifiedCrmPanel';
const retry = vi.fn();
const base = { orders: [], loading: false, error: false, retry, page: 0, setPage: vi.fn(), hasNext: false };
afterEach(cleanup);
describe('CRM read-only view', () => {
  it('shows loading, retryable error, and empty states distinctly', () => {
    const { rerender } = render(<UnifiedCrmView {...base} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando');
    rerender(<UnifiedCrmView {...base} error />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível');
    fireEvent.click(screen.getByText('Tentar novamente')); expect(retry).toHaveBeenCalledOnce();
    rerender(<UnifiedCrmView {...base} />);
    expect(screen.getByText('Nenhum pedido nesta página.')).toBeInTheDocument();
  });
  it('renders dimensions and filters only the declared page', () => {
    render(<UnifiedCrmView {...base} orders={[{ id: 'one', customer_name: 'Cliente A', sales_channel: 'site', status: 'pronto_retirada', payment_status: 'pending', delivery_status: 'pickup_ready', total: 20 }, { id: 'two', customer_name: 'Cliente B', source: 'ia', status: 'novo' }]} />);
    expect(screen.getByText('pickup_ready')).toBeInTheDocument();
    expect(screen.getByText(/Somente leitura/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar nesta página'), { target: { value: 'Cliente B' } });
    expect(screen.queryByText('Cliente A')).not.toBeInTheDocument();
    expect(screen.getByText('Cliente B')).toBeInTheDocument();
  });
  it('paginates without claiming all customer history is loaded', () => {
    const setPage = vi.fn();
    render(<UnifiedCrmView {...base} hasNext setPage={setPage} />);
    expect(screen.getByText(/histórico completo/)).toBeInTheDocument();
    expect(screen.getByText('Anterior')).toBeDisabled();
    fireEvent.click(screen.getByText('Próxima')); expect(setPage).toHaveBeenCalledWith(1);
  });
});

it('shows the guest own purchase and page scope inside analysis', () => {
  render(<UnifiedCrmView {...base} orders={[{ id: 'guest', created_at: '2026-10-01T12:00:00Z', customer_name: 'Convidado', payment_status: 'approved', total: 42 }]} />);
  fireEvent.click(screen.getByText('Analisar'));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Análise limitada aos pedidos desta página');
  expect(dialog).toHaveTextContent('42,00');
  expect(dialog).toHaveTextContent('1');
});
