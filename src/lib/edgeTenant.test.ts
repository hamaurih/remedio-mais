import { describe, expect, it } from "vitest";
import {
  CLIENT_ZERO_ORGANIZATION_ID,
  CLIENT_ZERO_STORE_ID,
  resolveOrderTenant,
  resolveRequestTenant,
  TenantResolutionError,
  withTenant,
} from "../../supabase/functions/_shared/tenant";

function queryResult(data: unknown, error: unknown = null) {
  const filters: Array<[string, string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push(["eq", column, value]);
      return query;
    },
    in: (column: string, value: unknown) => {
      filters.push(["in", column, value]);
      return query;
    },
    maybeSingle: async () => ({ data, error }),
  };

  return { query, filters };
}

describe("Edge Function tenant resolver", () => {
  it("validates and returns an explicit active store", async () => {
    const result = queryResult({ id: "store" });
    const admin = { from: () => result.query };
    const organizationId = "10000000-0000-0000-0000-000000000001";
    const storeId = "20000000-0000-0000-0000-000000000001";

    await expect(
      resolveRequestTenant(admin, {
        organization_id: organizationId,
        store_id: storeId,
      }),
    ).resolves.toEqual({ organizationId, storeId });

    expect(result.filters).toContainEqual(["eq", "organization_id", organizationId]);
    expect(result.filters).toContainEqual(["eq", "id", storeId]);
    expect(result.filters).toContainEqual(["eq", "active", true]);
  });

  it("keeps the validated client-zero compatibility fallback", async () => {
    const result = queryResult({ id: CLIENT_ZERO_STORE_ID });
    const admin = { from: () => result.query };

    await expect(resolveRequestTenant(admin, {})).resolves.toEqual({
      organizationId: CLIENT_ZERO_ORGANIZATION_ID,
      storeId: CLIENT_ZERO_STORE_ID,
    });
  });

  it("rejects a tenant that is not an active store", async () => {
    const result = queryResult(null);
    const admin = { from: () => result.query };

    await expect(resolveRequestTenant(admin, {})).rejects.toBeInstanceOf(
      TenantResolutionError,
    );
  });

  it("derives the tenant from the persisted order", async () => {
    const order = {
      id: "30000000-0000-0000-0000-000000000001",
      organization_id: "10000000-0000-0000-0000-000000000001",
      store_id: "20000000-0000-0000-0000-000000000001",
    };
    const result = queryResult(order);
    const admin = { from: () => result.query };

    await expect(resolveOrderTenant(admin, order.id)).resolves.toEqual({
      tenant: {
        organizationId: order.organization_id,
        storeId: order.store_id,
      },
      order,
    });
  });

  it("overwrites spoofed ownership on inserted rows", () => {
    const tenant = {
      organizationId: "10000000-0000-0000-0000-000000000001",
      storeId: "20000000-0000-0000-0000-000000000001",
    };

    expect(
      withTenant(
        {
          organization_id: "spoofed",
          store_id: "spoofed",
          value: 1,
        },
        tenant,
      ),
    ).toMatchObject({
      organization_id: tenant.organizationId,
      store_id: tenant.storeId,
      value: 1,
    });
  });
});
