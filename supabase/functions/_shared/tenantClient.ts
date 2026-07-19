import { TenantResolutionError, type TenantScope, withTenant } from "./tenant.ts";

export const TRIER_TENANT_TABLES = new Set([
  "categories",
  "order_items",
  "orders",
  "product_sync_logs",
  "products",
  "trier_barcode_divergences",
  "trier_logs",
  "trier_product_mappings",
  "trier_settings",
  "trier_sync_jobs",
]);

function tenantRows(value: unknown, tenant: TenantScope) {
  if (Array.isArray(value)) {
    return value.map((row) =>
      row && typeof row === "object"
        ? withTenant(row as Record<string, unknown>, tenant)
        : row
    );
  }

  return value && typeof value === "object"
    ? withTenant(value as Record<string, unknown>, tenant)
    : value;
}

function applyTenantFilter(builder: any, tenant: TenantScope) {
  return builder
    .eq("organization_id", tenant.organizationId)
    .eq("store_id", tenant.storeId);
}

function scopeQuery(
  builder: any,
  tenant: TenantScope,
  alreadyScoped = false,
): any {
  return new Proxy(builder, {
    get(target, property) {
      if (property === "then") {
        const scoped = alreadyScoped
          ? target
          : applyTenantFilter(target, tenant);
        return scoped.then.bind(scoped);
      }

      const value = target[property];
      if (typeof value !== "function") return value;

      return (...args: unknown[]) => {
        if (property === "insert" || property === "upsert") {
          args[0] = tenantRows(args[0], tenant);
        }

        // PostgREST transform builders returned by single/maybeSingle no
        // longer expose filters, so ownership must be applied first.
        if (property === "single" || property === "maybeSingle") {
          const scoped = alreadyScoped
            ? target
            : applyTenantFilter(target, tenant);
          return scopeQuery(value.apply(scoped, args), tenant, true);
        }

        return scopeQuery(value.apply(target, args), tenant, alreadyScoped);
      };
    },
  });
}

export function createTenantScopedClient(
  baseClient: any,
  getTenant: () => TenantScope | undefined,
  tenantTables = TRIER_TENANT_TABLES,
) {
  return new Proxy(baseClient, {
    get(target, property) {
      if (property === "from") {
        return (table: string) => {
          const tenant = getTenant();
          if (!tenant) {
            throw new TenantResolutionError(
              "Contexto de organização/loja ausente.",
              500,
            );
          }

          const builder = target.from(table);
          return tenantTables.has(table)
            ? scopeQuery(builder, tenant)
            : builder;
        };
      }

      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
