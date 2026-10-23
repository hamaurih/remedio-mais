export type TrierAdapterConfig = {
  baseUrl: string;
  token: string;
  branchCode?: string | null;
  timeoutMs?: number;
  maxAttempts?: number;
};

export type TrierFetch = typeof fetch;

export type TrierResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  raw: string;
  attempts: number;
  elapsedMs: number;
};

export class TrierAdapterError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly transient: boolean,
  ) {
    super(message);
    this.name = "TrierAdapterError";
  }
}

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504, 545, 554]);

const ENDPOINTS = {
  productGet: "/rest/integracao/produto/obter-v1",
  productsList: "/rest/integracao/produto/obter-todos-v1",
  sellerGet: "/rest/integracao/vendedor/obter-v1",
  cardGet: "/rest/integracao/cartao/obter-v1",
  ecommerceSale: "/rest/integracao/venda/ecommerce/efetuar-venda-v1",
} as const;

function trimBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function cleanParams(params: Record<string, unknown>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  return qs.toString();
}

export class TrierAdapter {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly config: TrierAdapterConfig,
    private readonly fetchImpl: TrierFetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    if (!config.token?.trim()) throw new Error("TRIER_API_TOKEN obrigatório");
    if (!config.baseUrl?.trim()) throw new Error("Trier baseUrl obrigatória");
    this.baseUrl = trimBaseUrl(config.baseUrl.trim());
    this.timeoutMs = Math.max(1_000, config.timeoutMs ?? 15_000);
    this.maxAttempts = Math.max(1, Math.min(config.maxAttempts ?? 3, 5));
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    query: Record<string, unknown> = {},
  ): Promise<TrierResponse<T>> {
    const qs = cleanParams(query);
    const url = this.baseUrl + path + (qs ? "?" + qs : "");
    const started = Date.now();
    let lastStatus = 0;
    let lastRaw = "";

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(url, {
          ...init,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + this.config.token,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...(init.headers || {}),
          },
        });
        clearTimeout(timeout);

        lastStatus = response.status;
        lastRaw = await response.text();
        let data: T | null = null;
        try {
          data = lastRaw ? JSON.parse(lastRaw) as T : null;
        } catch {
          data = null;
        }

        const transient = TRANSIENT_STATUSES.has(response.status);
        if (!response.ok && transient && attempt < this.maxAttempts) {
          await this.sleep(250 * attempt * attempt);
          continue;
        }

        if (!response.ok) {
          throw new TrierAdapterError(
            `Trier respondeu HTTP ${response.status}`,
            response.status,
            transient,
          );
        }

        return {
          ok: true,
          status: response.status,
          data,
          raw: lastRaw,
          attempts: attempt,
          elapsedMs: Date.now() - started,
        };
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof TrierAdapterError) throw error;

        const transient = true;
        if (attempt < this.maxAttempts) {
          await this.sleep(250 * attempt * attempt);
          continue;
        }

        throw new TrierAdapterError(
          error instanceof Error ? error.message : "Falha de rede Trier",
          lastStatus,
          transient,
        );
      }
    }

    throw new TrierAdapterError(
      lastRaw ? "Falha Trier após tentativas" : "Falha de rede Trier",
      lastStatus,
      true,
    );
  }

  healthCheck(sellerCode: string | number) {
    return this.getSeller(sellerCode);
  }

  getProduct(productCode: string | number) {
    return this.request(ENDPOINTS.productGet, { method: "GET" }, {
      codigo: productCode,
      ...(this.config.branchCode ? { codFilial: this.config.branchCode } : {}),
    });
  }

  listProductsPage(offset: number, limit: number, ecommerce?: boolean) {
    return this.request(ENDPOINTS.productsList, { method: "GET" }, {
      ...(this.config.branchCode ? { codFilial: this.config.branchCode } : {}),
      primeiroRegistro: Math.max(0, offset),
      quantidadeRegistros: Math.max(1, Math.min(limit, 1000)),
      ativo: true,
      integracaoEcommerce: ecommerce === undefined ? undefined : String(ecommerce),
      processaCustoMedio: false,
    });
  }

  getSeller(sellerCode: string | number) {
    return this.request(ENDPOINTS.sellerGet, { method: "GET" }, { codigo: sellerCode });
  }

  getCard(cardCode: string | number) {
    return this.request(ENDPOINTS.cardGet, { method: "GET" }, {
      codigoCartao: cardCode,
      ativo: true,
    });
  }

  sendEcommerceSale(payload: unknown) {
    return this.request(ENDPOINTS.ecommerceSale, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export { ENDPOINTS as TRIER_ENDPOINTS };
