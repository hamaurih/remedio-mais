import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, User, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useCart } from "@/hooks/useCart";
import { useState } from "react";
import { buildWhatsAppLink } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { PromoTicker } from "./PromoTicker";
import { CategoryNav } from "./CategoryNav";

const CATS = [
  { name: "Ofertas", slug: "ofertas" },
  { name: "Medicamentos", slug: "medicamentos" },
  { name: "Genéricos", slug: "genericos" },
  { name: "Dor e Febre", slug: "dor-e-febre" },
  { name: "Gripe e Resfriado", slug: "gripe-e-resfriado" },
  { name: "Vitaminas", slug: "vitaminas" },
  { name: "Higiene Pessoal", slug: "higiene-pessoal" },
  { name: "Mamães e Bebês", slug: "mamaes-e-bebes" },
  { name: "Dermocosméticos", slug: "dermocosmeticos" },
  { name: "Conveniência", slug: "conveniencia" },
  { name: "Primeiros Socorros", slug: "primeiros-socorros" },
  { name: "Aparelhos de Saúde", slug: "aparelhos-de-saude" },
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
      <PromoTicker />

      <div className="container py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-10 h-10 bg-gradient-hero rounded-lg flex items-center justify-center text-primary-foreground font-extrabold text-lg shadow-elevated">A+</div>
            <div className="leading-tight">
              <div className="font-extrabold text-base">Atacadão</div>
              <div className="text-[11px] text-muted-foreground -mt-0.5">dos Medicamentos</div>
            </div>
          </Link>

          <form
            onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/buscar?q=${encodeURIComponent(q.trim())}`); }}
            className="hidden md:flex flex-1 relative max-w-2xl"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="O que você está procurando?"
              className="pl-10 h-11 rounded-full bg-secondary border-transparent focus-visible:ring-primary w-full"
            />
          </form>

          <div className="flex items-center gap-1 ml-auto">
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

        {/* Mobile search */}
        <form
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/buscar?q=${encodeURIComponent(q.trim())}`); }}
          className="md:hidden mt-3 relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="O que você está procurando?"
            className="pl-10 h-10 rounded-full bg-secondary border-transparent focus-visible:ring-primary w-full"
          />
        </form>
      </div>

      <CategoryNav categories={CATS} />
    </header>
  );
}
