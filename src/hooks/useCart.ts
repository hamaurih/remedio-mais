import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CartItem,
  getCart,
  onCartChange,
  updateCartPrescriptionStatuses,
} from "@/lib/store";

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => getCart());

  useEffect(() => onCartChange(() => setItems(getCart())), []);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const ids = Array.from(new Set(getCart().map((item) => item.prescription_id).filter(Boolean))) as string[];
      if (!ids.length) return;
      const { data } = await (supabase as any)
        .from("prescriptions")
        .select("id,status")
        .in("id", ids);
      if (active && data) updateCartPrescriptionStatuses(data);
    };

    void refresh();
    const timer = window.setInterval(refresh, 15000);
    const channel = supabase
      .channel(`cart-prescriptions-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "prescriptions" },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (row.id && row.status) updateCartPrescriptionStatuses([{ id: row.id, status: row.status }]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  return items;
}
