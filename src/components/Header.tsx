import { Link } from "react-router-dom";
import { ShoppingCart, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { CategoryNav } from "./CategoryNav";
import { SearchAutocomplete } from "./SearchAutocomplete";
import logoRed from "@/assets/logo-red.webp";

export function Header() {
  const cart = useCart();
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const { user, profile, isAdmin, isSeller } = useAuth();
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || user?.email || "").toString().trim().split(/\s+/)[0] || "";

  const accountPath = user
    ? isAdmin
      ? "/admin"
      : isSeller
        ? "/admin/vendedor"
        : "/minha-conta"
    : "/auth";

  const accountEyebrow = !user
    ? "Olá, faça seu"
    : isAdmin
      ? "Bem-vindo"
      : isSeller
        ? `Olá, ${firstName || "vendedor"}`
        : `Olá, ${firstName || "cliente"}`;

  const accountLabel = !user
    ? null
    : isAdmin
      ? "Admin"
      : isSeller
        ? "Painel do vendedor"
        : "Minha conta";

  return (
    <header className="sticky top-0 z-40 bg-background border-b shadow-card">

      <div className="container py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center shrink-0" aria-label="Atacadão dos Medicamentos">
            <img
              src={logoRed}
              alt="Farmácia Atacadão dos Medicamentos"
              width={364}
              height={64}
              decoding="async"
              {...({ fetchpriority: "high" } as any)}
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

          <SearchAutocomplete className="hidden md:block flex-1 max-w-3xl" />

          <div className="flex items-center gap-2 ml-auto">
            {/* Login / conta */}
            <Link
              to={accountPath}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <span className="rounded-full bg-accent text-primary p-2">
                <User className="h-4 w-4" />
              </span>
              <span className="leading-tight text-left">
                {user ? (
                  <>
                    <span className="block text-xs uppercase tracking-wide text-muted-foreground font-bold">
                      {accountEyebrow}
                    </span>
                    <span className="block text-base font-bold text-foreground">{accountLabel}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-xs uppercase tracking-wide text-muted-foreground font-bold">Olá, faça seu</span>
                    <span className="block text-base font-bold text-foreground">Login <span className="font-normal text-muted-foreground">ou cadastre-se</span></span>
                  </>
                )}
              </span>
            </Link>


            {/* Mobile login icon */}
            <Button asChild size="icon" variant="ghost" className="md:hidden" aria-label={isSeller ? "Painel do vendedor" : "Entrar"}>
              <Link to={accountPath}><User className="h-5 w-5" /></Link>
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
        <div className="md:hidden mt-3">
          <SearchAutocomplete compact />
        </div>
      </div>

      <CategoryNav />
    </header>
  );
}
