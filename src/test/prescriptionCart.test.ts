import { describe, expect, it } from "vitest";
import {
  cartPayableItems,
  cartPendingPrescriptionItems,
  cartPayableTotal,
  isCartItemPayable,
  isPrescriptionApproved,
  type CartItem,
} from "@/lib/store";

const normal: CartItem = {
  id: "normal",
  product_id: "normal",
  name: "Produto comum",
  price: 10,
  quantity: 2,
};

const waiting: CartItem = {
  id: "rx-waiting",
  product_id: "rx-waiting",
  name: "Medicamento com receita",
  price: 30,
  quantity: 1,
  requires_prescription: true,
};

const received: CartItem = {
  ...waiting,
  id: "rx-received",
  product_id: "rx-received",
  prescription_id: "prescription-1",
  prescription_status: "recebida",
  prescription_approved_at: null,
};

const approved: CartItem = {
  ...waiting,
  id: "rx-approved",
  product_id: "rx-approved",
  prescription_id: "prescription-2",
  prescription_status: "aprovada",
  prescription_approved_at: "2026-08-18T20:00:00Z",
};

describe("prescription cart approval", () => {
  it("permite produto comum imediatamente", () => {
    expect(isCartItemPayable(normal)).toBe(true);
  });

  it("bloqueia medicamento antes do envio da receita", () => {
    expect(isCartItemPayable(waiting)).toBe(false);
  });

  it("continua bloqueado depois que a receita foi apenas recebida", () => {
    expect(isCartItemPayable(received)).toBe(false);
  });

  it("só libera com status aprovada e approved_at", () => {
    expect(isPrescriptionApproved({ ...approved, prescription_approved_at: null })).toBe(false);
    expect(isPrescriptionApproved({ ...approved, prescription_status: "recebida" })).toBe(false);
    expect(isPrescriptionApproved(approved)).toBe(true);
    expect(isCartItemPayable(approved)).toBe(true);
  });

  it("em carrinho misto envia ao checkout apenas itens liberados", () => {
    const cart = [normal, waiting, received, approved];
    expect(cartPayableItems(cart).map((i) => i.id)).toEqual(["normal", "rx-approved"]);
    expect(cartPendingPrescriptionItems(cart).map((i) => i.id)).toEqual(["rx-waiting", "rx-received"]);
  });

  it("total liberado ignora somente itens aguardando receita", () => {
    const cart = [normal, waiting, approved];
    expect(cartPayableTotal(cart)).toBe(50); // 2x10 + 1x30 approved
  });
});

describe("status aprovado em inglês", () => {
  it("aceita status 'approved' vindo do servidor", () => {
    expect(isCartItemPayable({ ...approved, prescription_status: "approved" })).toBe(true);
  });
  it("mantém bloqueio para status desconhecido", () => {
    expect(isCartItemPayable({ ...approved, prescription_status: "waiting" })).toBe(false);
  });
});
