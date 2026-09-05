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

    const channel = supabase
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
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, navigate]);

  return null;
}
