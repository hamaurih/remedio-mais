import { Link } from "react-router-dom";
import { MessageCircle, ShoppingBag, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPublicWhatsAppLink } from "@/lib/store";
import { useStoreSettings } from "@/hooks/useStoreSettings";

export function HomeTopCta() {
  const { data: settings } = useStoreSettings();
  const response = Number(settings?.whatsapp_response_time_minutes || 0);
  const responseText = response > 0
    ? `Respondemos normalmente em até ${response} min no horário de atendimento.`
    : "Atendimento pelo WhatsApp durante o horário da loja.";
  const storeName = settings?.store_name?.trim() || "Atacadão dos Medicamentos";

  return (
    <section className="border-b bg-card/95">
      <div className="container py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="rounded-full bg-primary/10 text-primary p-2 shrink-0">
            <Truck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="font-bold text-sm md:text-base leading-snug">{storeName}: compre online, retire na loja ou receba em casa</h1>
            <p className="text-xs text-muted-foreground">{responseText}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild size="sm" className="rounded-full">
            <Link to="/ofertas"><ShoppingBag className="h-4 w-4 mr-1.5" />Comprar agora</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={buildPublicWhatsAppLink("Olá! Vim pelo site e preciso de atendimento.")} target="_blank" rel="noopener">
              <MessageCircle className="h-4 w-4 mr-1.5" />WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
