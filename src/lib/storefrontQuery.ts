import { supabase } from "@/integrations/supabase/client";

export type StorefrontScope = {
  organizationId: string | null;
  storeId: string | null;
};

export function selectStorefrontRows(
  table: string,
  columns: string,
  scope: StorefrontScope,
) {
  if (!scope.organizationId || !scope.storeId) {
    throw new Error("Storefront tenant is not resolved.");
  }

  return (supabase as any)
    .from(table)
    .select(columns)
    .eq("organization_id", scope.organizationId)
    .eq("store_id", scope.storeId);
}

export function storefrontQueryKey(scope: StorefrontScope, queryKey: readonly unknown[]) {
  return ["storefront", scope.organizationId, scope.storeId, ...queryKey] as const;
}
