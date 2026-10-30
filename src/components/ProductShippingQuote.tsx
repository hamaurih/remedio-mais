import { FormEvent, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lookupCep, onlyDigits, formatCep } from "@/lib/addressLookup";
import { formatBRL } from "@/lib/store";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Quote = {
  mode: "flat" | "distance" | null;
  allowed: boolean;
  fee: number | null;
  distanceKm: number | null;
  zone: string | null;
  message: string;
  cityLine: string;
};

export function ProductShippingQuote() {
  const { data: settings } = useStoreSettings();
  const [cep, setCep] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const digits = onlyDigits(cep);
    if (digits.length !== 8) {
      setQuote(null);
      setError("Informe um CEP com 8 números.");
      return;
    }
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const address = await lookupCep(digits);
      if (!address) {
        setError("Não encontramos esse CEP.");
        return;
      }
      const cityLine = [address.street, address.neighborhood, address.city, address.state].filter(Boolean).join(", ");
      const full = [address.street, address.neighborhood, address.city && address.state ? `${address.city}-${address.state}` : address.city, digits]
        .filter(Boolean)
        .join(", ");
      const { data, error: invokeError } = await supabase.functions.invoke("calculate-delivery-fee", {
        body: { address: full },
      });
      if (invokeError || !data?.ok) {
        setError(data?.message || data?.error || "Não foi possível calcular o frete para este CEP.");
        return;
      }
      setQuote({
        mode: data.mode === "flat" || data.mode === "distance" ? data.mode : null,
        allowed: !!data.allowed,
        fee: typeof data.fee === "number" ? data.fee : null,
        distanceKm: typeof data.distance_km === "number" ? data.distance_km : null,
        zone: data.zone_label || null,
        message: data.message || "",
        cityLine,
      });
    } catch {
      setError("Não foi possível consultar o frete agora.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="frete-produto" data-testid="product-shipping" className="mt-6 rounded-xl border p-4">
      <h2 id="frete-produto" className="font-semibold flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary" /> Entrega e retirada
      </h2>
      <p className="text-xs text-muted-foreground mt-1">
        A taxa usa a mesma regra do checkout. O prazo não é calculado nesta página.
        {settings?.address ? ` Retirada na loja: ${settings.address}.` : ""}
      </p>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="space-y-1 flex-1">
          <Label htmlFor="product-cep">CEP</Label>
          <Input
            id="product-cep"
            inputMode="numeric"
            autoComplete="postal-code"
            value={formatCep(cep)}
            onChange={(event) => setCep(onlyDigits(event.target.value).slice(0, 8))}
            placeholder="00000-000"
            aria-describedby="product-cep-help"
          />
        </div>
        <Button type="submit" variant="outline" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calcular frete"}
        </Button>
      </form>
      <p id="product-cep-help" className="text-[11px] text-muted-foreground mt-1">Usamos o CEP só para consultar a taxa já configurada na loja.</p>
      {error && <p className="text-sm text-destructive mt-2" role="alert">{error}</p>}
      {quote && (
        <div className="mt-3 text-sm space-y-1" data-testid="product-shipping-result">
          {quote.cityLine && <p className="text-muted-foreground">{quote.cityLine}</p>}
          {quote.mode === "flat" && (
            <p>
              Taxa fixa da loja: <strong>{quote.fee != null ? formatBRL(quote.fee) : "não informada"}</strong>.
              Esse valor não confirma se o CEP está na área de entrega.
            </p>
          )}
          {quote.mode === "distance" && quote.allowed && (
            <p>
              Frete para este CEP: <strong>{quote.fee != null ? formatBRL(quote.fee) : "não informado"}</strong>
              {quote.zone ? ` · ${quote.zone}` : ""}
              {quote.distanceKm != null ? ` · ${quote.distanceKm} km` : ""}.
            </p>
          )}
          {quote.mode === "distance" && !quote.allowed && (
            <p>{quote.message || "Este CEP está fora da área de entrega."}</p>
          )}
          <p className="text-xs text-muted-foreground">Sem prazo estimado. A farmácia confirma a entrega na finalização do pedido.</p>
        </div>
      )}
    </section>
  );
}
