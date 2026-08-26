import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  addToCart,
  cartPayableItems,
  cartPayableTotal,
  cartPendingPrescriptionItems,
  cartTotal,
  formatBRL,
  isPrescriptionCartItem,
  removeFromCart,
  syncCartPrescriptionById,
  updateQty,
} from "@/lib/store";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Sparkles, FileText, Clock3, CheckCircle2, XCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { fetchGenericSuggestion, type GenericSuggestion } from "@/lib/genericSuggestion";
import { CartLiveAlert } from "@/components/CartLiveAlert";
import { SecureBadge } from "@/components/SecureBadge";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { syncCartPrescriptionsFromServer } from "@/lib/prescriptionSync";

function GenericLine({ item, onSwapped }: { item: any; onSwapped: () => void }) {
  const [sug, setSug] = useState<GenericSuggestion | null>(null);
  useEffect(() => {
    let alive = true;
    const pid = item.product_id || item.id;
    if (!pid) return;
    fetchGenericSuggestion(pid).then((s) => { if (alive) setSug(s); });
    return () => { alive = false; };
  }, [item.id, item.product_id]);

  if (!sug) return null;

  const swap = () => {
    removeFromCart(item.id);
    addToCart({
      id: sug.candidate.id,
      product_id: sug.candidate.id,
      name: sug.candidate.name,
      price: sug.candidate.promo_price ?? sug.candidate.price,
      image_url: sug.candidate.image_url,
    }, item.quantity);
    toast.success(`Trocado pelo genérico — economia de ${formatBRL(sug.savings * item.quantity)}`);
    onSwapped();
  };

  return (
    <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-emerald-700 shrink-0" />
      <div className="flex-1 text-[12px] text-emerald-900 min-w-0">
        Existe um <strong>genérico</strong> por <strong>{formatBRL(sug.finalPrice)}</strong> — economize {formatBRL(sug.savings)} ({Math.round(sug.pct * 100)}%)
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-100" onClick={swap}>
        Trocar
      </Button>
    </div>
  );
}

function normalizedStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase();
}

function PrescriptionState({ item }: { item: any }) {
  const status = normalizedStatus(item.prescription_status);
  const productId = item.product_id || item.id;
  const uploadLink = `/enviar-receita?product_id=${encodeURIComponent(productId)}&return_to=${encodeURIComponent("/carrinho")}`;

  if (!item.prescription_id) {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <FileText className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-amber-950">Receita necessária</div>
            <div className="text-xs text-amber-900/80">Este item fica no carrinho e não entra no pagamento até a receita ser aprovada.</div>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to={uploadLink}>Enviar receita</Link>
        </Button>
      </div>
    );
  }

  if (status === "aprovada" && item.prescription_approved_at) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex gap-2 items-start">
        <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
        <div>
          <div className="text-sm font-bold text-emerald-900">Receita aprovada — item liberado</div>
          <div className="text-xs text-emerald-800/80">Este medicamento já pode entrar no checkout.</div>
        </div>
      </div>
    );
  }

  if (["recusada", "rejeitada", "negada"].includes(status)) {
    return (
      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <XCircle className="h-5 w-5 text-red-700 shrink-0" />
          <div>
            <div className="text-sm font-bold text-red-900">Receita não aprovada</div>
            <div className="text-xs text-red-800/80">Envie uma nova receita para este medicamento.</div>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0 border-red-300 text-red-800">
          <Link to={uploadLink}>Enviar nova receita</Link>
        </Button>
      </div>
    );
  }

  const underReview = ["em_analise", "em análise", "analise", "analisando"].includes(status);
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex gap-2 items-start">
      <Clock3 className="h-5 w-5 text-amber-700 shrink-0" />
      <div>
        <div className="text-sm font-bold text-amber-950">{underReview ? "Receita em análise" : "Receita recebida — aguardando análise"}</div>
        <div className="text-xs text-amber-900/80">O item permanece bloqueado. Você pode finalizar a compra dos outros produtos normalmente.</div>
      </div>
    </div>
  );
}

