import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { addToCart, formatBRL } from "@/lib/store";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { ShoppingCart, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useProductVariants, VariantSelector, buildVariantLabel, type ProductVariant } from "@/components/VariantSelector";
import { useRelatedProducts } from "@/hooks/useRelatedProducts";
import { ProductShelf } from "@/components/ProductShelf";
import { openGenericCheck } from "@/lib/genericSuggestion";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/productSelect";

export default function Product() {
  const { slug } = useParams<{ slug: string }>();
  const { data: _settings } = useStoreSettings();
  const { data: p, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data } = await (supabase as any).from("products").select(PUBLIC_PRODUCT_SELECT).eq("slug", slug!).eq("active", true).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  const { data: variants = [] } = useProductVariants(p?.id, !!p?.id && (p as any)?.has_variants);
  const { data: related = [], isLoading: relatedLoading } = useRelatedProducts(p);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const selectedVariant: ProductVariant | undefined = useMemo(
    () => variants.find((v) => v.id === selectedVariantId),
    [variants, selectedVariantId],
  );

  if (isLoading) return <Layout><div className="container py-20 text-center">Carregando...</div></Layout>;
  if (!p) return <Layout><div className="container py-20 text-center">Produto não encontrado.</div></Layout>;

  const hasVariants = !!(p as any).has_variants && variants.length > 0;
  const basePrice = hasVariants && selectedVariant ? (selectedVariant.price ?? p.price) : p.price;
  const basePromo = hasVariants && selectedVariant ? selectedVariant.promo_price : (p as any).promo_price;
  const finalPrice = basePromo ?? basePrice;
  const hasDiscount = !!basePromo && basePromo < basePrice;
  const displayImage = (hasVariants && selectedVariant?.image_url) || p.image_url || productPlaceholder;
  const variantStock = hasVariants ? (selectedVariant?.stock ?? 0) : ((p as any).stock ?? 0);
  const outOfStock = variantStock <= 0;

  const handleAdd = () => {
    if ((p as any).controlled) { toast.error("Medicamento controlado. Envie sua receita."); return; }
    if (hasVariants && !selectedVariant) { toast.error("Selecione uma opção"); return; }
    if (outOfStock) { toast.error("Sem estoque para esta opção"); return; }

    const doAdd = () => {
      if (hasVariants && selectedVariant) {
        addToCart({
          id: selectedVariant.id,
          product_id: p.id,
          variant_id: selectedVariant.id,
          variant_label: buildVariantLabel(selectedVariant),
          name: p.name,
          price: Number(finalPrice),
          image_url: displayImage,
        });
      } else {
        addToCart({ id: p.id, product_id: p.id, name: p.name, price: Number(finalPrice), image_url: p.image_url });
      }
      toast.success("Adicionado ao carrinho");
    };

    // Se for variação, pula a checagem de genérico (variação é específica)
    if (hasVariants) { doAdd(); return; }
    openGenericCheck({
      product: { ...(p as any), id: p.id, name: p.name, slug: p.slug, price: p.price, promo_price: (p as any).promo_price, image_url: p.image_url, manufacturer: (p as any).manufacturer, on_sale: (p as any).on_sale, requires_prescription: (p as any).requires_prescription, controlled: (p as any).controlled, has_variants: (p as any).has_variants },
      onAddOriginal: doAdd,
    });
  };

  return (
    <Layout>
      <div className="container py-6">
        <nav className="text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:text-primary">Início</Link> / <span>{p.name}</span>
        </nav>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-secondary/40 rounded-2xl p-8 flex items-center justify-center">
            <img src={displayImage} alt={p.name} className="max-h-[420px] object-contain" />
          </div>
          <div>
            {(p as any).manufacturer && <div className="text-sm text-muted-foreground">{(p as any).manufacturer}</div>}
            <h1 className="text-2xl md:text-3xl font-extrabold mt-1">{p.name}</h1>

            {(p as any).requires_prescription && (
              <div className="mt-3 inline-flex items-center gap-2 bg-accent text-accent-foreground text-xs font-semibold px-3 py-1.5 rounded-full">
                <AlertCircle className="h-3.5 w-3.5" /> Venda sujeita à apresentação e conferência da receita
              </div>
            )}

            {hasVariants && (
              <div className="mt-5">
                <VariantSelector
                  variants={variants}
                  selectedId={selectedVariantId}
                  onSelect={(v) => setSelectedVariantId(v.id)}
                />
                {selectedVariant && (
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                    <div>
                      {selectedVariant.stock > 0
                        ? <>Em estoque: <strong>{selectedVariant.stock}</strong> un.</>
                        : <span className="text-primary font-semibold">Sem estoque nesta opção</span>}
                      {selectedVariant.trier_product_id && <> · Cód.: {selectedVariant.trier_product_id}</>}
                    </div>
                    {selectedVariant.barcode && <div>EAN: <strong>{selectedVariant.barcode}</strong></div>}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5">
              {hasDiscount && <div className="text-muted-foreground line-through">{formatBRL(basePrice)}</div>}
              <div className="text-4xl price">{formatBRL(Number(finalPrice))}</div>
              <div className="text-sm text-muted-foreground mt-1">Retire na loja ou receba em casa</div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {(p as any).controlled ? (
                <Button asChild size="lg"><Link to="/enviar-receita"><FileText className="h-5 w-5 mr-2" /> Enviar receita para análise</Link></Button>
              ) : (
                <Button size="lg" onClick={handleAdd} disabled={outOfStock}>
                  <ShoppingCart className="h-5 w-5 mr-2" /> {outOfStock ? "Indisponível" : "Adicionar ao carrinho"}
                </Button>
              )}
            </div>

            {(p as any).description && (
              <div className="mt-8">
                <h2 className="font-semibold mb-2">Descrição</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{(p as any).description}</p>
              </div>
            )}

            <div className="mt-6 text-xs text-muted-foreground border-t pt-4">
              As informações são meramente informativas. Consulte o farmacêutico em caso de dúvidas.
            </div>
          </div>
        </div>
      </div>

      {(related.length > 0 || relatedLoading) && (
        <ProductShelf
          title="Produtos relacionados"
          subtitle="Você também pode se interessar"
          products={related}
          loading={relatedLoading}
          backgroundVariant="light"
        />
      )}
    </Layout>
  );
}
