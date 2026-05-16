import { Truck, Store, MessageCircle, FileText, BadgePercent } from "lucide-react";

const BENEFITS = [
  { icon: Truck, title: "Entrega rápida", desc: "Em Campina Grande" },
  { icon: Store, title: "Retire na loja", desc: "Reserve online" },
  { icon: MessageCircle, title: "Peça pelo WhatsApp", desc: "Atendimento humano" },
  { icon: FileText, title: "Envie sua receita", desc: "Análise da farmácia" },
  { icon: BadgePercent, title: "Preço baixo todo dia", desc: "Ofertas reais" },
];

export function BenefitCards() {
  return (
    <section className="container mt-6 md:mt-10">
      <div className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
        {BENEFITS.map((b) => (
          <div
            key={b.title}
            className="snap-start shrink-0 w-[60%] sm:w-[40%] md:w-auto bg-card border border-border rounded-xl p-4 flex flex-col items-start gap-2 shadow-card hover:shadow-elevated hover:-translate-y-1 hover:border-primary/40 transition-all duration-300"
          >
            <div className="bg-accent text-primary rounded-full p-2.5">
              <b.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm leading-tight">{b.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{b.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