export default function Cart() {
  const items = useCart();
  const { user } = useAuth();
  const total = cartTotal(items);
  const payableItems = useMemo(() => cartPayableItems(items), [items]);
  const pendingItems = useMemo(() => cartPendingPrescriptionItems(items), [items]);
  const payableTotal = useMemo(() => cartPayableTotal(items), [items]);
  const nav = useNavigate();
  const [tick, setTick] = useState(0);

  // Reconciliação por (dono, produto): a aprovação acontece no admin, então o
  // carrinho precisa buscar o estado real no servidor — não basta atualizar
  // apenas receitas já vinculadas no localStorage.
  const prescriptionProductsKey = useMemo(
    () => Array.from(new Set(items.filter(isPrescriptionCartItem).map((i) => i.product_id || i.id))).sort().join(","),
    [items],
  );

  useEffect(() => {
    if (!user || !prescriptionProductsKey) return;
    let alive = true;

    const refresh = async () => {
      if (!alive) return;
      await syncCartPrescriptionsFromServer();
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    const channel = supabase
      .channel(`cart-prescriptions-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions", filter: `user_id=eq.${user.id}` }, (payload: any) => {
        const row = payload.new;
        if (row?.id) syncCartPrescriptionById(row.id, { status: row.status, approved_at: row.approved_at });
        void refresh();
      })
      .subscribe();

    return () => {
      alive = false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, prescriptionProductsKey]);

  return (
    <Layout>
      <Seo title="Seu carrinho" description="Revise os itens do seu carrinho e finalize a compra com segurança na Farmácia Atacadão dos Medicamentos." path="/carrinho" noindex />
      <div className="container py-8">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-6">Seu carrinho</h1>
        {items.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">Seu carrinho está vazio.</p>
            <Button asChild><Link to="/">Continuar comprando</Link></Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div>
              <CartLiveAlert items={items} />
              <div className="space-y-3">
                {items.map((i) => (
                  <div key={i.id} className={`bg-card border rounded-xl p-3 shadow-card ${isPrescriptionCartItem(i) && !payableItems.some((p) => p.id === i.id) ? "border-amber-200" : ""}`}>
                    <div className="flex gap-3 items-center">
                      <img src={i.image_url || productPlaceholder} alt={i.name} loading="lazy" decoding="async" className="w-16 h-16 object-contain bg-secondary/40 rounded-lg" />
                      <div className="flex-1">
                        <div className="font-medium text-sm line-clamp-2">{i.name}</div>
                        {i.variant_label && <div className="text-[11px] text-muted-foreground mt-0.5 font-semibold">{i.variant_label}</div>}
                        <div className="text-primary font-bold mt-1">{formatBRL(i.price)}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(i.id, i.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-8 text-center font-semibold">{i.quantity}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(i.id, i.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeFromCart(i.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                    </div>

                    {isPrescriptionCartItem(i)
                      ? <PrescriptionState item={i} />
                      : <GenericLine key={`${i.id}-${tick}`} item={i} onSwapped={() => setTick((t) => t + 1)} />}
                  </div>
                ))}
              </div>
            </div>

            <aside className="bg-card border rounded-xl p-5 h-fit shadow-card space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Total no carrinho</span>
                  <span>{formatBRL(total)}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span>Liberado para pagar agora</span>
                  <span className="font-extrabold price">{formatBRL(payableTotal)}</span>
                </div>
                {pendingItems.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                    <strong>{pendingItems.length} {pendingItems.length === 1 ? "item aguarda" : "itens aguardam"} receita.</strong> {payableItems.length > 0 ? "Eles ficarão no carrinho enquanto você compra os itens já liberados." : "Envie a receita para liberar a compra."}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Frete e desconto Pix são calculados no checkout somente para os itens liberados.</p>

              <Button
                size="lg"
                className="w-full bg-primary hover:bg-primary-dark font-bold"
                onClick={() => nav("/checkout")}
                disabled={payableItems.length === 0}
              >
                {payableItems.length > 0 ? <>Finalizar itens liberados <ArrowRight className="h-5 w-5 ml-2" /></> : "Aguardando aprovação da receita"}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Continuar comprando</Link>
              </Button>
              <div className="flex justify-center"><SecureBadge /></div>
              <p className="text-[11px] text-muted-foreground text-center">Pagamento seguro via Cielo — Pix ou cartão de crédito.</p>
            </aside>
          </div>
        )}
      </div>
    </Layout>
  );
}
