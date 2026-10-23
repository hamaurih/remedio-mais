import { Link, useLocation } from "react-router-dom";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { buildPublicWhatsAppLink } from "@/lib/store";
import { useCart } from "@/hooks/useCart";

export function WhatsAppFab() {
  const href = buildPublicWhatsAppLink("Olá! Vim pelo site da Atacadão dos Medicamentos.");
  const location = useLocation();
  const items = useCart();
  const count = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const hideMobileBar = /^\/(checkout|pedido\/|auth|redefinir-senha)/.test(location.pathname);

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        aria-label="Falar no WhatsApp"
        className="hidden md:flex fixed bottom-5 right-5 z-50 bg-whatsapp text-whatsapp-foreground rounded-full p-4 shadow-elevated hover:scale-110 transition-transform"
      >
        <MessageCircle className="h-6 w-6" />
      </a>

      {!hideMobileBar && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),8px)] p-2 shadow-[0_-4px_18px_rgba(0,0,0,0.10)]">
          <div className="grid grid-cols-2 gap-2">
            <a
              href={href}
              target="_blank"
              rel="noopener"
              className="h-11 rounded-full bg-whatsapp text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <Link
              to="/carrinho"
              className="relative h-11 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"
            >
              <ShoppingCart className="h-4 w-4" /> Carrinho
              {count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-foreground text-background text-[10px] flex items-center justify-center">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
