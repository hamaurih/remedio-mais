import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initMetaPixel, trackPageView } from "@/lib/metaEvents";
import { gaPageView, initGoogleAnalytics } from "@/lib/googleAnalytics";
import { getCart } from "@/lib/store";
import { trackCartFunnel } from "@/lib/cartFunnel";

/**
 * Inicializa o Meta Pixel uma única vez e dispara PageView em cada
 * mudança real de rota (SPA), sem duplicar na mesma navegação.
 * Também mantém nosso funil first-party atualizado independentemente da Meta.
 */
export function MetaPixelProvider() {
  const location = useLocation();

  useEffect(() => {
    void initMetaPixel();
    void initGoogleAnalytics();
  }, []);

  useEffect(() => {
    const path = location.pathname + location.search;
    // Pequeno atraso para garantir que o fbevents.js já tenha inicializado.
    const t = window.setTimeout(() => {
      trackPageView(path);
      gaPageView(path);
    }, 0);

    const cart = getCart();
    if (cart.length > 0) {
      void trackCartFunnel(
        location.pathname === "/checkout" ? "checkout_started" : "snapshot",
        cart,
      );
    }

    return () => window.clearTimeout(t);
  }, [location.pathname, location.search]);

  return null;
}
