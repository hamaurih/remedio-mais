import { describe, expect, it } from "vitest";
import {
  CLIENT_ZERO_ORGANIZATION_ID,
  CLIENT_ZERO_STORE_ID,
  resolveOrderTenant,
  resolveRequestTenant,
  TenantResolutionError,
  withTenant,
} from "../../supabase/functions/_shared/tenant";
import { createTenantScopedClient } from "../../supabase/functions/_shared/tenantClient";

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

describe("tenant-scoped service client", () => {
  function thenableQuery() {
    const filters: Array<[string, unknown]> = [];
    let inserted: unknown;
    const query: any = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      select() {
        return query;
      },
      maybeSingle() {
        return query;
      },
      insert(value: unknown) {
        inserted = value;
        return query;
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return { query, filters, inserted: () => inserted };
  }

  it("adds tenant filters to service-role reads", async () => {
    const built = thenableQuery();
    const tenant = {
      organizationId: "10000000-0000-0000-0000-000000000001",
      storeId: "20000000-0000-0000-0000-000000000001",
    };
    const client = createTenantScopedClient(
      { from: () => built.query },
      () => tenant,
      new Set(["products"]),
    );

    await client.from("products").select("*").maybeSingle();

    expect(built.filters).toContainEqual(["organization_id", tenant.organizationId]);
    expect(built.filters).toContainEqual(["store_id", tenant.storeId]);
  });

  it("overwrites tenant ownership on service-role inserts", async () => {
    const built = thenableQuery();
    const tenant = {
      organizationId: "10000000-0000-0000-0000-000000000001",
      storeId: "20000000-0000-0000-0000-000000000001",
    };
    const client = createTenantScopedClient(
      { from: () => built.query },
      () => tenant,
      new Set(["products"]),
    );

    await client.from("products").insert({
      name: "Produto",
      organization_id: "spoofed",
      store_id: "spoofed",
    });

    expect(built.inserted()).toMatchObject({
      name: "Produto",
      organization_id: tenant.organizationId,
      store_id: tenant.storeId,
    });
  });

  it("refuses tenant tables outside a request context", () => {
    const built = thenableQuery();
    const client = createTenantScopedClient(
      { from: () => built.query },
      () => undefined,
      new Set(["products"]),
    );

    expect(() => client.from("products")).toThrow(TenantResolutionError);
  });
});
