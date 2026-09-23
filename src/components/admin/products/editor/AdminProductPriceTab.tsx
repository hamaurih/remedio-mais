import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = {
  editing: any;
  setEditing: Dispatch<SetStateAction<any>>;
};

export function AdminProductPriceTab({ editing, setEditing }: Props) {
  const [pctInput, setPctInput] = useState<string | null>(null);

  const discountPct = useMemo(() => {
    const price = Number(editing.price);
    const promo = Number(editing.promo_price);
    if (!price || !promo || promo >= price) return 0;
    return Number(((1 - promo / price) * 100).toFixed(2));
  }, [editing.price, editing.promo_price]);

  const base = Number(editing.price_base || editing.price || 0);

  const setChannelPct = (pctField: string, priceField: string, raw: string) => {
    if (!raw) {
      setEditing((prev: any) => ({ ...prev, [pctField]: null }));
      return;
    }
    const pct = Number(raw.replace(",", "."));
    setEditing((prev: any) => {
      const next: any = { ...prev, [pctField]: raw.replace(",", ".") };
      if (base > 0 && pct > 0 && pct < 100) next[priceField] = +(base * (1 - pct / 100)).toFixed(2);
      return next;
    });
  };

  const setChannelPrice = (pctField: string, priceField: string, raw: string) => {
    const val = Number(raw);
    setEditing((prev: any) => {
      const next: any = { ...prev, [priceField]: raw || null };
      if (base > 0 && val > 0 && val < base) next[pctField] = +((1 - val / base) * 100).toFixed(2);
      else if (!raw) next[pctField] = null;
      return next;
    });
  };

  const positive = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const effectiveBase = positive(editing.price_base) ?? positive(editing.price);
  const globalPromo = positive(editing.promo_price);
  const effectiveSite = positive(editing.site_promo_price) ?? positive(editing.site_price) ?? globalPromo ?? effectiveBase;
  const effectiveWhatsapp = positive(editing.whatsapp_promo_price) ?? positive(editing.whatsapp_price) ?? globalPromo ?? effectiveBase;
  const effectivePdv = positive(editing.pdv_promo_price) ?? positive(editing.pdv_price) ?? globalPromo ?? effectiveBase;
  const fmt = (n: number | null) => n == null ? "—" : `R$ ${n.toFixed(2).replace(".", ",")}`;
  const effectiveValues = [effectiveSite, effectiveWhatsapp, effectivePdv].filter((v): v is number => v != null);
  const channelsDiffer = new Set(effectiveValues.map((v) => v.toFixed(2))).size > 1;

  const ChannelCard = ({
    title,
    subtitle,
    pctField,
    priceField,
    promoField,
  }: {
    title: string;
    subtitle: string;
    pctField: string;
    priceField: string;
    promoField: string;
  }) => (
    <div className="rounded-lg border p-3 space-y-3 bg-card">
      <div>
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      <div className="space-y-1">
        <Label>Desconto (%)</Label>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="ex.: 10,5"
          value={editing[pctField] ?? ""}
          onChange={(e) => setChannelPct(pctField, priceField, e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Preço R$</Label>
        <Input
          type="number"
          step="0.01"
          value={editing[priceField] ?? ""}
          onChange={(e) => setChannelPrice(pctField, priceField, e.target.value)}
          placeholder="usa o preço normal se vazio"
        />
      </div>
      <div className="space-y-1">
        <Label>Preço promocional R$</Label>
        <Input
          type="number"
          step="0.01"
          value={editing[promoField] ?? ""}
          onChange={(e) => setEditing((prev: any) => ({ ...prev, [promoField]: e.target.value || null }))}
          placeholder="usa a promoção geral se vazio"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-3 pt-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-secondary/40">
          <input type="checkbox" className="mt-0.5" checked={!!editing.lock_base_price} onChange={(e) => setEditing((prev: any) => ({ ...prev, lock_base_price: e.target.checked }))} />
          <span>
            <span className="font-medium">Travar preço normal</span>
            <span className="block text-xs text-muted-foreground">Impede o sistema da farmácia de atualizar o preço normal. Deixe desmarcado para manter o preço sempre sincronizado.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-secondary/40">
          <input type="checkbox" className="mt-0.5" checked={editing.promo_price != null ? true : !!editing.lock_promotion} disabled={editing.promo_price != null} onChange={(e) => setEditing((prev: any) => ({ ...prev, lock_promotion: e.target.checked }))} />
          <span>
            <span className="font-medium">Proteger promoção</span>
            <span className="block text-xs text-muted-foreground">Protege a <strong>base de desconto (%)</strong>: se o sistema da farmácia mudar o preço normal, o preço promocional é recalculado mantendo o mesmo percentual.</span>
          </span>
        </label>
      </div>

      {editing.promo_price != null && Number(editing.promo_price) >= Number(editing.price || 0) && Number(editing.price || 0) > 0 && (
        <div className="text-xs rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-3">
          Promoção inconsistente: o preço promocional está maior ou igual ao preço normal.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Preço normal (R$) *</Label><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing((prev: any) => ({ ...prev, price: e.target.value }))} /></div>
        <div className="space-y-1"><Label>Preço promocional geral (R$)</Label><Input type="number" step="0.01" value={editing.promo_price ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, promo_price: e.target.value || null }))} /></div>
        <div className="space-y-1">
          <Label>Desconto geral (%)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="ex.: 14,5"
            value={pctInput ?? (discountPct ? String(discountPct).replace(".", ",") : "")}
            onChange={(e) => {
              const raw = e.target.value;
              setPctInput(raw);
              const pct = Number(raw.replace(",", "."));
              const price = Number(editing.price);
              if (!raw.trim()) setEditing((prev: any) => ({ ...prev, promo_price: null }));
              else if (!Number.isNaN(pct) && pct > 0 && pct < 100 && price > 0) {
                const promo = +(price * (1 - pct / 100)).toFixed(2);
                setEditing((prev: any) => ({ ...prev, promo_price: promo, on_sale: true }));
              }
            }}
            onBlur={() => setPctInput(null)}
          />
          <p className="text-[11px] text-muted-foreground">Aceita casas decimais (ex.: 14,5% ou 14,25%).</p>
        </div>
        <div className="flex items-center gap-2 mt-6"><Switch checked={!!editing.on_sale} onCheckedChange={(v) => setEditing((prev: any) => ({ ...prev, on_sale: v }))} /><Label>Em promoção</Label></div>
        <div className="space-y-1"><Label>Início da promoção</Label><Input type="datetime-local" value={editing.promotion_start?.slice(0, 16) || ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, promotion_start: e.target.value || null }))} /></div>
        <div className="space-y-1"><Label>Fim da promoção</Label><Input type="datetime-local" value={editing.promotion_end?.slice(0, 16) || ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, promotion_end: e.target.value || null }))} /></div>
        <div className="space-y-1"><Label>Desconto Pix do produto (%)</Label><Input type="number" step="0.01" min="0" max="100" value={editing.pix_discount_percentage ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, pix_discount_percentage: e.target.value || null }))} placeholder="usa o global se vazio" /></div>
        <div className="space-y-1"><Label>Limite por carrinho</Label><Input type="number" min="1" value={editing.cart_quantity_limit ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, cart_quantity_limit: e.target.value || null }))} placeholder="sem limite" /></div>
      </div>

      <div className="border-t pt-4 mt-2 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="font-bold">Preços por canal</Label>
            <p className="text-xs text-muted-foreground">Site, IA/WhatsApp e Balcão/PDV são independentes. Campo vazio = usa o preço normal ou a promoção geral.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch checked={!!editing.use_channel_pricing} onCheckedChange={(v) => setEditing((prev: any) => ({ ...prev, use_channel_pricing: v }))} />
            <Label className="text-xs">Usar preço por canal</Label>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-secondary/40">
          <input type="checkbox" className="mt-0.5" checked={!!editing.lock_channel_discount} onChange={(e) => setEditing((prev: any) => ({ ...prev, lock_channel_discount: e.target.checked }))} />
          <span>
            <span className="font-medium">Travar desconto (%) por canal</span>
            <span className="block text-xs text-muted-foreground">Com a trava ativa, quando o Trier mudar o preço-base, os preços de Site, IA/WhatsApp e Balcão/PDV são recalculados mantendo o percentual definido em cada canal.</span>
          </span>
        </label>

        <div className="space-y-1 max-w-sm">
          <Label>Preço base (Trier) R$</Label>
          <Input type="number" step="0.01" value={editing.price_base ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, price_base: e.target.value || null }))} placeholder="vindo do Trier" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ChannelCard title="Site" subtitle="Preço exibido no e-commerce." pctField="site_discount_percentage" priceField="site_price" promoField="site_promo_price" />
          <ChannelCard title="IA / WhatsApp" subtitle="Preço informado e vendido pelo agente." pctField="whatsapp_discount_percentage" priceField="whatsapp_price" promoField="whatsapp_promo_price" />
          <ChannelCard title="Balcão / PDV" subtitle="Preço cobrado na venda presencial." pctField="pdv_discount_percentage" priceField="pdv_price" promoField="pdv_promo_price" />
        </div>

        <div className="space-y-1">
          <Label>Observação interna de preço</Label>
          <Input value={editing.channel_price_notes || ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, channel_price_notes: e.target.value }))} placeholder="visível apenas no admin" />
        </div>

        <div className="text-xs bg-secondary/40 border rounded p-3 grid gap-1 sm:grid-cols-3">
          <div>Site: <strong>{fmt(effectiveSite)}</strong></div>
          <div>IA/WhatsApp: <strong>{fmt(effectiveWhatsapp)}</strong></div>
          <div>Balcão/PDV: <strong>{fmt(effectivePdv)}</strong></div>
          {channelsDiffer && <div className="sm:col-span-3 text-primary font-semibold">Preços diferentes por canal estão ativos para este produto.</div>}
        </div>
      </div>
    </div>
  );
}
