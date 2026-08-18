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

  it("keeps a rejected prescription item blocked from payment", () => {
    addToCart({
      id: "rx-rejected",
      product_id: "rx-rejected",
      name: "Medicamento com receita recusada",
      price: 25,
      requires_prescription: true,
      prescription_status: "not_sent",
    });

    attachPrescriptionToCart(["rx-rejected"], "rx-2", "recebida");
    updateCartPrescriptionStatuses([{ id: "rx-2", status: "recusada" }]);

    expect(getCart()[0].prescription_status).toBe("recusada");
    expect(isCartItemPayable(getCart()[0])).toBe(false);
  });

  it("releases all products covered by the same approved prescription", () => {
    addToCart({
      id: "rx-a",
      product_id: "rx-a",
      name: "Medicamento A",
      price: 20,
      requires_prescription: true,
      prescription_status: "not_sent",
    });
    addToCart({
      id: "rx-b",
      product_id: "rx-b",
      name: "Medicamento B",
      price: 30,
      requires_prescription: true,
      prescription_status: "not_sent",
    });

    attachPrescriptionToCart(["rx-a", "rx-b"], "rx-multi", "recebida");
    updateCartPrescriptionStatuses([{ id: "rx-multi", status: "aprovada" }]);

    expect(getCart()).toHaveLength(2);
    expect(getCart().every((item) => item.prescription_id === "rx-multi")).toBe(true);
    expect(getCart().every((item) => item.prescription_status === "aprovada")).toBe(true);
    expect(getCart().every(isCartItemPayable)).toBe(true);
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
