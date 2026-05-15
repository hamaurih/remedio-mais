import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { addToCart, buildWhatsAppLink, formatBRL } from "@/lib/store";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { ShoppingCart, MessageCircle, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function Product() {
  const { slug } = useParams<{ slug: string }>();
  const { data: settings } = useStoreSettings();
  const { data: p, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("slug", slug!).eq("active", true).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  if (isLoading) return <Layout><div className="container py-20 text-center">Carregando...</div></Layout>;
  if (!p) return <Layout><div className="container py-20 text-center">Produto não encontrado.</div></Layout>;

  const finalPrice = p.promo_price ?? p.price;
  const hasDiscount = !!p.promo_price && p.promo_price < p.price;
  const wa = buildWhatsAppLink(settings?.whatsapp || "5583999286000", `Olá! Quero comprar: *${p.name}* (${formatBRL(finalPrice)}).`);

  const handleAdd = () => {
    if (p.controlled) { toast.error("Medicamento controlado. Envie sua receita."); return; }
    addToCart({ id: p.id, name: p.name, price: finalPrice, image_url: p.image_url });
    toast.success("Adicionado ao carrinho");
  };

  return (
    <Layout>
      <div className="container py-6">
        <nav className="text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:text-primary">Início</Link> / <span>{p.name}</span>
        </nav>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-secondary/40 rounded-2xl p-8 flex items-center justify-center">
            <img src={p.image_url || productPlaceholder} alt={p.name} className="max-h-[420px] object-contain" />
          </div>
          <div>
            {p.manufacturer && <div className="text-sm text-muted-foreground">{p.manufacturer}</div>}
            <h1 className="text-2xl md:text-3xl font-extrabold mt-1">{p.name}</h1>

            {p.requires_prescription && (
              <div className="mt-3 inline-flex items-center gap-2 bg-accent text-accent-foreground text-xs font-semibold px-3 py-1.5 rounded-full">
                <AlertCircle className="h-3.5 w-3.5" /> Venda sujeita à apresentação e conferência da receita
              </div>
            )}

            <div className="mt-5">
              {hasDiscount && <div className="text-muted-foreground line-through">{formatBRL(p.price)}</div>}
              <div className="text-4xl price">{formatBRL(finalPrice)}</div>
              <div className="text-sm text-muted-foreground mt-1">Retire na loja ou peça pelo WhatsApp</div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {p.controlled ? (
                <Button asChild size="lg"><Link to="/enviar-receita"><FileText className="h-5 w-5 mr-2" /> Enviar receita para análise</Link></Button>
              ) : (
                <>
                  <Button size="lg" onClick={handleAdd}><ShoppingCart className="h-5 w-5 mr-2" /> Adicionar ao carrinho</Button>
                  <Button asChild size="lg" variant="outline" className="border-whatsapp text-whatsapp hover:bg-whatsapp hover:text-whatsapp-foreground">
                    <a href={wa} target="_blank" rel="noopener"><MessageCircle className="h-5 w-5 mr-2" /> Comprar pelo WhatsApp</a>
                  </Button>
                </>
              )}
            </div>

            {p.description && (
              <div className="mt-8">
                <h2 className="font-semibold mb-2">Descrição</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{p.description}</p>
              </div>
            )}

            <div className="mt-6 text-xs text-muted-foreground border-t pt-4">
              As informações são meramente informativas. Consulte o farmacêutico em caso de dúvidas.
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
