import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Home, MessageCircle, ShoppingBag } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPublicWhatsAppLink } from "@/lib/store";

const QUICK_LINKS = [
  { label: "Ofertas", to: "/ofertas" },
  { label: "Medicamentos", to: "/categoria/medicamentos" },
  { label: "Higiene e Beleza", to: "/categoria/higiene-pessoal" },
  { label: "Mamães e Bebês", to: "/categoria/mamaes-e-bebes" },
  { label: "Vitaminas", to: "/categoria/vitaminas" },
];

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    console.error("404 Error: rota inexistente:", location.pathname);
  }, [location.pathname]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/buscar?q=${encodeURIComponent(q)}`);
  };

  return (
    <Layout>
      <Seo
        title="Página não encontrada"
        description="A página solicitada não foi encontrada no Atacadão dos Medicamentos."
        noindex
      />

      <section className="container py-10 md:py-16">
        <div className="max-w-3xl mx-auto rounded-3xl border bg-card shadow-card p-6 md:p-10 text-center">
          <div className="text-primary font-black text-6xl md:text-7xl leading-none">404</div>
          <h1 className="text-2xl md:text-3xl font-extrabold mt-4">Não encontramos essa página</h1>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
            O endereço pode ter mudado. Você pode buscar um produto, voltar à loja ou acessar uma das áreas mais procuradas.
          </p>

          <form onSubmit={submit} className="mt-6 flex gap-2 max-w-xl mx-auto">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto, marca ou código..."
                aria-label="Buscar produto"
              />
            </div>
            <Button type="submit">Buscar</Button>
          </form>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {QUICK_LINKS.map((item) => (
              <Button key={item.to} variant="outline" size="sm" asChild className="rounded-full">
                <Link to={item.to}>{item.label}</Link>
              </Button>
            ))}
          </div>

          <div className="mt-8 grid gap-2 sm:grid-cols-3">
            <Button asChild>
              <Link to="/"><Home className="h-4 w-4 mr-2" />Voltar à loja</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/ofertas"><ShoppingBag className="h-4 w-4 mr-2" />Ver ofertas</Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={buildPublicWhatsAppLink("Olá! Não encontrei o que procurava no site.")} target="_blank" rel="noopener">
                <MessageCircle className="h-4 w-4 mr-2" />WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
