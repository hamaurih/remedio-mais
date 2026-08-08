import { toast } from "sonner";
import { liveCheckProductsDetailed } from "@/lib/liveStock";
import { formatBRL, getCart, removeFromCart, updateItemPrice, updateQty } from "@/lib/store";

/**
 * Confere estoque e preço na farmácia (Trier) logo depois de adicionar ao carrinho
 * e avisa o cliente na hora — assim ele não descobre a mudança só no pagamento.
 * Produtos com variação são ignorados (a variação tem preço/estoque próprios).
 */
export async function notifyCartAddition(lineId: string, productId: string, variantId?: string | null) {
  if (variantId) return;
  const line = getCart().find((i) => i.id === lineId);
  if (!line) return;

  const res = await liveCheckProductsDetailed([productId]);
  const live = res.items.find((l) => l.product_id === productId);
  if (!live || !live.fresh) return;

  const current = getCart().find((i) => i.id === lineId);
  if (!current) return;

  if (!live.active || live.stock <= 0) {
    removeFromCart(lineId);
    toast.error(`${current.name} está sem estoque agora`, {
      description: "O item foi retirado do carrinho.",
      duration: 8000,
    });
    return;
  }

  if (live.stock < current.quantity) {
    updateQty(lineId, live.stock);
    toast.warning(`Restam apenas ${live.stock} unidade(s) de ${current.name}`, {
      description: "Ajustamos a quantidade no seu carrinho.",
      duration: 8000,
    });
  }

  if (live.price > 0 && Math.abs(live.price - current.price) >= 0.01) {
    const up = live.price > current.price;
    updateItemPrice(lineId, live.price);
    toast.warning(`Preço de ${current.name} ${up ? "aumentou" : "baixou"}`, {
      description: `De ${formatBRL(current.price)} para ${formatBRL(live.price)}. O carrinho já foi atualizado.`,
      duration: 8000,
    });
  }
}
