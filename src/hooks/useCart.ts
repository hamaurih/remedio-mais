import { useEffect, useState } from "react";
import { CartItem, getCart, isCartItemPayable, onCartChange } from "@/lib/store";

function cartForCurrentRoute() {
  const items = getCart();
  // Checkout must never receive blocked prescription lines. They remain in
  // localStorage and reappear normally when the customer returns to the cart.
  if (window.location.pathname === "/checkout") return items.filter(isCartItemPayable);
  return items;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => cartForCurrentRoute());
  useEffect(() => onCartChange(() => setItems(cartForCurrentRoute())), []);
  return items;
}
