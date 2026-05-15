import { Layout } from "@/components/Layout";
import { useCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { buildWhatsAppLink, cartTotal, clearCart, formatBRL, removeFromCart, updateQty } from "@/lib/store";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import productPlaceholder from "@/assets/product-placeholder.jpg";
import { Minus, Plus, Trash2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";

const schema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  phone: z.string().trim().min(8, "Informe seu telefone").max(20),
  address: z.string().trim().max(300).optional(),
  delivery: z.enum(["pickup", "delivery"]),
});

export default function Cart() {
  const items = useCart();
  const total = cartTotal(items);
  const { data: settings } = useStoreSettings();
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("pickup");
  const [submitting, setSubmitting] = useState(false);

  const checkout = async () => {
    const parsed = schema.safeParse({ name, phone, address, delivery });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (delivery === "delivery" && !address.trim()) {
      toast.error("Informe o endereço de entrega"); return;
    }
    if (items.length === 0) { toast.error("Carrinho vazio"); return; }

    setSubmitting(true);
    try {
      const { data: order, error } = await supabase.from("orders").insert({
        customer_name: name, customer_phone: phone, customer_address: address || null,
        delivery_method: delivery, total, status: "novo",
      }).select().single();
      if (error) throw error;
      const itemRows = items.map((i) => ({
        order_id: order.id, product_id: i.id, product_name: i.name, unit_price: i.price, quantity: i.quantity,
      }));
      await supabase.from("order_items").insert(itemRows);

      const lines = items.map((i) => `• ${i.quantity}x ${i.name} - ${formatBRL(i.price * i.quantity)}`).join("\n");
      const msg = `*Novo pedido - Atacadão dos Medicamentos*\n\n*Cliente:* ${name}\n*Telefone:* ${phone}\n*Entrega:* ${delivery === "pickup" ? "Retirar na loja" : `Entrega - ${address}`}\n\n*Itens:*\n${lines}\n\n*Total estimado:* ${formatBRL(total)}`;
      const wa = buildWhatsAppLink(settings?.whatsapp || "5583999286000", msg);
      clearCart();
      window.open(wa, "_blank");
      toast.success("Pedido enviado! Continue no WhatsApp.");
      nav("/");
    } catch (e: any) {
      toast.error("Erro ao registrar pedido. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="container py-8">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-6">Seu carrinho</h1>
        {items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">Seu carrinho está vazio.</p>
            <Button asChild><Link to="/">Continuar comprando</Link></Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-3">
              {items.map((i) => (
                <div key={i.id} className="bg-card border rounded-xl p-3 flex gap-3 items-center shadow-card">
                  <img src={i.image_url || productPlaceholder} alt={i.name} className="w-16 h-16 object-contain bg-secondary/40 rounded-lg" />
                  <div className="flex-1">
                    <div className="font-medium text-sm line-clamp-2">{i.name}</div>
                    <div className="text-primary font-bold mt-1">{formatBRL(i.price)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(i.id, i.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-8 text-center font-semibold">{i.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(i.id, i.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeFromCart(i.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                </div>
              ))}
            </div>

            <aside className="bg-card border rounded-xl p-5 h-fit shadow-card space-y-4">
              <div className="flex justify-between text-lg">
                <span>Subtotal</span>
                <span className="font-extrabold price">{formatBRL(total)}</span>
              </div>

              <div className="space-y-2">
                <Label>Entrega</Label>
                <RadioGroup value={delivery} onValueChange={(v) => setDelivery(v as any)}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="pickup" id="pu" /><Label htmlFor="pu" className="cursor-pointer">Retirar na loja</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="delivery" id="dl" /><Label htmlFor="dl" className="cursor-pointer">Entrega local</Label></div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="(83) 99999-9999" />
              </div>
              {delivery === "delivery" && (
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
                </div>
              )}

              <Button className="w-full bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90" size="lg" onClick={checkout} disabled={submitting}>
                <MessageCircle className="h-5 w-5 mr-2" /> Finalizar pelo WhatsApp
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">O pagamento e a confirmação final são feitos pelo WhatsApp.</p>
            </aside>
          </div>
        )}
      </div>
    </Layout>
  );
}
