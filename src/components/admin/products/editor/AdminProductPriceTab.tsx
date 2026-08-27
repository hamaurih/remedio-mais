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
  const effectiveSite = positive(editing.site_promo_price) ?? positive(editing.site_price) ?? positive(editing.promo_price) ?? effectiveBase;
  const effectiveWhatsapp = positive(editing.whatsapp_promo_price) ?? positive(editing.whatsapp_price) ?? positive(editing.site_promo_price) ?? positive(editing.site_price) ?? positive(editing.promo_price) ?? effectiveBase;
  const fmt = (n: number | null) => n == null ? "—" : `R$ ${n.toFixed(2).replace(".", ",")}`;
  const channelsDiffer = effectiveSite != null && effectiveWhatsapp != null && effectiveSite !== effectiveWhatsapp;

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
            <span className="block text-xs text-muted-foreground">Protege a <strong>base de desconto (%)</strong>: se o sistema da farmácia mudar o preço normal, o preço promocional é recalculado mantendo o mesmo percentual. A oferta nunca é apagada pela sincronização.</span>
          </span>
        </label>
      </div>

      {editing.promo_price != null && Number(editing.promo_price) >= Number(editing.price || 0) && Number(editing.price || 0) > 0 && (
        <div className="text-xs rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-3">
          Promoção inconsistente: o preço promocional está maior ou igual ao preço normal. O desconto não aparece no site até você corrigir.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Preço normal (R$) *</Label><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing((prev: any) => ({ ...prev, price: e.target.value }))} /></div>
        <div className="space-y-1"><Label>Preço promocional (R$)</Label><Input type="number" step="0.01" value={editing.promo_price ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, promo_price: e.target.value || null }))} /></div>
        <div className="space-y-1">
          <Label>Desconto (%)</Label>
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
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-bold">Preços por canal</Label>
            <p className="text-xs text-muted-foreground">Defina preço específico para o site e para o WhatsApp/loja. Em branco = usa o preço normal acima.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!editing.use_channel_pricing} onCheckedChange={(v) => setEditing((prev: any) => ({ ...prev, use_channel_pricing: v }))} />
            <Label className="text-xs">Usar preço por canal</Label>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-secondary/40">
          <input type="checkbox" className="mt-0.5" checked={!!editing.lock_channel_discount} onChange={(e) => setEditing((prev: any) => ({ ...prev, lock_channel_discount: e.target.checked }))} />
          <span>
            <span className="font-medium">Travar desconto (%) por canal</span>
            <span className="block text-xs text-muted-foreground">Com a trava ativa, o que vale é o <strong>percentual</strong>: sempre que o preço normal mudar (inclusive pelo sistema da farmácia), os preços do site e do WhatsApp/loja são recalculados automaticamente com o mesmo desconto.</span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Preço base (Trier) R$</Label><Input type="number" step="0.01" value={editing.price_base ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, price_base: e.target.value || null }))} placeholder="ex: vindo da Trier" /></div>
          <div className="hidden sm:block" />
          <div className="space-y-1"><Label>Desconto do site (%)</Label><Input type="text" inputMode="decimal" placeholder="ex.: 10,5" value={editing.site_discount_percentage ?? ""} onChange={(e) => setChannelPct("site_discount_percentage", "site_price", e.target.value)} /></div>
          <div className="space-y-1"><Label>Preço do site R$</Label><Input type="number" step="0.01" value={editing.site_price ?? ""} onChange={(e) => setChannelPrice("site_discount_percentage", "site_price", e.target.value)} /></div>
          <div className="space-y-1"><Label>Desconto WhatsApp/loja (%)</Label><Input type="text" inputMode="decimal" placeholder="ex.: 15,25" value={editing.whatsapp_discount_percentage ?? ""} onChange={(e) => setChannelPct("whatsapp_discount_percentage", "whatsapp_price", e.target.value)} /></div>
          <div className="space-y-1"><Label>Preço WhatsApp/loja R$</Label><Input type="number" step="0.01" value={editing.whatsapp_price ?? ""} onChange={(e) => setChannelPrice("whatsapp_discount_percentage", "whatsapp_price", e.target.value)} /></div>
          <div className="space-y-1"><Label>Preço promo do site R$</Label><Input type="number" step="0.01" value={editing.site_promo_price ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, site_promo_price: e.target.value || null }))} /></div>
          <div className="space-y-1"><Label>Preço promo WhatsApp R$</Label><Input type="number" step="0.01" value={editing.whatsapp_promo_price ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, whatsapp_promo_price: e.target.value || null }))} /></div>
          <div className="col-span-2 space-y-1"><Label>Observação interna de preço</Label><Input value={editing.channel_price_notes || ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, channel_price_notes: e.target.value }))} placeholder="visível apenas no admin" /></div>
        </div>

        <div className="text-xs bg-secondary/40 border rounded p-2 space-y-1">
          <div>Preço usado no <strong>site</strong>: <span className="font-semibold">{fmt(effectiveSite)}</span></div>
          <div>Preço usado no <strong>WhatsApp/loja</strong>: <span className="font-semibold">{fmt(effectiveWhatsapp)}</span></div>
          {channelsDiffer && <div className="text-primary font-semibold">⚠ Este produto possui preço diferente para WhatsApp/loja.</div>}
        </div>
      </div>
    </div>
  );
}
