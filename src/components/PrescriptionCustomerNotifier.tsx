import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function PrescriptionCustomerNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    // Realtime é apenas uma conveniência para avisar o cliente; nunca pode ser
    // requisito para renderizar a loja. Alguns Safari/iOS podem bloquear a
    // criação do WebSocket (SecurityError). Nesse caso, ignoramos o canal e o
    // restante do e-commerce continua funcionando normalmente por HTTP.
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const cleanupChannel = () => {
      const current = channel;
      channel = null;
      if (!current) return;
      try {
        void supabase.removeChannel(current).catch(() => undefined);
      } catch {
        // Falha de limpeza de Realtime não deve afetar a interface pública.
      }
    };

    const startRealtime = () => {
      if (disposed) return;

      try {
        channel = supabase
          .channel(`customer-prescription-alerts:${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "prescriptions",
              filter: `user_id=eq.${user.id}`,
            },
            (payload: any) => {
              const current = payload.new || {};
              const previous = payload.old || {};
              const prescriptionId = String(current.id || "");
              if (!prescriptionId || seen.current.has(prescriptionId)) return;

              const currentStatus = String(current.status || "").toLowerCase();
              const previousStatus = String(previous.status || "").toLowerCase();
              if (currentStatus !== "aprovada" || previousStatus === "aprovada" || !current.approved_at) return;

              seen.current.add(prescriptionId);
              toast.success("Receita aprovada!", {
                description: "O medicamento vinculado já está liberado para continuar a compra.",
                duration: 10000,
                action: {
                  label: "Ver carrinho",
                  onClick: () => navigate("/carrinho"),
                },
              });

              try {
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification("Receita aprovada — Atacadão dos Medicamentos", {
                    body: "Seu item já está liberado para continuar a compra.",
                  });
                }
              } catch {
                // A notificação interna permanece disponível quando o navegador bloqueia notificações nativas.
              }
            },
          );

        try {
          channel.subscribe((status) => {
            if (disposed) return;
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              cleanupChannel();
            }
          });
        } catch {
          cleanupChannel();
        }
      } catch {
        cleanupChannel();
      }
    };

    // Mantém uma funcionalidade não essencial fora do caminho crítico do
    // primeiro paint e reduz o impacto em conexões móveis mais lentas.
    const timer = window.setTimeout(startRealtime, 1500);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      cleanupChannel();
    };
  }, [user?.id, navigate]);

  return null;
}
