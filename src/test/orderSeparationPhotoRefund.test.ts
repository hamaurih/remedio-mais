import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/pages/admin/AdminOrders.tsx","utf8");

describe("admin order separation photos", () => {
  it("loads the current product image as a fallback", () => {
    expect(source).toContain("product:products!order_items_product_id_fkey(image_url)");
    expect(source).toContain("item.product_image_url");
    expect(source).toContain("item.product?.image_url");
    expect(source).toContain("ItemProductImage");
  });

  it("falls back when the snapshot image is broken", () => {
    expect(source).toContain("onError={() =>");
    expect(source).toContain("setSrc(fallback)");
    expect(source).toContain("Sem foto");
  });
});

describe("expired item refund during separation", () => {
  it("uses only the Cielo refund function and never calls Trier inside expired-item refund", () => {
    const start = source.indexOf("const refundExpiredItem");
    const end = source.indexOf("const updatePrescriptionOriginal", start);
    const handler = source.slice(start, end);
    expect(handler).toContain('supabase.functions.invoke("refund-cielo"');
    expect(handler).toContain("Produto vencido durante separação");
    expect(handler).not.toContain('send-order-to-trier');
  });

  it("removes the item only after the refund succeeds", () => {
    const refundCall = source.indexOf('supabase.functions.invoke("refund-cielo"');
    const refundErrorCheck = source.indexOf("if (refundError ||", refundCall);
    const removeItem = source.indexOf('.update({ item_status: "removido"', refundErrorCheck);
    expect(refundCall).toBeGreaterThan(-1);
    expect(refundErrorCheck).toBeGreaterThan(refundCall);
    expect(removeItem).toBeGreaterThan(refundErrorCheck);
  });

  it("uses total refund for the last active item and partial refund otherwise", () => {
    expect(source).toContain("isLastActiveItem");
    expect(source).toContain("amount: isLastActiveItem ? undefined : itemAmount");
    expect(source).toContain("Vencido / Estornar item");
  });
});

// Regression guard: separation photos and expired-item refunds must stay independent from Trier.
