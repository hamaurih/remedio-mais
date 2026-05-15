import { useEffect, useState } from "react";
import { CartItem, getCart, onCartChange } from "@/lib/store";

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => getCart());
  useEffect(() => onCartChange(() => setItems(getCart())), []);
  return items;
}
