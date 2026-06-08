import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, User, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useCart } from "@/hooks/useCart";
import { useState } from "react";
import { buildWhatsAppLink } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { PromoTicker } from "./PromoTicker";
import { CategoryNav } from "./CategoryNav";
import logoRed from "@/assets/logo-red.png";

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

  const waRaw = settings?.whatsapp || "5583999286000";
  const wa = buildWhatsAppLink(waRaw, "Olá! Preciso de atendimento.");
  // formata "5583999286000" → "(83) 99928-6000"
  const waDisplay = (() => {
    const d = waRaw.replace(/\D/g, "");
    const local = d.length >= 12 ? d.slice(-11) : d;
    if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    return waRaw;
  })();

  return (
    <header className="sticky top-0 z-40 bg-background border-b shadow-card">
      <PromoTicker />

      <div className="container py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center shrink-0" aria-label="Atacadão dos Medicamentos">
            <img
              src={logoRed}
              alt="Farmácia Atacadão dos Medicamentos"
              className="h-12 md:h-16 w-auto object-contain"
              onError={(e) => {
                const t = e.currentTarget;
                t.style.display = "none";
                t.insertAdjacentHTML(
                  "afterend",
                  '<span class="text-primary font-extrabold text-lg md:text-xl">Atacadão dos Medicamentos</span>'
                );
              }}
            />
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

          <div className="flex items-center gap-2 ml-auto">
            {/* Atendimento WhatsApp (não é fluxo de compra) */}
            <a
              href={wa}
              target="_blank"
              rel="noopener"
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
              aria-label="Atendimento WhatsApp"
            >
              <span className="rounded-full bg-whatsapp/10 text-whatsapp p-2">
                <MessageCircle className="h-4 w-4" />
              </span>
              <span className="leading-tight text-left">
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Atendimento WhatsApp</span>
                <span className="block text-sm font-bold text-foreground">{waDisplay}</span>
              </span>
            </a>

            {/* Mobile: só ícone do WhatsApp */}
            <Button asChild size="icon" variant="ghost" className="text-whatsapp lg:hidden" aria-label="Atendimento WhatsApp">
              <a href={wa} target="_blank" rel="noopener"><MessageCircle className="h-5 w-5" /></a>
            </Button>

            {/* Login / conta */}
            <Link
              to={user ? (isAdmin ? "/admin" : "/") : "/auth"}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <span className="rounded-full bg-accent text-primary p-2">
                <User className="h-4 w-4" />
              </span>
              <span className="leading-tight text-left">
                {user ? (
                  <>
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Bem-vindo</span>
                    <span className="block text-sm font-bold text-foreground">{isAdmin ? "Admin" : "Minha conta"}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Olá, faça seu</span>
                    <span className="block text-sm font-bold text-foreground">Login <span className="font-normal text-muted-foreground">ou cadastre-se</span></span>
                  </>
                )}
              </span>
            </Link>

            {/* Mobile login icon */}
            <Button asChild size="icon" variant="ghost" className="md:hidden" aria-label="Entrar">
              <Link to={user ? "/" : "/auth"}><User className="h-5 w-5" /></Link>
            </Button>

            {/* Carrinho */}
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
