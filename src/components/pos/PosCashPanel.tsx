import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PosSession, brl, posCashMovement, posCloseSession, posGetTerminals, posOpenSession } from "@/lib/pos";

export function PosCashPanel({
  session,
  onChanged,
  canWithdraw,
}: {
  session: PosSession | null;
  onChanged: () => void;
  canWithdraw: boolean;
}) {
  const [terminals, setTerminals] = useState<any[]>([]);
  const [terminalId, setTerminalId] = useState("");
  const [opening, setOpening] = useState("0");
  const [counted, setCounted] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) return;
    posGetTerminals()
      .then((rows) => {
        setTerminals(rows);
        if (rows[0]) setTerminalId(rows[0].id);
      })
      .catch((e) => toast.error(e.message));
  }, [session]);

  async function open() {
    setBusy(true);
    try {
      await posOpenSession(terminalId, Number(opening.replace(",", ".")) || 0);
      toast.success("Caixa aberto");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Falha ao abrir caixa");
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!session) return;
    setBusy(true);
    try {
      const r = await posCloseSession(session.id, Number(counted.replace(",", ".")) || 0);
      toast.success(`Caixa fechado. Esperado ${brl(r.expected_cash)} · Diferença ${brl(r.difference)}`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Falha ao fechar caixa");
    } finally {
      setBusy(false);
    }
  }

  async function movement(type: "withdrawal" | "deposit") {
    if (!session) return;
    setBusy(true);
    try {
      await posCashMovement(session.id, type, Number(amount.replace(",", ".")) || 0);
      setAmount("");
      toast.success(type === "withdrawal" ? "Sangria registrada" : "Suprimento registrado");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Falha na movimentação");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <Card className="p-4 space-y-3">
        <div className="font-bold">Abrir caixa</div>
        <p className="text-sm text-muted-foreground">É obrigatório abrir o caixa antes de vender.</p>
        <div className="space-y-1">
          <Label>Terminal</Label>
          <Select value={terminalId} onValueChange={setTerminalId}>
            <SelectTrigger><SelectValue placeholder="Selecione o caixa" /></SelectTrigger>
            <SelectContent>
              {terminals.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pos-opening">Valor inicial (fundo de troco)</Label>
          <Input id="pos-opening" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>
        <Button className="w-full" onClick={() => void open()} disabled={busy || !terminalId}>Abrir caixa</Button>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="font-bold">Caixa aberto</div>
      <div className="text-sm text-muted-foreground">
        Aberto em {new Date(session.opened_at).toLocaleString("pt-BR")} · fundo {brl(session.opening_amount)}
      </div>
      <div className="space-y-1">
        <Label htmlFor="pos-mov">Sangria / suprimento</Label>
        <Input id="pos-mov" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void movement("deposit")} disabled={busy}>Suprimento</Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void movement("withdrawal")} disabled={busy || !canWithdraw}>
            Sangria
          </Button>
        </div>
        {!canWithdraw && <p className="text-xs text-muted-foreground">Sangria exige perfil gerente ou admin.</p>}
      </div>
      <div className="space-y-1 border-t pt-3">
        <Label htmlFor="pos-counted">Dinheiro contado (fechamento)</Label>
        <Input id="pos-counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0,00" />
        <Button variant="destructive" className="w-full" onClick={() => void close()} disabled={busy || counted === ""}>
          Fechar caixa
        </Button>
      </div>
    </Card>
  );
}
