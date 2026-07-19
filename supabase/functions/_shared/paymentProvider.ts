import type { TenantScope } from "./tenant.ts";

export const PAYMENT_METHODS = [
  "pix",
  "credit_card",
  "debit_card",
  "boleto",
  "open_finance",
  "bank_transfer",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentAdapterDefinition = {
  key: string;
  createFunctions: Partial<Record<PaymentMethod, string>>;
};

export type ResolvedPaymentAdapter = {
  providerId: string;
  providerKey: string;
  displayName: string;
  environment: "sandbox" | "production";
  paymentMethod: PaymentMethod;
  functionName: string;
};

export class PaymentRoutingError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PaymentRoutingError";
    this.status = status;
  }
}

// Adding a provider requires an explicit, reviewed adapter entry. Database
// configuration alone can never make the router call an arbitrary function.
export const PAYMENT_ADAPTERS: Record<string, PaymentAdapterDefinition> = {
  mercado_pago: {
    key: "mercado_pago",
    createFunctions: {
      pix: "create-pix-payment",
      credit_card: "create-mercado-pago-checkout",
    },
  },
};

export function normalizePaymentMethod(value: unknown): PaymentMethod {
  if (
    typeof value === "string" &&
    PAYMENT_METHODS.includes(value as PaymentMethod)
  ) {
    return value as PaymentMethod;
  }
  throw new PaymentRoutingError("Forma de pagamento não suportada.");
}

export function getPaymentAdapter(
  providerKey: string,
  paymentMethod: PaymentMethod,
) {
  const adapter = PAYMENT_ADAPTERS[providerKey];
  if (!adapter) {
    throw new PaymentRoutingError(
      `O adaptador de pagamento "${providerKey}" ainda não está instalado.`,
      409,
    );
  }

  const functionName = adapter.createFunctions[paymentMethod];
  if (!functionName || functionName === "create-payment") {
    throw new PaymentRoutingError(
      `O provedor "${providerKey}" não aceita ${paymentMethod}.`,
      409,
    );
  }

  return { adapter, functionName };
}

export async function resolvePaymentAdapter(
  admin: any,
  tenant: TenantScope,
  paymentMethodInput: unknown,
  currency = "BRL",
): Promise<ResolvedPaymentAdapter> {
  const paymentMethod = normalizePaymentMethod(paymentMethodInput);

  const { data: routes, error: routeError } = await admin
    .from("payment_routes")
    .select("provider_id, priority")
    .eq("organization_id", tenant.organizationId)
    .eq("store_id", tenant.storeId)
    .eq("payment_method", paymentMethod)
    .eq("currency", currency)
    .eq("enabled", true)
    .order("priority", { ascending: true })
    .limit(1);

  if (routeError) {
    throw new PaymentRoutingError(
      "Não foi possível consultar as rotas de pagamento.",
      500,
    );
  }

  const route = routes?.[0];
  if (!route?.provider_id) {
    throw new PaymentRoutingError(
      "Nenhum provedor está habilitado para esta forma de pagamento.",
      409,
    );
  }

  const { data: provider, error: providerError } = await admin
    .from("payment_providers")
    .select("id, provider_key, display_name, environment, capabilities")
    .eq("organization_id", tenant.organizationId)
    .eq("store_id", tenant.storeId)
    .eq("id", route.provider_id)
    .eq("enabled", true)
    .maybeSingle();

  if (providerError || !provider) {
    throw new PaymentRoutingError(
      "O provedor configurado não está disponível.",
      409,
    );
  }

  if (!(provider.capabilities ?? []).includes(paymentMethod)) {
    throw new PaymentRoutingError(
      "A forma de pagamento não está habilitada no provedor.",
      409,
    );
  }

  const { functionName } = getPaymentAdapter(
    provider.provider_key,
    paymentMethod,
  );

  return {
    providerId: provider.id,
    providerKey: provider.provider_key,
    displayName: provider.display_name,
    environment: provider.environment,
    paymentMethod,
    functionName,
  };
}
