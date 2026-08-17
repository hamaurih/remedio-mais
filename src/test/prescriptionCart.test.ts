import { beforeEach, describe, expect, it } from "vitest";
import {
  addToCart,
  attachPrescriptionToCart,
  getCart,
  isCartItemPayable,
  removeCartItems,
  updateCartPrescriptionStatuses,
} from "@/lib/store";

describe("prescription cart flow", () => {
  beforeEach(() => localStorage.clear());

  it("keeps a pending prescription item out of payment", () => {
    addToCart({
      id: "rx-product",
      product_id: "rx-product",
      name: "Medicamento sujeito a receita",
      price: 20,
      requires_prescription: true,
      prescription_status: "not_sent",
    });

    expect(isCartItemPayable(getCart()[0])).toBe(false);
  });

  it("releases the item after the linked prescription is approved", () => {
    addToCart({
      id: "rx-product",
      product_id: "rx-product",
      name: "Medicamento sujeito a receita",
      price: 20,
      controlled: true,
      prescription_status: "not_sent",
    });

    attachPrescriptionToCart(["rx-product"], "rx-1", "recebida");
    updateCartPrescriptionStatuses([{ id: "rx-1", status: "aprovada" }]);

    expect(getCart()[0].prescription_id).toBe("rx-1");
    expect(getCart()[0].prescription_status).toBe("aprovada");
    expect(isCartItemPayable(getCart()[0])).toBe(true);
  });

  it("removes purchased items without deleting a pending prescription item", () => {
    addToCart({ id: "normal", name: "Produto comum", price: 10 });
    addToCart({
      id: "pending",
      name: "Medicamento controlado",
      price: 30,
      controlled: true,
      prescription_status: "recebida",
    });

    removeCartItems(["normal"]);

    expect(getCart().map((item) => item.id)).toEqual(["pending"]);
  });
});
