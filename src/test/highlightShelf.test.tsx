import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductShelf } from '@/components/ProductShelf';
vi.mock('@/components/ProductCard', () => ({ ProductCard: () => null }));
afterEach(cleanup);

it('usa texto de alto contraste e link sublinhado somente na vitrine amarela, inclusive vazia', () => {
  render(<MemoryRouter><ProductShelf title="Melhores Ofertas" subtitle="Os maiores descontos da loja" backgroundVariant="highlight" products={[]} viewAllLink="/melhores-ofertas" /></MemoryRouter>);
  expect(screen.getByText('Os maiores descontos da loja')).toHaveClass('text-highlight-foreground');
  expect(screen.getByRole('link', { name: 'Ver todos →' })).toHaveClass('text-highlight-foreground', 'underline');
  expect(screen.getByText('Nenhum produto disponível no momento.')).toHaveClass('text-highlight-foreground');
});

it('preserva o tratamento de outras vitrines e seu estado de carregamento', () => {
  const { container } = render(<MemoryRouter><ProductShelf title="Novidades" subtitle="Confira" viewAllLink="/novidades" loading /></MemoryRouter>);
  expect(screen.getByText('Confira')).toHaveClass('text-muted-foreground');
  expect(screen.getByRole('link', { name: 'Ver todos →' })).toHaveClass('text-primary');
  expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
});
