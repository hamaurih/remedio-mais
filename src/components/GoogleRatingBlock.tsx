import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreSettings } from "@/hooks/useStoreSettings";

const REVIEWS = [
  { name: "Ana L.", text: "Ótimo atendimento, preços baixos e grande variedade." },
  { name: "Carlos M.", text: "Medicamentos com ótimo custo e entrega rápida." },
  { name: "Juliana S.", text: "Encontrei tudo que precisava." },
];

export function GoogleRatingBlock() {
  const { data: settings } = useStoreSettings();
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    settings?.address || "Farmácia Atacadão dos Medicamentos Campina Grande"
  )}`;

  return (
    <section className="container py-10">
      <div className="bg-card border border-border rounded-2xl p-6 md:p-10 shadow-card">
        <div className="grid md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-center">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-1 text-tag">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-6 w-6 fill-current" />
              ))}
            </div>
            <div className="mt-2 text-4xl font-extrabold">4,9</div>
            <div className="text-sm font-semibold text-foreground/80">estrelas no Google</div>
            <div className="text-xs text-muted-foreground mt-1">62 avaliações</div>
            <Button asChild variant="outline" className="mt-4 font-bold">
              <a href={mapsLink} target="_blank" rel="noopener">Ver no Google</a>
            </Button>
          </div>

          <div>
            <p className="text-base md:text-lg font-semibold text-foreground">
              Preço baixo, variedade e atendimento rápido em Campina Grande.
            </p>
            <div className="grid sm:grid-cols-3 gap-3 mt-4">
              {REVIEWS.map((r) => (
                <div
                  key={r.name}
                  className="bg-secondary/50 border border-border rounded-xl p-4 hover:shadow-card transition-shadow"
                >
                  <div className="flex items-center gap-1 text-tag mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm text-foreground/90">"{r.text}"</p>
                  <p className="text-xs text-muted-foreground mt-2 font-semibold">— {r.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
