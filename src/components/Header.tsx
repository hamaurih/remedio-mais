import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, User, MessageCircle, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useCart } from "@/hooks/useCart";
import { useState } from "react";
import { buildWhatsAppLink } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";

const CATS = [
  ["Ofertas", "ofertas"], ["Medicamentos", "medicamentos"], ["Genéricos", "genericos"],
  ["Dor e Febre", "dor-e-febre"], ["Gripe e Resfriado", "gripe-e-resfriado"],
  ["Vitaminas", "vitaminas"], ["Higiene Pessoal", "higiene-pessoal"],
  ["Mamães e Bebês", "mamaes-e-bebes"], ["Dermocosméticos", "dermocosmeticos"],
  ["Conveniência", "conveniencia"], ["Primeiros Socorros", "primeiros-socorros"],
  ["Aparelhos de Saúde", "aparelhos-de-saude"],
];

export function Header() {
  const { data: settings } = useStoreSettings();
  const cart = useCart();
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();

  const wa = buildWhatsAppLink(settings?.whatsapp || "5583999286000", "Olá! Vim pelo site.");

  return (
    <header className="sticky top-0 z-40 bg-background border-b shadow-card">
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground text-xs">
        <div className="container flex justify-between py-1.5">
          <span className="hidden sm:inline">Atendimento rápido pelo WhatsApp · Entrega local em Campina Grande</span>
          <span className="sm:hidden">Preço baixo todo dia</span>
          <a href={wa} target="_blank" rel="noopener" className="font-semibold">Fale conosco</a>
        </div>
      </div>

      <div className="container py-3 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-10 h-10 bg-gradient-hero rounded-lg flex items-center justify-center text-primary-foreground font-extrabold text-lg shadow-elevated">A+</div>
          <div className="hidden sm:block leading-tight">
            <div className="font-extrabold text-base">Atacadão</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">dos Medicamentos</div>
          </div>
        </Link>

        <form
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/buscar?q=${encodeURIComponent(q.trim())}`); }}
          className="flex-1 relative max-w-2xl"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="O que você está procurando?"
            className="pl-10 h-11 rounded-full bg-secondary border-transparent focus-visible:ring-primary"
          />
        </form>

        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link to={user ? (isAdmin ? "/admin" : "/") : "/auth"}>
              <User className="h-4 w-4 mr-1" /> {user ? (isAdmin ? "Admin" : "Conta") : "Entrar"}
            </Link>
          </Button>
          <Button asChild size="icon" variant="ghost" className="text-whatsapp hidden md:inline-flex">
            <a href={wa} target="_blank" rel="noopener" aria-label="WhatsApp"><MessageCircle className="h-5 w-5" /></a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="relative">
            <Link to="/carrinho" aria-label="Carrinho">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
                  {cartCount}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>

      {/* Categories */}
      <nav className="border-t bg-background">
        <div className="container overflow-x-auto scrollbar-hide">
          <ul className="flex gap-1 py-2 whitespace-nowrap text-sm">
            {CATS.map(([name, slug]) => (
              <li key={slug}>
                <Link
                  to={`/categoria/${slug}`}
                  className="px-3 py-1.5 rounded-full hover:bg-accent hover:text-accent-foreground transition-colors font-medium"
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
}
