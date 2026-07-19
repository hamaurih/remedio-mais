import { supabase } from "@/integrations/supabase/client";

export type TenantQueryScope = {
  organizationId: string | null;
  storeId: string | null;
};

export function selectTenantRows(
  table: string,
  scope: TenantQueryScope,
  columns = "*",
  options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
) {
  if (!scope.organizationId || !scope.storeId) {
    throw new Error("Admin tenant is not resolved.");
  }

  return (supabase as any)
    .from(table)
    .select(columns, options)
    .eq("organization_id", scope.organizationId)
    .eq("store_id", scope.storeId);
}

export function tenantQueryKey(scope: TenantQueryScope, queryKey: readonly unknown[]) {
  return ["tenant", scope.organizationId, scope.storeId, ...queryKey] as const;
}
