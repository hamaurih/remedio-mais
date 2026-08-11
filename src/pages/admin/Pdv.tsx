import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { PosProductPanel } from "@/components/pos/PosProductPanel";
import { PosPaymentDialog } from "@/components/pos/PosPaymentDialog";
import { PosCustomerDialog, PosCustomer } from "@/components/pos/PosCustomerDialog";
import { PosCashPanel } from "@/components/pos/PosCashPanel";
import { printReceipt } from "@/components/pos/PosReceipt";
import {
  PosCartItem,
  PosOperator,
  PosPayment,
  PosProduct,
  PosSession,
  brl,
  hasValidPromo,
  itemTotal,
  posFinalizeSale,
  posGetOpenSession,
  posGetOperator,
  posSendSaleToTrier,
  productImage,
  round2,
  unitPrice,
} from "@/lib/pos";

export default function Pdv() {
  const { user, profile, isAdmin } = useAuth();
  const { data: settings } = useStoreSettings();
  const [session, setSession] = useState<PosSession | null>(null);
  const [operator, setOperator] = useState<PosOperator | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PosCartItem[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [payOpen, setPayOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    const [s, o] = await Promise.all([posGetOpenSession(), posGetOperator()]);
    setSession(s);
    setOperator(o);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const role = isAdmin ? "admin" : operator?.pos_role || null;
  const maxDiscount = isAdmin ? 100 : Number(operator?.max_discount_percent ?? 0);
  const canWithdraw = role === "manager" || role === "admin";

  const subtotal = useMemo(() => round2(items.reduce((s, i) => s + unitPrice(i.product) * i.quantity, 0)), [items]);
  const itemDiscounts = useMemo(() => round2(items.reduce((s, i) => s + (i.discount || 0), 0)), [items]);
  const extraDiscount = round2(Number(saleDiscount.replace(",", ".")) || 0);
  const discount = round2(itemDiscounts + extraDiscount);
  const total = round2(Math.max(subtotal - discount, 0));
  const savings = useMemo(
    () =>
      round2(
        items.reduce(
          (s, i) => s + (hasValidPromo(i.product) ? (Number(i.product.price) - Number(i.product.promo_price)) * i.quantity : 0),
          0,
        ),
      ),
    [items],
  );

  function addItem(p: PosProduct, qty: number) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === p.id);
      const stock = Number(p.stock ?? 0);
      if (idx >= 0) {
        const next = [...prev];
        const q = Math.min(next[idx].quantity + qty, stock);
        if (q === next[idx].quantity) toast.error("Quantidade limitada pelo estoque");
        next[idx] = { ...next[idx], quantity: q };
        return next;
      }
      return [...prev, { product: p, quantity: Math.min(qty, stock), discount: 0 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.product.id !== id) return [i];
        const q = i.quantity + delta;
        if (q <= 0) return [];
        if (q > Number(i.product.stock ?? 0)) {
          toast.error("Estoque insuficiente");
          return [i];
        }
        return [{ ...i, quantity: q }];
      }),
    );
  }

  function clearSale() {
    setItems([]);
    setCustomer(null);
    setSaleDiscount("0");
    setFocusSignal((n) => n + 1);
  }

  const finalize = useCallback(
    async (payments: PosPayment[]) => {
      if (!session) {
        toast.error("Abra o caixa antes de finalizar");
        return;
      }
      setBusy(true);
      try {
        const requestId = `${session.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        const result = await posFinalizeSale({
          session_id: session.id,
          client_request_id: requestId,
          customer_id: customer?.id ?? null,
          customer_name: customer?.full_name ?? null,
          customer_cpf: customer?.cpf ?? null,
          customer_phone: customer?.phone ?? null,
          discount: extraDiscount,
          items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity, discount: i.discount || 0 })),
          payments,
        });
        setPayOpen(false);
        toast.success(`Venda #${result.sale_number} concluída · ${brl(result.total)}`);
        printReceipt({
          saleNumber: result.sale_number,
          createdAt: new Date().toISOString(),
          operator: profile?.full_name || user?.email || "Operador",
          storeName: settings?.store_name || "Atacadão dos Medicamentos",
          cnpj: settings?.cnpj,
          customer: customer?.full_name,
          items: items.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            unit_price: unitPrice(i.product),
            total: itemTotal(i),
          })),
          subtotal: result.subtotal,
          discount: result.discount,
          total: result.total,
          payments,
          change: result.change,
        });
        clearSale();
        const trier = await posSendSaleToTrier(result.sale_id, result.order_id);
        if (!trier.ok) toast.warning("Venda registrada. Envio ao Trier pendente — é possível reenviar depois.");
      } catch (e: any) {
        toast.error(e.message || "Falha ao finalizar venda");
      } finally {
        setBusy(false);
      }
    },
    [session, customer, extraDiscount, items, profile, user, settings],
  );

  // Atalhos profissionais de balcão
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        setFocusSignal((n) => n + 1);
      } else if (e.key === "F4") {
        e.preventDefault();
        setCustOpen(true);
      } else if (e.key === "F6") {
        e.preventDefault();
        document.getElementById("pos-sale-discount")?.focus();
      } else if (e.key === "F8" || e.key === "F9") {
        e.preventDefault();
        if (items.length > 0 && session) setPayOpen(true);
      } else if (e.key === "Escape") {
        setPayOpen(false);
        setCustOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, session]);

  if (loading) return <div className="p-10 text-center">Carregando PDV...</div>;

  if (!role) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-bold mb-2">PDV indisponível</h1>
        <p className="text-muted-foreground">Sua conta não está cadastrada como operador de PDV em nenhuma loja.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <header className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-xl font-extrabold">PDV — Ponto de Venda</h1>
          <p className="text-xs text-muted-foreground">
            Perfil: {role} · desconto máximo {maxDiscount}% · F2 produto · F4 cliente · F6 desconto · F8/F9 pagamento · ESC cancela
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCustOpen(true)}>
          <User className="h-4 w-4 mr-1" /> {customer?.full_name || "Consumidor não identificado"}
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <PosProductPanel onAdd={addItem} focusSignal={focusSignal} />

          <Card className="p-0 overflow-hidden">
            <div className="p-3 font-bold border-b">Itens da venda ({items.length})</div>
            {items.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhum item. Bipe o código de barras para começar.
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((i) => (
                  <li key={i.product.id} className="flex items-center gap-3 p-3">
                    <img src={productImage(i.product)} alt="" className="h-12 w-12 rounded object-contain bg-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{i.product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {brl(unitPrice(i.product))} un.
                        {hasValidPromo(i.product) && <Badge className="ml-2">promoção</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeQty(i.product.id, -1)} aria-label="Diminuir">
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm">{i.quantity}</span>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeQty(i.product.id, 1)} aria-label="Aumentar">
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="w-24 text-right text-sm font-semibold">{brl(itemTotal(i))}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setItems((prev) => prev.filter((x) => x.product.id !== i.product.id))}
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <PosCashPanel session={session} onChanged={reload} canWithdraw={canWithdraw} />

          <Card className="p-4 space-y-2">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {savings > 0 && (
              <div className="flex justify-between text-sm text-primary"><span>Economia em promoções</span><span>-{brl(savings)}</span></div>
            )}
            <div className="space-y-1">
              <label htmlFor="pos-sale-discount" className="text-sm">Desconto da venda (R$) — limite {maxDiscount}%</label>
              <Input
                id="pos-sale-discount"
                inputMode="decimal"
                value={saleDiscount}
                onChange={(e) => setSaleDiscount(e.target.value)}
                disabled={maxDiscount <= 0}
              />
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-extrabold"><span>Total</span><span>{brl(total)}</span></div>
            <Button
              className="w-full h-12 text-base"
              onClick={() => setPayOpen(true)}
              disabled={!session || items.length === 0 || total <= 0}
            >
              Pagamento (F8)
            </Button>
            <Button variant="outline" className="w-full" onClick={clearSale} disabled={items.length === 0}>
              Cancelar venda
            </Button>
            {!session && <p className="text-xs text-destructive">Abra o caixa para vender.</p>}
          </Card>
        </div>
      </div>

      <PosPaymentDialog open={payOpen} onOpenChange={setPayOpen} total={total} onConfirm={finalize} busy={busy} />
      <PosCustomerDialog open={custOpen} onOpenChange={setCustOpen} onSelect={setCustomer} />
    </div>
  );
}
