import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CategoryNav } from '@/components/CategoryNav';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/usePublicBootstrap', () => ({ usePublicBootstrap: () => ({ data: undefined }) }));
vi.mock('@/hooks/useMenu', () => ({ useMenu: () => ({ data: [] }), resolveMenuHref: () => '/' }));
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
afterEach(() => { cleanup(); });

it('mostra apenas as setas dos lados com conteúdo e permite teclado e rolagem suave', () => {
  render(<MemoryRouter><CategoryNav /></MemoryRouter>);
  const region = screen.getByRole('region', { name: 'Categorias da loja' });
  Object.defineProperties(region, {
    clientWidth: { configurable: true, value: 400 },
    scrollWidth: { configurable: true, value: 1000 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
  });
  region.scrollBy = vi.fn();
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.queryByRole('button', { name: 'Categorias anteriores' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mais categorias' }));
  expect(region.scrollBy).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' });
  region.scrollLeft = 300;
  fireEvent.scroll(region);
  expect(screen.getByRole('button', { name: 'Categorias anteriores' })).toBeInTheDocument();
  fireEvent.keyDown(region, { key: 'ArrowLeft' });
  expect(region.scrollBy).toHaveBeenLastCalledWith({ left: -320, behavior: 'smooth' });
  region.scrollLeft = 600;
  fireEvent.scroll(region);
  expect(screen.queryByRole('button', { name: 'Mais categorias' })).not.toBeInTheDocument();
  Object.defineProperty(region, 'scrollWidth', { value: 400 });
  region.scrollLeft = 0;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.queryByRole('button', { name: /Categorias anteriores|Mais categorias/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Higiene Pessoal' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Mamães e Bebês' })).toBeInTheDocument();
});
