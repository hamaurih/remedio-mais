import { Link } from "react-router-dom";

export interface Category {
  name: string;
  slug: string;
}

const DEFAULT_CATS: Category[] = [
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

export function CategoryNav({ categories = DEFAULT_CATS }: { categories?: Category[] }) {
  return (
    <nav className="border-t bg-background">
      <div className="container overflow-x-auto scrollbar-hide snap-x snap-mandatory">
        <ul className="flex gap-1 md:gap-2 py-2 md:py-2.5 whitespace-nowrap text-sm">
          {categories.map((c) => (
            <li key={c.slug} className="snap-start">
              <Link
                to={`/categoria/${c.slug}`}
                className="inline-block px-3 md:px-4 py-1.5 rounded-full hover:bg-accent hover:text-accent-foreground transition-colors font-medium relative group"
              >
                <span>{c.name}</span>
                <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-200" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
