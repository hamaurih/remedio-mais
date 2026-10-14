import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCart, onCartChange } from "@/lib/store";
import { trackCartFunnel } from "@/lib/cartFunnel";

/**
 * Mantém um retrato first-party do carrinho no backend.
 * Não envia nome de produto nem dado de saúde para a Meta.
 */
export function CartFunnelProvider() {
  useEffect(() => {
    let timer: number | null = null;
    const sync = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const items = getCart();
        void trackCartFunnel("snapshot", items);
      }, 250);
    };

    sync();
    const offCart = onCartChange(sync);
    const { data: authSub } = supabase.auth.onAuthStateChange(() => sync());

    return () => {
      if (timer) window.clearTimeout(timer);
      offCart();
      authSub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
