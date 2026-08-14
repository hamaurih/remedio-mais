import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { cartTotal, clearCart, formatBRL, setPendingPixOrder } from "@/lib/store";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackAddPaymentInfo, trackInitiateCheckout } from "@/lib/metaEvents";
import { getFbc, getFbp } from "@/lib/metaPixel";
import { Loader2, CreditCard, QrCode, AlertTriangle, Lock } from "lucide-react";
import { AddressAutocomplete, type SelectedAddress } from "@/components/AddressAutocomplete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildInstallmentOptions, maxInstallmentsForTotal } from "@/lib/installments";



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
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [saveAddress, setSaveAddress] = useState(true);

  // geolocalização + frete por distância
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<{
    ok: boolean;
    mode: "flat" | "distance" | null;
    allowed: boolean;
    fee: number | null;
    distance_km: number | null;
    distance_source?: "route" | "haversine" | null;
    distance_warning?: string;
    zone_label?: string;
    message?: string;
  } | null>(null);
  const [quoting, setQuoting] = useState(false);

  // pagamento
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card">("pix");
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiration, setCardExpiration] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [installments, setInstallments] = useState(1);



  const subtotal = cartTotal(items);
  const deliveryMode: "flat" | "distance" =
    ((settings as any)?.delivery_mode as "flat" | "distance") ?? "distance";
  const deliveryFee = useMemo(() => {
    if (deliveryType !== "delivery") return 0;
    // Modo taxa fixa: usa a taxa configurada.
    if (deliveryMode === "flat") return Number((settings as any)?.delivery_fee ?? 0);
    // Modo distância: SOMENTE a cotação válida define o frete. Nunca cai para taxa fixa.
    if (deliveryQuote?.ok && deliveryQuote.allowed && deliveryQuote.fee != null) return deliveryQuote.fee;
    return 0;
  }, [deliveryType, deliveryMode, deliveryQuote, settings]);
  const total = subtotal + deliveryFee;
  // Bloqueia avanço: cotação recusada/erro, ou (modo distância) sem cotação válida.
  const hasValidQuote =
    deliveryQuote?.ok === true && deliveryQuote.allowed === true && deliveryQuote.fee != null;
  const deliveryBlocked =
    deliveryType === "delivery" &&
    (deliveryMode === "distance"
      ? !hasValidQuote
      : deliveryQuote != null && deliveryQuote.ok && !deliveryQuote.allowed);
  const deliveryBlockMessage =
    deliveryQuote?.ok && deliveryQuote.message
      ? deliveryQuote.message
      : "Não conseguimos validar seu endereço para calcular a entrega. Confira o endereço e tente novamente.";


  // Carrega profile + endereços salvos
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
    supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", user.id)
      .order("is_default", { ascending: false })
      .then(({ data }) => {
        const list = data || [];
        setSavedAddresses(list);
        const def = list.find((a: any) => a.is_default) || list[0];
        if (def) {
          setSelectedAddressId(def.id);
          applyAddress(def);
          setSaveAddress(false);
        }
      });
  }, [user]);

  const applyAddress = (a: any) => {
    setCep(a.cep || "");
    setStreet(a.street || "");
    setNumber(a.number || "");
    setComplement(a.complement || "");
    setNeighborhood(a.neighborhood || "");
    setCity(a.city || "");
    setState(a.state || "");
    setReference(a.reference || "");
    setLat(a.lat ?? null);
    setLng(a.lng ?? null);
    setPlaceId(a.place_id ?? null);
  };

  // Qualquer edição manual de campo de endereço invalida as coordenadas
  // obtidas anteriormente (Google/geocode), evitando frete do ponto antigo.
  const invalidateCoords = () => {
    setLat(null); setLng(null); setPlaceId(null); setDeliveryQuote(null);
  };

  const pickSavedAddress = (id: string) => {
    setSelectedAddressId(id);
    setDeliveryQuote(null);
    if (id === "new") {
      setCep(""); setStreet(""); setNumber(""); setComplement("");
      setNeighborhood(""); setCity(""); setState(""); setReference("");
      setLat(null); setLng(null); setPlaceId(null);
      setSaveAddress(true);
    } else {
      const a = savedAddresses.find((x) => x.id === id);
      if (a) { applyAddress(a); setSaveAddress(false); }
    }
  };

  // Cota o frete sempre que houver lat/lng (ou só endereço estruturado) na entrega
  useEffect(() => {
    if (deliveryType !== "delivery") { setDeliveryQuote(null); return; }
    const hasCoords = typeof lat === "number" && typeof lng === "number";
    const hasAddr = !!(street && number && city && state);
    if (!hasCoords && !hasAddr) { setDeliveryQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    const fullAddress = hasCoords ? undefined : `${street}, ${number}, ${neighborhood}, ${city}-${state}, ${cep}`;
    supabase.functions.invoke("calculate-delivery-fee", {
      body: hasCoords ? { lat, lng } : { address: fullAddress },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data?.ok) {
        setDeliveryQuote({
          ok: false,
          mode: null,
          allowed: false,
          fee: null,
          distance_km: null,
          distance_source: null,
          message: "Não conseguimos validar seu endereço para calcular a entrega. Confira o endereço e tente novamente.",
        });
      } else {
        setDeliveryQuote({
          ok: true,
          mode: (data.mode as "flat" | "distance") ?? null,
          allowed: !!data.allowed,
          fee: data.fee ?? null,
          distance_km: data.distance_km ?? null,
          distance_source: (data.distance_source as "route" | "haversine") ?? null,
          distance_warning: data.distance_warning ?? undefined,
          zone_label: data.zone_label,
          message: data.message,
        });
        // Se o backend geocodificou, capturar coordenadas
        if (!hasCoords && typeof data.lat === "number" && typeof data.lng === "number") {
          setLat(data.lat);
          setLng(data.lng);
          // Persistir no endereço salvo, se aplicável
          if (user && selectedAddressId && selectedAddressId !== "new") {
            supabase.from("customer_addresses")
              .update({ lat: data.lat, lng: data.lng })
              .eq("id", selectedAddressId)
              .then(() => {});
          }
        }
      }
    }).finally(() => { if (!cancelled) setQuoting(false); });
    return () => { cancelled = true; };
  }, [deliveryType, lat, lng, street, number, neighborhood, city, state, cep]);




  // Login obrigatório
  useEffect(() => {
    if (loading) return;
    if (!user) nav(`/auth?next=${encodeURIComponent("/checkout")}`, { replace: true });
  }, [user, loading, nav]);

  // Carrinho vazio
  useEffect(() => {
    if (items.length === 0) nav("/carrinho", { replace: true });
  }, [items.length, nav]);

  // Meta InitiateCheckout: uma vez, com carrinho não vazio.
  const icSent = useRef(false);
  useEffect(() => {
    if (icSent.current || items.length === 0) return;
    icSent.current = true;
    trackInitiateCheckout(items, cartTotal(items));
  }, [items]);

  const lookupCep = async (value: string) => {
    const c = value.replace(/\D/g, "");
    setCep(c);
    // CEP alterado: coordenadas antigas não valem mais
    invalidateCoords();
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

  const persistCustomerData = async () => {
    if (!user) return;
    // Atualiza profile com nome/telefone/cpf se vieram preenchidos
    await supabase.from("profiles").update({
      full_name: name || null,
      phone: phone || null,
      cpf: cpf || null,
    }).eq("id", user.id);

    // Salva endereço novo se aplicável
    if (deliveryType === "delivery" && saveAddress && selectedAddressId === "new" && cep && street) {
      await supabase.from("customer_addresses").insert({
        customer_id: user.id,
        cep, street, number, complement, neighborhood, city, state, reference,
        lat: lat ?? null,
        lng: lng ?? null,
        place_id: placeId ?? null,
        is_default: savedAddresses.length === 0,
      } as any);
    }
  };

  const parseInvokeError = async (error: any, data: any) => {
    if (error) {
      let parsed: any = null;
      try {
        const resp: Response | undefined = (error as any)?.context;
        if (resp && typeof resp.text === "function") {
          const text = await resp.text();
          try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }
        }
      } catch { /* ignore */ }
      const msg = parsed?.error || parsed?.message || (error as any)?.message || "Falha ao iniciar pagamento";
      const code = parsed?.error_code ? ` [${parsed.error_code}]` : "";
      throw new Error(`${msg}${code}`);
    }
    if (data && data.success === false) {
      const code = data.error_code ? ` [${data.error_code}]` : "";
      const reason = data.error || data.reason;
      const friendly = data.status === "rejected"
        ? `${reason ? reason + ". " : ""}Cartão recusado pela operadora. Tente outro cartão ou use Pix.`
        : (reason || "Falha ao iniciar pagamento");
      throw new Error(`${friendly}${code}`);
    }
  };

  const goPay = async () => {
    if (!user) return;
    // Pix exige CPF
    if (paymentMethod === "pix") {
      const onlyDigits = cpf.replace(/\D/g, "");
      if (onlyDigits.length !== 11) {
        toast.error("CPF é obrigatório para pagamento via Pix. Volte para a etapa 'Seus dados' e preencha.", { duration: 8000 });
        setStep(1);
        return;
      }
    }
    setSubmitting(true);
    // Meta AddPaymentInfo: apenas o tipo de meio de pagamento e o valor.
    trackAddPaymentInfo(paymentMethod, total);
    try {
      // A conferência de estoque/preço na farmácia é feita no carrinho.
      // Aqui o servidor ainda valida estoque e preço esperado (rápido, sem chamar a Trier).
      await persistCustomerData();

      const commonBody = {
        items: items.map((i) => ({
          id: i.product_id || i.id,
          variant_id: i.variant_id || null,
          quantity: i.quantity,
          expected_unit_price: i.price,
        })),
        delivery_type: deliveryType,
        customer: { name, email, phone, cpf: cpf || undefined },
        delivery: deliveryType === "delivery"
          ? { cep, street, number, complement, neighborhood, city, state, reference, lat: lat ?? undefined, lng: lng ?? undefined, place_id: placeId ?? undefined }
          : undefined,
        // Identificadores Meta do navegador, para o Purchase server-side (CAPI).
        meta: { fbp: getFbp(), fbc: getFbc() },
      };

      if (paymentMethod === "pix") {
        // Pix nativo (Cielo): gera QR Code e navega para a tela interna
        const { data, error } = await supabase.functions.invoke("create-cielo-pix", { body: commonBody });
        await parseInvokeError(error, data);
        if (!data?.order_id || !data?.qr_code_base64) throw new Error("Resposta inválida do servidor Pix.");
        sessionStorage.setItem(`pix:${data.order_id}`, JSON.stringify({
          qr_code: data.qr_code,
          qr_code_base64: data.qr_code_base64,
          expires_at: data.expires_at,
          total: data.total,
        }));
        // O carrinho só é limpo quando o Pix for confirmado. Guardamos o pedido
        // pendente para reconciliar mesmo se o cliente fechar a página.
        setPendingPixOrder(data.order_id);
        nav(`/pedido/pix/${data.order_id}`, { replace: true });
        return;
      }

      // Cartão de crédito via Cielo (transparente – processado aqui mesmo)
      const cardDigits = cardNumber.replace(/\D/g, "");
      if (cardDigits.length < 13) { toast.error("Número de cartão inválido."); setSubmitting(false); return; }
      if (!cardHolder.trim()) { toast.error("Informe o nome como no cartão."); setSubmitting(false); return; }
      if (!/^\d{2}\s*\/\s*\d{2,4}$/.test(cardExpiration)) { toast.error("Validade inválida (MM/AA)."); setSubmitting(false); return; }
      if (cardCvv.replace(/\D/g, "").length < 3) { toast.error("CVV inválido."); setSubmitting(false); return; }

      const { data, error } = await supabase.functions.invoke("create-cielo-card", {
        body: {
          ...commonBody,
          card: {
            number: cardDigits,
            holder: cardHolder.trim().toUpperCase(),
            expiration: cardExpiration,
            security_code: cardCvv,
            installments,
          },
        },
      });
      await parseInvokeError(error, data);
      if (data?.status === "approved") {
        const orderId = data.order_id;
        clearCart();
        toast.success("Pagamento aprovado!");
        nav(`/pedido/sucesso?order=${orderId}`, { replace: true });
        return;
      }
      throw new Error(data?.reason || "Cartão recusado pela operadora. Tente outro cartão ou use Pix.");

    } catch (e: any) {
      toast.error(e?.message || "Falha ao iniciar pagamento", { duration: 8000 });
      setSubmitting(false);
    }
  };


  if (loading || !user) {
    return <Layout><div className="container py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div></Layout>;
  }

  return (
    <Layout>
      <Seo title="Checkout" description="Finalize seu pedido com pagamento seguro por cartão ou Pix." path="/checkout" noindex />
      <div className="container py-8 max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-6">Finalizar compra</h1>

        <Stepper step={step} />

        {step === 1 && (
          <Section title="Seus dados">
            <Field label="Nome completo"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Telefone / WhatsApp"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(83) 99999-9999" /></Field>
            <Field label={paymentMethod === "pix" ? "CPF (obrigatório para Pix)" : "CPF (opcional)"}><Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" /></Field>
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
                <div className="text-xs text-muted-foreground mt-1">
                  {deliveryMode === "distance"
                    ? "Calculada pelo endereço"
                    : `Taxa: ${formatBRL(Number((settings as any)?.delivery_fee ?? 0))}`}
                </div>
              </label>
            </RadioGroup>

            {deliveryType === "delivery" && savedAddresses.length > 0 && (
              <div className="mt-4 space-y-2">
                <Label className="text-xs">Endereços salvos</Label>
                <div className="space-y-2">
                  {savedAddresses.map((a) => (
                    <label key={a.id} className={`block border rounded-lg p-3 text-sm cursor-pointer ${selectedAddressId === a.id ? "border-primary bg-primary/5" : ""}`}>
                      <input type="radio" name="saved-addr" className="sr-only" checked={selectedAddressId === a.id} onChange={() => pickSavedAddress(a.id)} />
                      <div className="font-semibold">{a.street}, {a.number}{a.complement ? ` - ${a.complement}` : ""}</div>
                      <div className="text-xs text-muted-foreground">{a.neighborhood} · {a.city}/{a.state} · CEP {a.cep}</div>
                    </label>
                  ))}
                  <label className={`block border rounded-lg p-3 text-sm cursor-pointer ${selectedAddressId === "new" ? "border-primary bg-primary/5" : ""}`}>
                    <input type="radio" name="saved-addr" className="sr-only" checked={selectedAddressId === "new"} onChange={() => pickSavedAddress("new")} />
                    <div className="font-semibold">+ Usar outro endereço</div>
                  </label>
                </div>
              </div>
            )}

            {deliveryType === "delivery" && selectedAddressId === "new" && (
              <div className="mt-4 space-y-3">
                <Field label="Buscar endereço (Google)" className="col-span-2">
                  <AddressAutocomplete
                    onSelect={(a) => {
                      applyAddress({
                        cep: a.cep || "",
                        street: a.street || "",
                        number: a.number || "",
                        neighborhood: a.neighborhood || "",
                        city: a.city || "",
                        state: a.state || "",
                        lat: a.lat,
                        lng: a.lng,
                        place_id: a.place_id,
                      });
                    }}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CEP" className="col-span-2 sm:col-span-1">
                    <Input value={cep} onChange={(e) => lookupCep(e.target.value)} maxLength={9} />
                  </Field>
                  <Field label="Rua" className="col-span-2"><Input value={street} onChange={(e) => { setStreet(e.target.value); invalidateCoords(); }} /></Field>
                  <Field label="Número"><Input value={number} onChange={(e) => { setNumber(e.target.value); invalidateCoords(); }} /></Field>
                  <Field label="Complemento"><Input value={complement} onChange={(e) => setComplement(e.target.value)} /></Field>
                  <Field label="Bairro" className="col-span-2"><Input value={neighborhood} onChange={(e) => { setNeighborhood(e.target.value); invalidateCoords(); }} /></Field>
                  <Field label="Cidade"><Input value={city} onChange={(e) => { setCity(e.target.value); invalidateCoords(); }} /></Field>
                  <Field label="UF"><Input value={state} onChange={(e) => { setState(e.target.value.toUpperCase()); invalidateCoords(); }} maxLength={2} /></Field>
                  <Field label="Referência" className="col-span-2"><Textarea value={reference} onChange={(e) => setReference(e.target.value)} rows={2} /></Field>
                  <label className="col-span-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                    Salvar este endereço para próximos pedidos
                  </label>
                </div>
              </div>
            )}

            {deliveryType === "delivery" && (quoting || deliveryQuote) && (
              <div className={`mt-4 rounded-lg border p-3 text-sm ${deliveryBlocked ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5"}`}>
                {quoting ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Calculando frete pela distância…</span>
                ) : deliveryBlocked ? (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <div>{deliveryBlockMessage}</div>
                  </div>
                ) : (
                  <div>
                    Frete: <strong>{formatBRL(Number(deliveryQuote?.fee ?? 0))}</strong>
                    {deliveryQuote?.distance_km != null && <span className="text-muted-foreground"> · {deliveryQuote.distance_km} km {deliveryQuote.zone_label ? `(${deliveryQuote.zone_label})` : ""}</span>}
                    {deliveryQuote?.distance_source === "haversine" && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Distância aproximada — pode variar um pouco no trajeto real.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button
                onClick={() => setStep(3)}
                disabled={
                  (deliveryType === "delivery" && (!cep || !street || !number || !neighborhood || !city || !state)) ||
                  deliveryBlocked || quoting
                }
              >Continuar</Button>
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section title="Revisão do pedido">
            <div className="space-y-2 text-sm">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span>
                    {i.quantity}x {i.name}
                    {i.variant_label && <span className="text-muted-foreground"> · {i.variant_label}</span>}
                  </span>
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
                  <div className="text-xs text-muted-foreground">QR Code aqui mesmo · aprovação imediata</div>
                </div>
              </label>
              <label className={`border rounded-lg p-4 cursor-pointer flex items-center gap-3 ${paymentMethod === "credit_card" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="credit_card" className="sr-only" />
                <CreditCard className="h-6 w-6" />
                <div>
                  <div className="font-bold">Cartão de crédito</div>
                  <div className="text-xs text-muted-foreground">Até {maxInstallmentsForTotal(total)}x sem juros · Cielo</div>
                </div>
              </label>
            </RadioGroup>

            {paymentMethod === "credit_card" && (
              <div className="mt-4 space-y-3 border rounded-lg p-4 bg-secondary/20">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  Ambiente seguro Cielo · seus dados são criptografados
                </div>
                <Field label="Número do cartão">
                  <Input
                    value={cardNumber}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 19);
                      const grouped = d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
                      setCardNumber(grouped);
                    }}
                    placeholder="0000 0000 0000 0000"
                    inputMode="numeric"
                    autoComplete="cc-number"
                  />
                </Field>
                <Field label="Nome como está no cartão">
                  <Input
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                    placeholder="NOME SOBRENOME"
                    autoComplete="cc-name"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Validade (MM/AA)">
                    <Input
                      value={cardExpiration}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                        setCardExpiration(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                      }}
                      placeholder="12/28"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                    />
                  </Field>
                  <Field label="CVV">
                    <Input
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="000"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                    />
                  </Field>
                </div>
                <Field label="Parcelamento">
                  <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {buildInstallmentOptions(total).map((o) => (
                        <SelectItem key={o.n} value={String(o.n)}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              {paymentMethod === "pix"
                ? "Você verá o QR Code e o Pix Copia e Cola na próxima tela, sem sair do site."
                : "Pagamento processado com segurança pela Cielo. Aprovação imediata ao finalizar."}
            </p>
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep(3)} disabled={submitting}>Voltar</Button>
              <Button onClick={goPay} disabled={submitting || deliveryBlocked} className="bg-primary hover:bg-primary-dark">
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {paymentMethod === "pix" ? "Gerando Pix..." : "Processando..."}</>
                  : (paymentMethod === "pix" ? "Gerar QR Code Pix" : `Pagar ${formatBRL(total)}`)}
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
