import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearCart, clearPendingPixOrder, getPendingPixOrder } from "@/lib/store";

/**
 * Ao abrir/retomar o site, reconcilia ativamente um Pix pendente com a Cielo.
 * Assim, se o cliente sair da tela do QR para pagar no app do banco e depois
 * voltar ao site, o pedido não depende exclusivamente do webhook.
 */
export function PixCartReconciler() {
  useEffect(() => {
    let active = true;
    let running = false;

    const reconcile = async () => {
      const orderId = getPendingPixOrder();
      if (!orderId || !active || running) return;
      running = true;
      try {
        // A Edge Function consulta a Query API da Cielo e atualiza o pedido
        // somente quando a fonte oficial retornar o novo status.
        try {
          await supabase.functions.invoke("check-cielo-status", {
            body: { order_id: orderId },
          });
        } catch {
          // Fallback abaixo continua lendo o estado já persistido.
        }

        const { data, error } = await supabase
          .from("orders")
          .select("payment_status")
          .eq("id", orderId)
          .maybeSingle();
        if (!active || error) return;
        if (!data) { clearPendingPixOrder(); return; }
        const st = data.payment_status;
        if (st === "approved") {
          clearCart();
          clearPendingPixOrder();
          sessionStorage.removeItem(`pix:${orderId}`);
        } else if (st === "rejected" || st === "cancelled" || st === "refunded") {
          clearPendingPixOrder();
        }
      } finally {
        running = false;
      }
    };

    void reconcile();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
