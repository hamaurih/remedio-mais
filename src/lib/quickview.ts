// Quick view event bus
import type { Product } from "@/components/ProductCard";

const EVENT = "atacadao:quickview";

export function openQuickView(product: Product) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: product }));
}

export function onQuickView(cb: (p: Product) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
