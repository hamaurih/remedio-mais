import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from '@/pages/admin/AdminLayout';
import Cart from '@/pages/Cart';

const mocks = vi.hoisted(() => ({
  auth: { user: null, isAdmin: false, isSeller: false, loading: false },
  stock: vi.fn(),
  aal: "aal2",
  cart: [{ id: 'p', name: 'Produto', quantity: 2, price: 10 }],
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useCart', () => ({ useCart: () => mocks.cart }));
vi.mock('@/lib/liveStock', () => ({ liveCheckProductsDetailed: mocks.stock }));
vi.mock('@/lib/genericSuggestion', () => ({ fetchGenericSuggestion: async () => null }));
vi.mock('@/components/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/Seo', () => ({ Seo: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: mocks.aal } }) } } } }));

function mount(element: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);
}

describe('guard do painel', () => {
  beforeEach(() => { mocks.aal = 'aal2'; mocks.auth = { user: null, isAdmin: false, isSeller: false, loading: false }; });
  it('redireciona visitante para login administrativo', async () => {
    const { Routes, Route } = await import('react-router-dom');
    mount(<Routes><Route path="/" element={<AdminLayout />} /><Route path="/admin/login" element={<p>Login administrativo</p>} /></Routes>);
    expect(await screen.findByText('Login administrativo')).toBeInTheDocument();
  });
  it('exige MFA mesmo com sessão administrativa autenticada', async () => {
    mocks.aal = 'aal1';
    mocks.auth = { user: { id: 'admin' }, isAdmin: true, isSeller: false, loading: false } as unknown as typeof mocks.auth;
    const { Routes, Route } = await import('react-router-dom');
    mount(<Routes><Route path="/" element={<AdminLayout><p>Conteúdo privado</p></AdminLayout>} /><Route path="/admin/login" element={<p>Login administrativo</p>} /></Routes>);
    expect(await screen.findByText('Login administrativo')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument();
  });
  it('bloqueia cliente sem papel staff', async () => {
    mocks.auth = { user: { id: 'cliente' }, isAdmin: false, isSeller: false, loading: false } as unknown as typeof mocks.auth;
    mount(<AdminLayout><p>Conteúdo privado</p></AdminLayout>);
    expect(await screen.findByText('Acesso restrito')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument();
  });
});

describe('resumo do carrinho e estoque', () => {
  beforeEach(() => { mocks.auth = { user: null, isAdmin: false, isSeller: false, loading: false }; });
  it.each([0, 1])('bloqueia pagamento com estoque %s para duas unidades', async stock => {
    mocks.stock.mockResolvedValue({ ok: true, items: [{ product_id: 'p', stock, active: true, fresh: true, price: 10 }] });
    mount(<Cart />);
    await screen.findByText('Atenção: itens do carrinho mudaram');
    expect(screen.queryByText('Liberado para pagar agora')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finalizar itens liberados/ })).toBeDisabled();
  });
  it('falha de consulta bloqueia pagamento e oferece nova tentativa', async () => {
    mocks.stock.mockResolvedValue({ ok: false, items: [] });
    mount(<Cart />);
    await screen.findByText('Não foi possível conferir estoque agora');
    expect(screen.queryByText('Liberado para pagar agora')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled();
  });
  it('libera somente após confirmar estoque suficiente', async () => {
    mocks.stock.mockResolvedValue({ ok: true, items: [{ product_id: 'p', stock: 3, active: true, fresh: true, price: 10 }] });
    mount(<Cart />);
    expect(screen.queryByText('Liberado para pagar agora')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Liberado para pagar agora')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Finalizar itens liberados/ })).toBeEnabled();
  });
});
