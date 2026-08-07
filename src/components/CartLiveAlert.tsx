import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { liveCheckProductsDetailed } from "@/lib/liveStock";
import { CartItem, formatBRL, removeFromCart, updateItemPrice, updateQty } from "@/lib/store";
import { toast } from "sonner";

type Issue =
  | { kind: "out_of_stock"; item: CartItem }
  | { kind: "low_stock"; item: CartItem; stock: number }
  | { kind: "price"; item: CartItem; newPrice: number };

export function CartLiveAlert({ items }: { items: CartItem[] }) {
  const [checking, setChecking] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    // Variantes têm preço próprio: conferimos apenas produtos simples.
    const simple = items.filter((i) => !i.variant_id);
    if (simple.length === 0) {
      setIssues([]);
      setFailed(false);
      return;
    }
    setChecking(true);
    const res = await liveCheckProductsDetailed(simple.map((i) => i.product_id || i.id));
    setChecking(false);
    setFailed(!res.ok && res.items.length === 0);

    const found: Issue[] = [];
    for (const item of simple) {
      const pid = item.product_id || item.id;
      const live = res.items.find((l) => l.product_id === pid);
      if (!live || !live.fresh) continue;
      if (!live.active || live.stock <= 0) {
        found.push({ kind: "out_of_stock", item });
        continue;
      }
      if (live.stock < item.quantity) {
        found.push({ kind: "low_stock", item, stock: live.stock });
      }
      if (live.price > 0 && Math.abs(live.price - item.price) >= 0.01) {
        found.push({ kind: "price", item, newPrice: live.price });
      }
    }
    setIssues(found);
  }, [items]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const fixAll = () => {
    for (const issue of issues) {
      if (issue.kind === "out_of_stock") removeFromCart(issue.item.id);
      else if (issue.kind === "low_stock") updateQty(issue.item.id, issue.stock);
      else updateItemPrice(issue.item.id, issue.newPrice);
    }
    toast.success("Carrinho atualizado com os dados da loja");
    setIssues([]);
  };

  if (checking && issues.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo estoque e preços na loja...
      </div>
    );
  }

  if (failed) {
    return (
      <Alert className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível conferir estoque agora</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span className="text-sm">Vamos confirmar novamente no checkout.</span>
          <Button size="sm" variant="outline" onClick={() => void run()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tentar de novo
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (issues.length === 0) return null;

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Atenção: itens do carrinho mudaram</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1 text-sm">
          {issues.map((issue, idx) => (
            <li key={`${issue.item.id}-${issue.kind}-${idx}`}>
              <strong>{issue.item.name}</strong>{" "}
              {issue.kind === "out_of_stock"
                ? "— sem estoque no momento (será removido)"
                : issue.kind === "low_stock"
                  ? `— só restam ${issue.stock} unidade(s)`
                  : `— preço mudou de ${formatBRL(issue.item.price)} para ${formatBRL(issue.newPrice)}`}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={fixAll}>
            Atualizar carrinho
          </Button>
          <Button size="sm" variant="outline" onClick={() => void run()} disabled={checking}>
            {checking ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Conferir de novo
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
