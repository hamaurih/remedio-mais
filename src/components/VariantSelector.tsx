import { useStorefrontTenant } from "@/hooks/useStorefrontTenant";
import { selectStorefrontRows, storefrontQueryKey } from "@/lib/storefrontQuery";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductVariant = {
  id: string;
  parent_product_id: string;
  trier_product_id: string | null;
  barcode: string | null;
  variation_type: string;
  variation_value: string;
  name: string | null;
  price: number | null;
  promo_price: number | null;
  stock: number;
  image_url: string | null;
  active: boolean;
  position: number;
};

export function useProductVariants(productId: string | undefined, enabled = true) {
  const storefront = useStorefrontTenant();
  return useQuery({
    queryKey: storefrontQueryKey(storefront, ["product-variants", productId]),
    queryFn: async () => {
      if (!productId) return [] as ProductVariant[];
      const { data } = await selectStorefrontRows("product_variants", "*", storefront)
        .eq("parent_product_id", productId)
        .eq("active", true)
        .order("position", { ascending: true });
      return (data || []) as ProductVariant[];
    },
    enabled: !!productId && enabled,
  });
}

type Props = {
  variants: ProductVariant[];
  selectedId: string | null;
  onSelect: (v: ProductVariant) => void;
  label?: string;
};

export function VariantSelector({ variants, selectedId, onSelect, label }: Props) {
  // Auto-select first in-stock variant if nothing selected
  useEffect(() => {
    if (!selectedId && variants.length) {
      const firstAvail = variants.find((v) => v.stock > 0) || variants[0];
      if (firstAvail) onSelect(firstAvail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants.length]);

  if (!variants.length) return null;
  const type = variants[0]?.variation_type || "tamanho";
  const heading = label || `Selecione o ${type}`;

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{heading}</div>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const out = v.stock <= 0;
          const selected = v.id === selectedId;
          return (
            <button
              key={v.id}
              type="button"
              disabled={out}
              onClick={() => onSelect(v)}
              className={[
                "px-3 h-10 min-w-[56px] rounded-full border-2 text-sm font-bold transition-all",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary/60",
                out ? "opacity-40 line-through cursor-not-allowed" : "",
              ].join(" ")}
              title={out ? "Sem estoque" : v.variation_value}
            >
              {v.variation_value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function buildVariantLabel(v: ProductVariant) {
  const t = (v.variation_type || "tamanho").trim();
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return `${cap}: ${v.variation_value}`;
}
