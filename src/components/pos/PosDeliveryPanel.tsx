import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, PackageCheck, Truck, X } from "lucide-react";
import { toast } from "sonner";
import {
  PosDeliveryAddress,
  PosDeliveryQuote,
  brl,
  posQuoteDelivery,
} from "@/lib/pos";

type Props = {
  storeId: string;
  applied: PosDeliveryQuote | null;
  onApply: (quote: PosDeliveryQuote) => void;
  onRemove: () => void;
  disabled?: boolean;
};

const INITIAL_ADDRESS: PosDeliveryAddress = {
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "Campina Grande",
  state: "PB",
  reference: "",
};

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function PosDeliveryPanel({ storeId, applied, onApply, onRemove, disabled }: Props) {
  const [address, setAddress] = useState<PosDeliveryAddress>(INITIAL_ADDRESS);
  const [preview, setPreview] = useState<PosDeliveryQuote | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof PosDeliveryAddress>(key: K, value: PosDeliveryAddress[K]) {
    setAddress((prev) => ({ ...prev, [key]: value }));
    setPreview(null);
    if (applied) onRemove();
  }

  async function calculate() {
    const required = [address.street, address.number, address.neighborhood, address.city, address.state];
    if (required.some((v) => !String(v || "").trim())) {
      toast.error("Informe rua, número, bairro, cidade e UF.");
      return;
    }
    setLoading(true);
    try {
      const quote = await posQuoteDelivery(address, storeId);
      setPreview(quote);
      if (!quote.allowed) {
        onRemove();
        toast.error(quote.message || "Endereço fora da área de entrega.");
      }
    } catch (error: any) {
      setPreview(null);
      onRemove();
      toast.error(error?.message || "Não foi possível calcular o frete.");
    } finally {
      setLoading(false);
    }
  }

  function applyQuote() {
    if (!preview?.allowed || !preview.quote_id || preview.fee == null) return;
    onApply(preview);
    toast.success(`Frete de ${brl(preview.fee)} adicionado à venda.`);
  }

  const active = applied?.quote_id && applied.quote_id === preview?.quote_id;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-bold">
            <Truck className="h-4 w-4" /> Simular entrega
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Calcula pela mesma regra de frete usada no site.
          </p>
        </div>
        {applied && <Badge variant="secondary">Frete adicionado</Badge>}
      </div>

      <div className="grid grid-cols-[1fr_110px] gap-2">
        <div className="space-y-1">
          <Label htmlFor="pos-delivery-street">Rua / avenida</Label>
          <Input
            id="pos-delivery-street"
            value={address.street}
            onChange={(e) => update("street", e.target.value)}
            placeholder="Ex.: Rua João Pessoa"
            disabled={disabled || loading}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pos-delivery-number">Número</Label>
          <Input
            id="pos-delivery-number"
            value={address.number}
            onChange={(e) => update("number", e.target.value)}
            placeholder="123"
            disabled={disabled || loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="pos-delivery-neighborhood">Bairro</Label>
          <Input
            id="pos-delivery-neighborhood"
            value={address.neighborhood}
            onChange={(e) => update("neighborhood", e.target.value)}
            placeholder="Bairro"
            disabled={disabled || loading}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pos-delivery-cep">CEP</Label>
          <Input
            id="pos-delivery-cep"
            inputMode="numeric"
            value={formatCep(address.cep || "")}
            onChange={(e) => update("cep", e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="58400-000"
            disabled={disabled || loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_72px] gap-2">
        <div className="space-y-1">
          <Label htmlFor="pos-delivery-city">Cidade</Label>
          <Input
            id="pos-delivery-city"
            value={address.city}
            onChange={(e) => update("city", e.target.value)}
            disabled={disabled || loading}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pos-delivery-state">UF</Label>
          <Input
            id="pos-delivery-state"
            value={address.state}
            maxLength={2}
            onChange={(e) => update("state", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
            disabled={disabled || loading}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="pos-delivery-complement">Complemento / referência (opcional)</Label>
        <Input
          id="pos-delivery-complement"
          value={address.complement || ""}
          onChange={(e) => update("complement", e.target.value)}
          placeholder="Apto, bloco, ponto de referência"
          disabled={disabled || loading}
        />
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={calculate} disabled={disabled || loading}>
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
        {loading ? "Calculando..." : "Calcular frete"}
      </Button>

      {preview && (
        <div className={`rounded-md border p-3 text-sm space-y-1 ${preview.allowed ? "bg-muted/40" : "border-destructive/40"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Área atendida</span>
            <Badge variant={preview.allowed ? "secondary" : "destructive"}>{preview.allowed ? "Sim" : "Não"}</Badge>
          </div>
          {preview.distance_km != null && (
            <div className="flex justify-between gap-2"><span>Distância</span><strong>{Number(preview.distance_km).toFixed(1)} km</strong></div>
          )}
          {preview.zone_label && (
            <div className="flex justify-between gap-2"><span>Faixa</span><span className="text-right">{preview.zone_label}</span></div>
          )}
          {preview.allowed && preview.fee != null && (
            <div className="flex justify-between gap-2 text-base"><span>Taxa de entrega</span><strong>{brl(preview.fee)}</strong></div>
          )}
          {!preview.allowed && <p className="text-destructive text-xs pt-1">{preview.message || "Endereço fora da área de entrega."}</p>}
          {preview.distance_source === "haversine" && (
            <p className="text-xs text-muted-foreground pt-1">Distância estimada geograficamente porque a rota viária não estava disponível.</p>
          )}
        </div>
      )}

      {preview?.allowed && preview.quote_id && preview.fee != null && (
        active ? (
          <Button type="button" variant="outline" className="w-full" onClick={onRemove} disabled={disabled}>
            <X className="h-4 w-4 mr-2" /> Remover frete da venda
          </Button>
        ) : (
          <Button type="button" className="w-full" onClick={applyQuote} disabled={disabled}>
            <PackageCheck className="h-4 w-4 mr-2" /> Adicionar {brl(preview.fee)} à venda
          </Button>
        )
      )}

      {applied && !active && (
        <div className="rounded-md border p-2 text-xs">
          Entrega ativa: <strong>{brl(Number(applied.fee || 0))}</strong> · {applied.distance_km != null ? `${Number(applied.distance_km).toFixed(1)} km` : "taxa fixa"}
        </div>
      )}
    </Card>
  );
}
