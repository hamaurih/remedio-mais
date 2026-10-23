import { describe, expect, it, vi } from "vitest";
import { normalizeLegacySalesChannel } from "@/erp/core/contracts";
import { resolveChannelPrice } from "@/erp/core/channelPricing";
import { TrierAdapter } from "../../supabase/functions/_shared/erp/trier-adapter";

describe("ERP Core contracts", () => {
  it("normaliza canais legados sem perder origem IA", () => {
    expect(normalizeLegacySalesChannel("site", "site")).toBe("site");
    expect(normalizeLegacySalesChannel("pdv", "pdv")).toBe("pdv");
    expect(normalizeLegacySalesChannel("balcao", "pdv")).toBe("pdv");
    expect(normalizeLegacySalesChannel("whatsapp", "ia")).toBe("whatsapp_ia");
    expect(normalizeLegacySalesChannel("whatsapp", "humano")).toBe("whatsapp_humano");
  });

  it("resolve preços independentes por canal", () => {
    const p = {
      price: 10,
      price_base: 10,
      site_price: 9,
      whatsapp_price: 8.5,
      pdv_price: 10,
    };
    expect(resolveChannelPrice(p, "site").finalPrice).toBe(9);
    expect(resolveChannelPrice(p, "whatsapp_ia").finalPrice).toBe(8.5);
    expect(resolveChannelPrice(p, "pdv").finalPrice).toBe(10);
  });

  it("respeita promoção do canal antes do preço normal", () => {
    const p = {
      price_base: 10,
      site_price: 9,
      site_promo_price: 7,
      promotion_start: "2026-01-01T00:00:00Z",
      promotion_end: "2026-12-31T23:59:59Z",
    };
    const r = resolveChannelPrice(p, "site", new Date("2026-10-23T18:00:00Z").getTime());
    expect(r.finalPrice).toBe(7);
    expect(r.source).toBe("site_promo_price");
    expect(r.comparePrice).toBe(10);
  });
});

describe("Trier Adapter", () => {
  it("envia token apenas no servidor e consulta produto no endpoint oficial", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      new Response(JSON.stringify({ codigo: 123 }), { status: 200 }),
    );
    const adapter = new TrierAdapter(
      { baseUrl: "https://trier.example/sgfpod1/", token: "secret", branchCode: "1" },
      fetchMock as typeof fetch,
      async () => {},
    );

    const result = await adapter.getProduct(123);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/rest/integracao/produto/obter-v1");
    expect(String(url)).toContain("codigo=123");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("repete erro transitório e depois retorna sucesso", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("temporario", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const adapter = new TrierAdapter(
      { baseUrl: "https://trier.example", token: "secret", maxAttempts: 3 },
      fetchMock as typeof fetch,
      async () => {},
    );

    const result = await adapter.getSeller(45);
    expect(result.status).toBe(200);
    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("envia venda por POST sem alterar o payload", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      new Response(JSON.stringify({ numeroPedido: 1234 }), { status: 200 }),
    );
    const adapter = new TrierAdapter(
      { baseUrl: "https://trier.example", token: "secret" },
      fetchMock as typeof fetch,
      async () => {},
    );

    const payload = { numeroPedido: 99, itens: [{ codigo: 1, quantidade: 2 }] };
    await adapter.sendEcommerceSale(payload);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/rest/integracao/venda/ecommerce/efetuar-venda-v1");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(payload));
  });
});
