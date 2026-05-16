import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileText, MessageCircle, Stethoscope } from "lucide-react";
import { useStoreSettings } from "@/hooks/useStoreSettings";

export function PrescriptionCTA() {
  const { data: settings } = useStoreSettings();
  const phone = (settings?.whatsapp || "").replace(/\D/g, "");
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent("Olá! Gostaria de enviar uma receita.")}`;

  return (
    <section className="container py-8">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-card p-6 md:p-10 shadow-card">
        <div className="absolute -right-10 -top-10 opacity-10 hidden md:block">
          <Stethoscope className="h-56 w-56 text-primary" />
        </div>
        <div className="relative grid md:grid-cols-[1fr_auto] items-center gap-6 text-center md:text-left">
          <div>
            <h3 className="text-2xl md:text-3xl font-extrabold text-foreground">
              Tem receita? Envie para nossa equipe
            </h3>
            <p className="mt-2 text-muted-foreground max-w-xl mx-auto md:mx-0">
              Analisamos sua receita e ajudamos você a encontrar o medicamento certo.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="font-bold">
              <Link to="/enviar-receita">
                <FileText className="h-5 w-5 mr-2" /> Enviar receita
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="font-bold bg-[#25D366] hover:bg-[#1ebe57] text-white"
            >
              <a href={waLink} target="_blank" rel="noopener">
                <MessageCircle className="h-5 w-5 mr-2" /> Falar no WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
