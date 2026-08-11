import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initMetaPixel, trackPageView } from "@/lib/metaEvents";

/**
 * Inicializa o Meta Pixel uma única vez e dispara PageView em cada
 * mudança real de rota (SPA), sem duplicar na mesma navegação.
 */
export function MetaPixelProvider() {
  const location = useLocation();

  useEffect(() => { void initMetaPixel(); }, []);

  useEffect(() => {
    const path = location.pathname + location.search;
    // Pequeno atraso para garantir que o fbevents.js já tenha inicializado.
    const t = window.setTimeout(() => trackPageView(path), 0);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.search]);

  return null;
}
