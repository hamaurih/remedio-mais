import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearCart, clearPendingPixOrder, getPendingPixOrder } from "@/lib/store";

/**
 * Ao abrir o site, verifica se existe um Pix pendente já pago.
 * Se o pedido foi aprovado (webhook Cielo) enquanto o cliente estava fora
 * da tela do Pix, limpa o carrinho para evitar compra duplicada.
 */
export function PixCartReconciler() {
  useEffect(() => {
    const orderId = getPendingPixOrder();
    if (!orderId) return;
    let active = true;
    (async () => {
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
    })();
    return () => { active = false; };
  }, []);

  return null;
}
