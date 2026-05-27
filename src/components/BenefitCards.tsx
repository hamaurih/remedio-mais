import { Truck, Store, MessageCircle, FileText, BadgePercent } from "lucide-react";
import { Link } from "react-router-dom";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { buildWhatsAppLink } from "@/lib/store";

type Benefit = {
  icon: typeof Truck;
  title: string;
  desc: string;
  to?: string;
  href?: string;
};

export function BenefitCards() {
  const { data: settings } = useStoreSettings();
  const phone = (settings as any)?.whatsapp || "5583999286000";
  const wa = buildWhatsAppLink(phone, "Olá! Gostaria de fazer um pedido.");

  const items: Benefit[] = [
    { icon: Truck, title: "Entrega rápida", desc: "Em Campina Grande", to: "/categoria/ofertas" },
    { icon: Store, title: "Retire na loja", desc: "Reserve online", to: "/categoria/medicamentos" },
    { icon: MessageCircle, title: "Peça pelo WhatsApp", desc: "Atendimento humano", href: wa },
    { icon: FileText, title: "Envie sua receita", desc: "Análise da farmácia", to: "/enviar-receita" },
    { icon: BadgePercent, title: "Preço baixo todo dia", desc: "Ofertas reais", to: "/categoria/ofertas" },
  ];

  return (
    <section className="container mt-6 md:mt-10">
      <div className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
        {items.map((b) => {
          const inner = (
            <>
              <div className="bg-accent text-primary rounded-full p-2.5">
                <b.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm leading-tight">{b.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{b.desc}</div>
              </div>
            </>
          );
          const cls =
            "snap-start shrink-0 w-[60%] sm:w-[40%] md:w-auto bg-card border border-border rounded-xl p-4 flex flex-col items-start gap-2 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300";
          if (b.href) {
            return (
              <a key={b.title} href={b.href} target="_blank" rel="noopener" className={cls}>
                {inner}
              </a>
            );
          }
          return (
            <Link key={b.title} to={b.to || "/"} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
