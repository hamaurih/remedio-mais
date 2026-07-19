export const CLIENT_ZERO_ORGANIZATION_ID =
  "00000000-0000-0000-0000-000000000001";
export const CLIENT_ZERO_STORE_ID =
  "00000000-0000-0000-0000-000000000002";

export type TenantScope = {
  organizationId: string;
  storeId: string;
};

export class TenantResolutionError extends Error {
  readonly status: number;

  constructor(message = "Organização ou loja inválida.", status = 400) {
    super(message);
    this.name = "TenantResolutionError";
    this.status = status;
  }
}

function asUuid(value: unknown) {
  return typeof value === "string" &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function resolveRequestTenant(
  admin: any,
  input: { organization_id?: unknown; store_id?: unknown },
): Promise<TenantScope> {
  // Client-zero defaults keep the current storefront compatible while callers
  // are migrated. They do not bypass validation and can be removed after the
  // custom domain rollout is complete.
  const organizationId =
    asUuid(input.organization_id) ?? CLIENT_ZERO_ORGANIZATION_ID;
  const storeId = asUuid(input.store_id) ?? CLIENT_ZERO_STORE_ID;

  const { data, error } = await admin
    .from("stores")
    .select("id, organization_id, active, organizations!inner(status)")
    .eq("id", storeId)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .in("organizations.status", ["trial", "active"])
    .maybeSingle();

  if (error || !data) throw new TenantResolutionError();
  return { organizationId, storeId };
}

export async function resolveOrderTenant(
  admin: any,
  orderId: string,
): Promise<{ tenant: TenantScope; order: any }> {
  const { data: order, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order?.organization_id || !order?.store_id) {
    throw new TenantResolutionError("Pedido não encontrado.", 404);
  }

  return {
    tenant: {
      organizationId: order.organization_id,
      storeId: order.store_id,
    },
    order,
  };
}

export function withTenant<T extends Record<string, unknown>>(
  row: T,
  tenant: TenantScope,
) {
  return {
    ...row,
    organization_id: tenant.organizationId,
    store_id: tenant.storeId,
  };
}
