import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_LABELS, PosPayment, PosPaymentMethod, brl, round2 } from "@/lib/pos";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  onConfirm: (payments: PosPayment[]) => void;
  busy?: boolean;
};

const METHODS: PosPaymentMethod[] = ["cash", "pix", "debit", "credit"];

export function PosPaymentDialog({ open, onOpenChange, total, onConfirm, busy }: Props) {
  const [payments, setPayments] = useState<PosPayment[]>([]);
  const [received, setReceived] = useState<string>("");

  useEffect(() => {
    if (open) {
      setPayments([]);
      setReceived("");
    }
  }, [open]);

  const paid = useMemo(() => round2(payments.reduce((s, p) => s + p.amount, 0)), [payments]);
  const remaining = round2(total - paid);
  const cashDue = round2(payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0));
  const receivedNum = round2(Number(received.replace(",", ".")) || 0);
  const change = cashDue > 0 ? Math.max(round2(receivedNum - cashDue), 0) : 0;

  function addPayment(method: PosPaymentMethod, amount: number) {
    if (amount <= 0) return;
    setPayments((prev) => [...prev, { method, amount: round2(amount) }]);
  }

  function confirm() {
    const final = payments.map((p) =>
      p.method === "cash" ? { ...p, received_amount: receivedNum > 0 ? receivedNum : p.amount } : p,
    );
    onConfirm(final);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagamento</DialogTitle>
          <DialogDescription>Total da venda: {brl(total)}. Pode dividir em várias formas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <PaymentRow key={m} method={m} remaining={remaining} onAdd={addPayment} />
            ))}
          </div>

          {payments.length > 0 && (
            <div className="space-y-1 rounded-md border p-2">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>
                    <Badge variant="outline" className="mr-2">{PAYMENT_LABELS[p.method]}</Badge>
                    {brl(p.amount)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setPayments((prev) => prev.filter((_, x) => x !== i))}>
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          )}

          {cashDue > 0 && (
            <div className="space-y-1">
              <Label htmlFor="pos-received">Valor recebido em dinheiro</Label>
              <Input
                id="pos-received"
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={String(cashDue)}
              />
              <div className="text-sm text-muted-foreground">Troco: <strong>{brl(change)}</strong></div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span>Pago: <strong>{brl(paid)}</strong></span>
            <span className={remaining === 0 ? "text-primary" : "text-destructive"}>
              Falta: <strong>{brl(remaining)}</strong>
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar (ESC)</Button>
          <Button onClick={confirm} disabled={busy || remaining !== 0 || total <= 0 || (cashDue > 0 && receivedNum > 0 && receivedNum < cashDue)}>
            Finalizar venda (F9)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentRow({
  method,
  remaining,
  onAdd,
}: {
  method: PosPaymentMethod;
  remaining: number;
  onAdd: (m: PosPaymentMethod, amount: number) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="rounded-md border p-2 space-y-2">
      <div className="text-sm font-medium">{PAYMENT_LABELS[method]}</div>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0,00"
        aria-label={`Valor em ${PAYMENT_LABELS[method]}`}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            onAdd(method, Number(value.replace(",", ".")) || 0);
            setValue("");
          }}
        >
          Adicionar
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAdd(method, remaining)} disabled={remaining <= 0}>
          Restante
        </Button>
      </div>
    </div>
  );
}
