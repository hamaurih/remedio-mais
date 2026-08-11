import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { posSearchCustomers } from "@/lib/pos";

export type PosCustomer = {
  id: string | null;
  full_name: string | null;
  cpf: string | null;
  phone: string | null;
};

export function PosCustomerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (c: PosCustomer | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<PosCustomer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTerm("");
      setRows([]);
    }
  }, [open]);

  async function search() {
    setLoading(true);
    try {
      setRows((await posSearchCustomers(term)) as PosCustomer[]);
    } catch (e: any) {
      toast.error(e.message || "Falha ao buscar cliente");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cliente</DialogTitle>
          <DialogDescription>Busque por CPF, nome ou telefone. Sem seleção, a venda é para consumidor não identificado.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder="CPF, nome ou telefone"
          />
          <Button onClick={() => void search()} disabled={loading}>Buscar</Button>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y">
          {rows.map((c) => (
            <button
              key={c.id}
              className="w-full text-left p-2 hover:bg-accent rounded-md"
              onClick={() => {
                onSelect(c);
                onOpenChange(false);
              }}
            >
              <div className="text-sm font-medium">{c.full_name || "Sem nome"}</div>
              <div className="text-xs text-muted-foreground">
                {c.cpf || "sem CPF"} · {c.phone || "sem telefone"}
              </div>
            </button>
          ))}
          {!loading && rows.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">Nenhum cliente listado.</div>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => {
            onSelect(null);
            onOpenChange(false);
          }}
        >
          Consumidor não identificado
        </Button>
      </DialogContent>
    </Dialog>
  );
}
