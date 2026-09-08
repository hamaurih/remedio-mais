import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminLayout from "@/pages/admin/AdminLayout";

const auth = vi.hoisted(() => ({ user: { id: "test-user" }, isAdmin: true, isSeller: false, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/components/admin/NotificationsBell", () => ({ NotificationsBell: () => null }));
vi.mock("@/components/admin/CieloPendingReconciler", () => ({ CieloPendingReconciler: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) } }));

beforeEach(() => {
  auth.isAdmin = true;
  auth.isSeller = false;
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(cleanup);
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/admin"]}><AdminLayout><h1>Conteúdo existente</h1></AdminLayout></MemoryRouter></QueryClientProvider>);

describe("Admin presentation boundaries", () => {
  it("keeps existing content and groups navigation with working destinations", () => {
    open();
    expect(screen.getByText("Conteúdo existente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Estoque e movimentações" })).toHaveAttribute("href", "/admin/estoque");
    expect(screen.getByRole("link", { name: "Receitas e análise" })).toHaveAttribute("href", "/admin/receitas");
    fireEvent.click(screen.getByRole("button", { name: "Abrir ou recolher menu" }));
    expect(document.querySelector('[data-collapsible="icon"]')).not.toBeNull();
  });
  it("restores public theme when leaving admin and remembers only the admin preference", () => {
    const { unmount } = open();
    fireEvent.click(screen.getByRole("button", { name: "Ativar modo escuro" }));
    expect(document.body).toHaveAttribute("data-admin-theme", "dark");
    expect(localStorage.getItem("atacadao-admin-theme")).toBe("dark");
    unmount();
    expect(document.body).not.toHaveAttribute("data-admin-theme");
    expect(document.documentElement).not.toHaveClass("dark");
  });
  it("opens a labeled mobile drawer and closes it after selecting a module", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Abrir ou recolher menu" }));
    const drawer = document.querySelector('[role="dialog"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.querySelector("h2")).toHaveTextContent("Menu administrativo");
    fireEvent.click(drawer!.querySelector('a[href="/admin/pedidos"]')!);
    if (drawer?.isConnected && drawer.getAttribute("data-state") !== "closed") throw new Error("Mobile drawer did not close after navigation");
  });
  it("does not expose admin navigation or prescriptions to an unpermitted seller", () => {
    auth.isAdmin = false;
    auth.isSeller = true;
    open();
    expect(screen.getByRole("link", { name: "Pedidos" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Configurações" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Receitas e análise" })).not.toBeInTheDocument();
  });
});
