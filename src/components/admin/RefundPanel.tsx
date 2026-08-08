import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { formatBRL } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Order = {
  id: string;
  total: number;
  payment_status: string;
  mercado_pago_payment_id: string | null;
  cielo_payment_id?: string | null;
  payment_gateway?: string | null;
};

const RR_LABEL: Record<string, { l: string; v: any }> = {
  pending: { l: "Pendente", v: "secondary" },
  processing: { l: "Processando", v: "secondary" },
  completed: { l: "Concluído", v: "default" },
  failed: { l: "Falhou", v: "destructive" },
  denied: { l: "Negado", v: "destructive" },
};

export function RefundPanel({ order }: { order: Order }) {
  const qc = useQueryClient();
  const { isAdmin, isSeller } = useAuth();
  const [type, setType] = useState<"total" | "partial">("total");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: perm } = useQuery({
    enabled: isSeller && !isAdmin,
    queryKey: ["my_seller_perm"],
    queryFn: async () => {
      const u = await supabase.auth.getUser();
      const uid = u.data.user?.id;
      if (!uid) return null;
      const { data } = await supabase.from("seller_permissions").select("*").eq("user_id", uid).maybeSingle();
      return data;
    },
  });

  const { data: refunds, refetch } = useQuery({
    queryKey: ["refunds", order.id],
    queryFn: async () => (await supabase.from("refund_requests").select("*").eq("order_id", order.id).order("created_at", { ascending: false })).data || [],
  });

  const canExecute = isAdmin || !!perm?.can_execute_refund;
  const canRequest = isAdmin || !!perm?.can_request_refund;

  const refundable = ["approved", "partially_refunded"].includes(order.payment_status);
  const isCielo = !!order.cielo_payment_id;
  const gatewayLabel = isCielo ? "Cielo" : "Mercado Pago";
  const hasPaymentId = isCielo || !!order.mercado_pago_payment_id;

  const submit = async () => {
    if (!refundable) { toast.error("Pedido não está em estado reembolsável"); return; }
    if (!hasPaymentId) { toast.error(`Pedido sem ID de pagamento (${gatewayLabel})`); return; }
    let amt: number | undefined;
    if (type === "partial") {
      const n = parseFloat(amount.replace(",", "."));
      if (!isFinite(n) || n <= 0) { toast.error("Valor parcial inválido"); return; }
      if (n >= Number(order.total)) { toast.error("Para reembolsar tudo, use total"); return; }
      amt = Math.round(n * 100) / 100;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke(isCielo ? "refund-cielo" : "refund-mercado-pago", {
      body: {
        order_id: order.id,
        amount: amt,
        reason: reason || undefined,
        mode: canExecute ? "execute" : "request",
      },
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.error) { toast.error((data as any).error); return; }
    const status = (data as any)?.status;
    toast.success(status === "completed" ? "Reembolso concluído" : "Solicitação registrada");
    setReason(""); setAmount("");
    refetch();
    qc.invalidateQueries({ queryKey: ["admin_orders"] });
  };

  if (!canRequest && !canExecute) {
    return <div className="text-sm text-muted-foreground p-4">Você não tem permissão para reembolsos.</div>;
  }

  return (
    <div className="space-y-4 pt-3">
      {!hasPaymentId && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Este pedido não tem ID de pagamento da Cielo nem do Mercado Pago — reembolso automático indisponível.
        </div>
      )}
      {!refundable && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
          Estado de pagamento: <strong>{order.payment_status}</strong>. Apenas pedidos aprovados ou parcialmente reembolsados podem ser estornados.
        </div>
      )}

      <div className="border rounded-lg p-3 space-y-3">
        <div className="text-sm font-semibold">Novo reembolso</div>
        <RadioGroup value={type} onValueChange={(v: any) => setType(v)} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="total" id="rf-total" />
            <Label htmlFor="rf-total">Total ({formatBRL(order.total)})</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="partial" id="rf-partial" />
            <Label htmlFor="rf-partial">Parcial</Label>
          </div>
        </RadioGroup>
        {type === "partial" && (
          <div>
            <Label className="text-xs">Valor (R$)</Label>
            <Input
              type="number" step="0.01" min="0.01" max={String(order.total)}
              placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        )}
        <div>
          <Label className="text-xs">Motivo (opcional)</Label>
          <Textarea
            rows={2} placeholder="Ex: item indisponível, cliente desistiu, divergência..."
            value={reason} onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {canExecute ? `Será processado na ${gatewayLabel} imediatamente.` : "Solicitação registrada para aprovação do admin."}
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={submitting || !refundable || !hasPaymentId}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            {canExecute ? "Reembolsar" : "Solicitar reembolso"}
          </Button>
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Histórico de reembolsos</div>
        {!refunds?.length ? (
          <div className="text-xs text-muted-foreground">Nenhum reembolso para este pedido.</div>
        ) : (
          <div className="space-y-2">
            {refunds.map((r: any) => (
              <div key={r.id} className="border rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={RR_LABEL[r.status]?.v || "outline"}>{RR_LABEL[r.status]?.l || r.status}</Badge>
                    <span className="font-mono">{r.type}</span>
                    <span className="price">{formatBRL(Number(r.amount))}</span>
                  </div>
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {r.reason && <div className="mt-1">Motivo: {r.reason}</div>}
                {r.error_message && <div className="mt-1 text-destructive">Erro: {r.error_message}</div>}
                {r.cielo_refund_id && (
                  <div className="mt-1 text-muted-foreground">Cielo: <span className="font-mono">{r.cielo_refund_id}</span></div>
                )}
                {r.mercado_pago_refund_id && (
                  <div className="mt-1 text-muted-foreground">MP refund: <span className="font-mono">{r.mercado_pago_refund_id}</span></div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{canExecute ? "Confirmar reembolso" : "Confirmar solicitação"}</AlertDialogTitle>
            <AlertDialogDescription>
              {type === "total"
                ? <>Reembolsar o valor total de <strong>{formatBRL(order.total)}</strong>?</>
                : <>Reembolsar <strong>{formatBRL(parseFloat((amount || "0").replace(",", ".")) || 0)}</strong> deste pedido?</>}
              {canExecute && ` Esta ação não pode ser desfeita na ${gatewayLabel}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={submit}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
