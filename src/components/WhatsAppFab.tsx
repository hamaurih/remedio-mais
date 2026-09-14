import { MessageCircle } from "lucide-react";
import { buildPublicWhatsAppLink } from "@/lib/store";

export function WhatsAppFab() {
  const href = buildPublicWhatsAppLink("Olá! Vim pelo site da Atacadão dos Medicamentos.");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 bg-whatsapp text-whatsapp-foreground rounded-full p-4 shadow-elevated hover:scale-110 transition-transform"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
