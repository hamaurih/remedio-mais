import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const CHECK_INTERVAL_MS = 30_000;
const MAX_PER_CYCLE = 8;
const LOOKBACK_HOURS = 24;

/**
 * Redundância operacional para Pix Cielo.
 *
 * A fonte de verdade continua sendo a Query API da Cielo, consultada pela
 * Edge Function check-cielo-status. Este componente apenas garante que,
 * enquanto o painel administrativo estiver aberto, pagamentos pendentes
 * sejam reconciliados mesmo que o cliente tenha fechado a página do QR Code
 * e o webhook da Cielo esteja atrasado ou indisponível.
 */
export function CieloPendingReconciler({ enabled }: { enabled: boolean }) {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const reconcile = async () => {
      if (!active || runningRef.current || document.visibilityState === "hidden") return;
      runningRef.current = true;
      try {
        const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
        const { data, error } = await (supabase as any)
          .from("orders")
          .select("id")
          .eq("payment_gateway", "cielo")
          .eq("payment_method", "pix")
          .eq("payment_status", "pending")
          .not("cielo_payment_id", "is", null)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(MAX_PER_CYCLE);

        if (error || !data?.length) return;

        // Sequencial para não pressionar a API da Cielo.
        for (const row of data) {
          if (!active) break;
          try {
            await supabase.functions.invoke("check-cielo-status", {
              body: { order_id: row.id },
            });
          } catch {
            // O próximo ciclo tenta novamente. Não interrompe o painel.
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    void reconcile();
    const timer = window.setInterval(() => void reconcile(), CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return null;
}
