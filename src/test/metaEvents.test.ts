import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Mock do cliente Supabase: config Meta habilitada, sem rede real.
const invoke = vi.fn().mockResolvedValue({ data: {}, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: { enabled: true, pixel_id: "1234567890", consent_required: false } }),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

const fbq = vi.fn();

async function freshMeta() {
  vi.resetModules();
  (window as any).fbq = fbq;
  const pixel = await import("@/lib/metaPixel");
  // Simula fbevents.js já carregado
  pixel.loadMetaPixel("1234567890");
  const events = await import("@/lib/metaEvents");
  await events.loadMetaConfig();
  events.applyMetaPixelState();
  return events;
}

beforeEach(() => {
  fbq.mockClear();
  invoke.mockClear();
  sessionStorage.clear();
  localStorage.clear();
});

describe("Meta Pixel — PageView em SPA", () => {
  it("não duplica PageView na mesma rota e dispara em rota nova", async () => {
    const m = await freshMeta();
    m.trackPageView("/produto/dipirona");
    m.trackPageView("/produto/dipirona");
    m.trackPageView("/carrinho");
    const pageViews = fbq.mock.calls.filter((c) => c[1] === "PageView");
    expect(pageViews).toHaveLength(2);
  });
});

describe("Eventos de e-commerce", () => {
  it("ViewContent envia content_ids, valor e moeda BRL", async () => {
    const m = await freshMeta();
    m.trackViewContent({ id: "p1", name: "Dipirona 500mg", price: 12.9 });
    const call = fbq.mock.calls.find((c) => c[1] === "ViewContent");
    expect(call?.[2]).toMatchObject({
      content_type: "product", content_ids: ["p1"], value: 12.9, currency: "BRL",
    });
    expect(call?.[3]).toHaveProperty("eventID");
  });

  it("AddToCart envia contents com id, quantity e item_price", async () => {
    const m = await freshMeta();
    m.trackAddToCart({ id: "v1", product_id: "p1", name: "Produto", price: 10, quantity: 2 });
    const call = fbq.mock.calls.find((c) => c[1] === "AddToCart");
    expect(call?.[2]).toMatchObject({
      content_ids: ["p1"], contents: [{ id: "p1", quantity: 2, item_price: 10 }], value: 20, currency: "BRL",
    });
  });

  it("InitiateCheckout ignora carrinho vazio e soma num_items", async () => {
    const m = await freshMeta();
    m.trackInitiateCheckout([], 0);
    expect(fbq.mock.calls.some((c) => c[1] === "InitiateCheckout")).toBe(false);
    m.trackInitiateCheckout([{ id: "p1", price: 5, quantity: 2 }, { id: "p2", price: 3, quantity: 1 }], 13);
    const call = fbq.mock.calls.find((c) => c[1] === "InitiateCheckout");
    expect(call?.[2]).toMatchObject({ num_items: 3, value: 13, currency: "BRL" });
  });

  it("AddPaymentInfo não envia dados de cartão", async () => {
    const m = await freshMeta();
    m.trackAddPaymentInfo("credit_card", 99.9);
    const params = fbq.mock.calls.find((c) => c[1] === "AddPaymentInfo")?.[2] as Record<string, unknown>;
    expect(params).toMatchObject({ payment_method: "credit_card", value: 99.9 });
    const keys = Object.keys(params).join(" ");
    expect(keys).not.toMatch(/card|cvv|holder|number/i);
  });
});

describe("Purchase — deduplicação e idempotência", () => {
  it("usa event_id determinístico purchase:<order_id>", async () => {
    const m = await freshMeta();
    const eventId = m.trackPurchase({ id: "order-123", total: 50, items: [{ id: "p1", quantity: 1, item_price: 50 }] });
    expect(eventId).toBe("purchase:order-123");
    expect(fbq.mock.calls.find((c) => c[1] === "Purchase")?.[3]).toEqual({ eventID: "purchase:order-123" });
  });

  it("não repete Purchase do mesmo pedido na mesma sessão", async () => {
    const m = await freshMeta();
    m.trackPurchase({ id: "order-9", total: 10, items: [] });
    m.trackPurchase({ id: "order-9", total: 10, items: [] });
    expect(fbq.mock.calls.filter((c) => c[1] === "Purchase")).toHaveLength(1);
  });

  it("Purchase do browser não é espelhado na CAPI (fonte de verdade é o webhook)", async () => {
    const m = await freshMeta();
    m.trackPurchase({ id: "order-77", total: 10, items: [] });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("Consentimento", () => {
  it("bloqueia o Pixel quando o consentimento é exigido e não foi dado", async () => {
    vi.resetModules();
    (window as any).fbq = fbq;
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        rpc: vi.fn().mockResolvedValue({ data: { enabled: true, pixel_id: "999", consent_required: true } }),
        functions: { invoke: (...a: unknown[]) => invoke(...a) },
      },
    }));
    const events = await import("@/lib/metaEvents");
    await events.loadMetaConfig();
    events.trackViewContent({ id: "p1", name: "x", price: 1 });
    expect(fbq.mock.calls.some((c) => c[1] === "ViewContent")).toBe(false);
    vi.doUnmock("@/integrations/supabase/client");
  });
});

describe("Segurança", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });

  it("nenhum arquivo do frontend referencia o token da CAPI ou a Graph API", () => {
    const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("test"));
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      // Menção em texto de instrução no Admin é permitida; leitura/uso do token não.
      return /env[^\n]*META_CAPI_ACCESS_TOKEN/.test(src)
        || src.includes("Deno.env")
        || src.includes("graph.facebook.com")
        || /access_token\s*[:=]/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("edge function envia user_data com hash e não loga token", () => {
    const helper = readFileSync("supabase/functions/_shared/meta.ts", "utf8");
    expect(helper).toContain('crypto.subtle.digest("SHA-256"');
    expect(helper).toContain("normalizePhone");
    expect(helper).toMatch(/maskResponse/);
    // fbp/fbc/ip/ua vão sem hash (regra da Meta); email/telefone sempre com hash.
    expect(helper).toContain('hashIf("em"');
    expect(helper).toContain('hashIf("ph"');
  });

  it("CAPI só aceita eventos comerciais permitidos e bloqueia Purchase do browser", () => {
    const fn = readFileSync("supabase/functions/meta-conversions-api/index.ts", "utf8");
    expect(fn).toContain("BROWSER_ALLOWED");
    const allow = fn.slice(fn.indexOf("BROWSER_ALLOWED"), fn.indexOf("]);"));
    expect(allow).not.toContain("Purchase");
    // Purchase server-side só com pagamento aprovado + trava de idempotência.
    expect(fn).toContain('order.payment_status !== "approved"');
    expect(fn).toContain("already_sent");
  });

  it("nenhum dado clínico é enviado nos eventos", () => {
    const front = readFileSync("src/lib/metaEvents.ts", "utf8");
    const fn = readFileSync("supabase/functions/meta-conversions-api/index.ts", "utf8");
    for (const src of [front, fn]) {
      expect(src).not.toMatch(/active_ingredient|prescription_|receita_|diagnos/i);
    }
    const allowed = fn.slice(fn.indexOf("const allowed = new Set"), fn.indexOf("]);", fn.indexOf("const allowed = new Set")));
    expect(allowed).not.toMatch(/ingredient|controlled|requires_prescription/i);
  });
});
