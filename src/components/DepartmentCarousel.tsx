import { Link } from "react-router-dom";
import {
  Tag, Pill, BadgePercent, Thermometer, Wind, Sun, Sparkles, Baby,
  Droplet, ShoppingBag, Bandage, Stethoscope,
} from "lucide-react";

const DEPARTAMENTOS = [
  { name: "Ofertas", slug: "ofertas", icon: Tag },
  { name: "Medicamentos e Saúde", slug: "medicamentos", icon: Stethoscope },
  { name: "Genéricos", slug: "genericos", icon: BadgePercent },
  { name: "Dor e Febre", slug: "dor-e-febre", icon: Thermometer },
  { name: "Gripe e Resfriado", slug: "gripe-e-resfriado", icon: Wind },
  { name: "Vitaminas", slug: "vitaminas", icon: Sun },
  { name: "Higiene Pessoal", slug: "higiene-pessoal", icon: Droplet },
  { name: "Mamães e Bebês", slug: "mamaes-e-bebes", icon: Baby },
  { name: "Dermocosméticos", slug: "dermocosmeticos", icon: Sparkles },
  { name: "Conveniência", slug: "conveniencia", icon: ShoppingBag },
  { name: "Primeiros Socorros", slug: "primeiros-socorros", icon: Bandage },
];

export function DepartmentCarousel() {
  return (
    <section className="container py-8 md:py-10">
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
          <span className="inline-block w-1 h-6 bg-primary rounded-full" />
          Navegue por departamento
        </h2>
      </div>
      <div className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
        {DEPARTAMENTOS.map((d) => (
          <Link
            key={d.slug}
            to={`/categoria/${d.slug}`}
            className="snap-start shrink-0 w-28 md:w-auto bg-secondary/60 border border-border rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center hover:shadow-elevated hover:border-primary/40 hover:scale-[1.04] transition-all duration-300 aspect-square md:aspect-[4/3]"
          >
            <div className="bg-card text-primary rounded-full p-3 shadow-card">
              <d.icon className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <div className="text-xs md:text-sm font-bold leading-tight">{d.name}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
