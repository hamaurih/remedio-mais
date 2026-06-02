import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { cartTotal, clearCart, formatBRL } from "@/lib/store";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CreditCard, QrCode } from "lucide-react";

type Step = 1 | 2 | 3 | 4;

export default function Checkout() {
  const items = useCart();
  const { user, loading } = useAuth();
  const { data: settings } = useStoreSettings();
  const nav = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);

  // dados cliente
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");

  // entrega
  const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [reference, setReference] = useState("");

  // pagamento
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card">("pix");

  const subtotal = cartTotal(items);
  const deliveryFee = useMemo(
    () => (deliveryType === "delivery" ? Number((settings as any)?.delivery_fee ?? 0) : 0),
    [deliveryType, settings],
  );
  const total = subtotal + deliveryFee;

  // Carrega profile
  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setName((d) => d || data.full_name || "");
        setPhone((d) => d || (data as any).phone || "");
        setCpf((d) => d || (data as any).cpf || "");
      }
    });
  }, [user]);

  // Login obrigatório
  useEffect(() => {
    if (loading) return;
    if (!user) nav(`/auth?next=${encodeURIComponent("/checkout")}`, { replace: true });
  }, [user, loading, nav]);

  // Carrinho vazio
  useEffect(() => {
    if (items.length === 0) nav("/carrinho", { replace: true });
  }, [items.length, nav]);

  const lookupCep = async (value: string) => {
    const c = value.replace(/\D/g, "");
    setCep(c);
    if (c.length === 8) {
      try {
        const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
        const d = await r.json();
        if (!d.erro) {
          setStreet(d.logradouro || "");
          setNeighborhood(d.bairro || "");
          setCity(d.localidade || "");
          setState(d.uf || "");
        }
      } catch { /* ignore */ }
    }
  };

  const goPay = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-mercado-pago-checkout", {
        body: {
          items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
          payment_method: paymentMethod,
          delivery_type: deliveryType,
          customer: { name, email, phone, cpf: cpf || undefined },
          delivery: deliveryType === "delivery"
            ? { cep, street, number, complement, neighborhood, city, state, reference }
            : undefined,
          return_origin: window.location.origin,
        },
      });
      if (error) throw error;
      if (!data?.checkout_url) throw new Error("URL de checkout não recebida");
      clearCart();
      window.location.href = data.checkout_url;
    } catch (e: any) {
      toast.error(e.message || "Falha ao iniciar pagamento");
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return <Layout><div className="container py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="container py-8 max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-6">Finalizar compra</h1>

        <Stepper step={step} />

        {step === 1 && (
          <Section title="Seus dados">
            <Field label="Nome completo"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Telefone / WhatsApp"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(83) 99999-9999" /></Field>
            <Field label="CPF (opcional)"><Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="Necessário para Pix" /></Field>
            <NextBtn disabled={!name || !email || phone.length < 8} onClick={() => setStep(2)} />
          </Section>
        )}

        {step === 2 && (
          <Section title="Entrega ou retirada">
            <RadioGroup value={deliveryType} onValueChange={(v) => setDeliveryType(v as any)} className="grid grid-cols-2 gap-3">
              <label className={`border rounded-lg p-3 cursor-pointer ${deliveryType === "pickup" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="pickup" className="sr-only" />
                <div className="font-bold">Retirar na loja</div>
                <div className="text-xs text-muted-foreground mt-1">{settings?.address || "Endereço da farmácia"}</div>
              </label>
              <label className={`border rounded-lg p-3 cursor-pointer ${deliveryType === "delivery" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="delivery" className="sr-only" />
                <div className="font-bold">Entrega</div>
                <div className="text-xs text-muted-foreground mt-1">Taxa: {formatBRL(Number((settings as any)?.delivery_fee ?? 0))}</div>
              </label>
            </RadioGroup>

            {deliveryType === "delivery" && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Field label="CEP" className="col-span-2 sm:col-span-1">
                  <Input value={cep} onChange={(e) => lookupCep(e.target.value)} maxLength={9} />
                </Field>
                <Field label="Rua" className="col-span-2"><Input value={street} onChange={(e) => setStreet(e.target.value)} /></Field>
                <Field label="Número"><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
                <Field label="Complemento"><Input value={complement} onChange={(e) => setComplement(e.target.value)} /></Field>
                <Field label="Bairro" className="col-span-2"><Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} /></Field>
                <Field label="Cidade"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
                <Field label="UF"><Input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} /></Field>
                <Field label="Referência" className="col-span-2"><Textarea value={reference} onChange={(e) => setReference(e.target.value)} rows={2} /></Field>
              </div>
            )}
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button
                onClick={() => setStep(3)}
                disabled={deliveryType === "delivery" && (!cep || !street || !number || !neighborhood || !city || !state)}
              >Continuar</Button>
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section title="Revisão do pedido">
            <div className="space-y-2 text-sm">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span>{i.quantity}x {i.name}</span>
                  <span>{formatBRL(i.price * i.quantity)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              <div className="flex justify-between"><span>Entrega</span><span>{deliveryFee > 0 ? formatBRL(deliveryFee) : "Grátis / Retirada"}</span></div>
              <div className="flex justify-between text-lg font-extrabold pt-2 border-t"><span>Total</span><span className="text-primary">{formatBRL(total)}</span></div>
            </div>
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
              <Button onClick={() => setStep(4)}>Continuar</Button>
            </div>
          </Section>
        )}

        {step === 4 && (
          <Section title="Forma de pagamento">
            <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)} className="grid grid-cols-2 gap-3">
              <label className={`border rounded-lg p-4 cursor-pointer flex items-center gap-3 ${paymentMethod === "pix" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="pix" className="sr-only" />
                <QrCode className="h-6 w-6" />
                <div>
                  <div className="font-bold">Pix</div>
                  <div className="text-xs text-muted-foreground">Aprovação imediata</div>
                </div>
              </label>
              <label className={`border rounded-lg p-4 cursor-pointer flex items-center gap-3 ${paymentMethod === "credit_card" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="credit_card" className="sr-only" />
                <CreditCard className="h-6 w-6" />
                <div>
                  <div className="font-bold">Cartão de crédito</div>
                  <div className="text-xs text-muted-foreground">Pagamento pelo Mercado Pago</div>
                </div>
              </label>
            </RadioGroup>
            <p className="text-xs text-muted-foreground mt-4">
              Você será redirecionado ao ambiente seguro do Mercado Pago para concluir o pagamento.
            </p>
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep(3)} disabled={submitting}>Voltar</Button>
              <Button onClick={goPay} disabled={submitting} className="bg-primary hover:bg-primary-dark">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecionando...</> : "Pagar agora"}
              </Button>
            </div>
          </Section>
        )}

        <div className="text-center mt-6">
          <Link to="/carrinho" className="text-xs text-muted-foreground hover:underline">Voltar para o carrinho</Link>
        </div>
      </div>
    </Layout>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Dados", "Entrega", "Revisão", "Pagamento"];
  return (
    <div className="flex items-center gap-2 mb-6">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const done = n < step;
        const active = n === step;
        return (
          <div key={l} className="flex items-center gap-2 flex-1">
            <div className={`h-7 w-7 rounded-full inline-flex items-center justify-center text-xs font-bold ${active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-600 text-white" : "bg-secondary text-muted-foreground"}`}>{n}</div>
            <span className={`text-xs ${active ? "font-bold" : "text-muted-foreground"} hidden sm:inline`}>{l}</span>
            {i < labels.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-card space-y-3">
      <h2 className="font-extrabold text-lg">{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1 ${className ?? ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
function NextBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <div className="flex justify-end pt-2"><Button onClick={onClick} disabled={disabled}>Continuar</Button></div>;
}
