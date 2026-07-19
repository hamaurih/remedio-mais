import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getTenantPermissions,
  resolveTenantSelection,
  type OrganizationRole,
  type TenantMembership,
  type TenantOrganization,
  type TenantSelection,
  type TenantStore,
} from "@/lib/tenant";

const STORAGE_PREFIX = "remedio-mais:tenant";

type TenantContextValue = {
  memberships: TenantMembership[];
  stores: TenantStore[];
  activeMembership: TenantMembership | null;
  activeOrganization: TenantOrganization | null;
  activeStore: TenantStore | null;
  role: OrganizationRole | null;
  loading: boolean;
  error: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  isSeller: boolean;
  canAccessAdmin: boolean;
  canManageOrganization: boolean;
  canManageStore: boolean;
  selectOrganization: (organizationId: string) => void;
  selectStore: (storeId: string) => void;
  refreshTenant: () => void;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

function loadSelection(userId: string): TenantSelection {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}:${userId}`);
    if (!value) return { organizationId: null, storeId: null };
    const parsed = JSON.parse(value);
    return {
      organizationId: typeof parsed.organizationId === "string" ? parsed.organizationId : null,
      storeId: typeof parsed.storeId === "string" ? parsed.storeId : null,
    };
  } catch {
    return { organizationId: null, storeId: null };
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [stores, setStores] = useState<TenantStore[]>([]);
  const [selection, setSelection] = useState<TenantSelection>({
    organizationId: null,
    storeId: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadTenant() {
      if (authLoading) return;

      if (!user) {
        setMemberships([]);
        setStores([]);
        setSelection({ organizationId: null, storeId: null });
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // The generated Lovable types do not include the SaaS tables yet.
        // Keep the compatibility cast isolated here until types are regenerated
        // from the complete migrated database.
        const tenantDb = supabase as any;
        const { data: membershipRows, error: membershipError } = await tenantDb
          .from("organization_memberships")
          .select("id, organization_id, user_id, role, status, default_store_id")
          .eq("user_id", user.id)
          .eq("status", "active");

        if (membershipError) throw membershipError;

        const organizationIds = Array.from(
          new Set((membershipRows ?? []).map((row: any) => row.organization_id)),
        ) as string[];

        if (organizationIds.length === 0) {
          if (!cancelled) {
            setMemberships([]);
            setStores([]);
            setSelection({ organizationId: null, storeId: null });
            setLoading(false);
          }
          return;
        }

        const [{ data: organizationRows, error: organizationError }, { data: storeRows, error: storeError }] =
          await Promise.all([
            tenantDb
              .from("organizations")
              .select("id, name, slug, status")
              .in("id", organizationIds),
            tenantDb
              .from("stores")
              .select("id, organization_id, name, code, slug, is_headquarters, active")
              .in("organization_id", organizationIds)
              .eq("active", true),
          ]);

        if (organizationError) throw organizationError;
        if (storeError) throw storeError;

        const organizations = new Map<string, TenantOrganization>(
          (organizationRows ?? []).map((row: any) => [
            row.id,
            {
              id: row.id,
              name: row.name,
              slug: row.slug,
              status: row.status,
            },
          ]),
        );

        const nextMemberships: TenantMembership[] = (membershipRows ?? [])
          .map((row: any) => {
            const organization = organizations.get(row.organization_id);
            if (!organization) return null;
            return {
              id: row.id,
              organizationId: row.organization_id,
              userId: row.user_id,
              role: row.role,
              status: row.status,
              defaultStoreId: row.default_store_id,
              organization,
            } as TenantMembership;
          })
          .filter(Boolean) as TenantMembership[];

        const nextStores: TenantStore[] = (storeRows ?? []).map((row: any) => ({
          id: row.id,
          organizationId: row.organization_id,
          name: row.name,
          code: row.code,
          slug: row.slug,
          isHeadquarters: row.is_headquarters,
          active: row.active,
        }));

        if (cancelled) return;

        const nextSelection = resolveTenantSelection(
          nextMemberships,
          nextStores,
          loadSelection(user.id),
        );

        setMemberships(nextMemberships);
        setStores(nextStores);
        setSelection(nextSelection);
        setLoading(false);
      } catch (tenantError: any) {
        if (cancelled) return;
        setMemberships([]);
        setStores([]);
        setError(tenantError?.message || "Não foi possível carregar a organização.");
        setLoading(false);
      }
    }

    void loadTenant();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, refreshVersion]);

  const resolvedSelection = useMemo(
    () => resolveTenantSelection(memberships, stores, selection),
    [memberships, stores, selection],
  );

  const activeMembership =
    memberships.find(
      (membership) => membership.organizationId === resolvedSelection.organizationId,
    ) ?? null;

  const activeOrganization = activeMembership?.organization ?? null;
  const activeStore =
    stores.find(
      (store) =>
        store.id === resolvedSelection.storeId &&
        store.organizationId === resolvedSelection.organizationId,
    ) ?? null;

  useEffect(() => {
    if (!user || !resolvedSelection.organizationId) return;
    localStorage.setItem(
      `${STORAGE_PREFIX}:${user.id}`,
      JSON.stringify(resolvedSelection),
    );
  }, [resolvedSelection.organizationId, resolvedSelection.storeId, user]);

  const resetTenantQueries = useCallback(() => {
    // Current legacy queries are not tenant-keyed. Clear their cache whenever
    // the operator changes context so stale data is never carried to a tenant.
    queryClient.clear();
  }, [queryClient]);

  const selectOrganization = useCallback(
    (organizationId: string) => {
      const membership = memberships.find(
        (item) => item.organizationId === organizationId,
      );
      if (!membership) return;

      const next = resolveTenantSelection(memberships, stores, {
        organizationId,
        storeId: membership.defaultStoreId,
      });
      setSelection(next);
      resetTenantQueries();
    },
    [memberships, stores, resetTenantQueries],
  );

  const selectStore = useCallback(
    (storeId: string) => {
      if (
        !stores.some(
          (store) =>
            store.id === storeId &&
            store.organizationId === resolvedSelection.organizationId,
        )
      ) {
        return;
      }
      setSelection((current) => ({ ...current, storeId }));
      resetTenantQueries();
    },
    [stores, resolvedSelection.organizationId, resetTenantQueries],
  );

  const refreshTenant = useCallback(
    () => setRefreshVersion((version) => version + 1),
    [],
  );

  const permissions = getTenantPermissions(activeMembership?.role);

  const value = useMemo<TenantContextValue>(
    () => ({
      memberships,
      stores,
      activeMembership,
      activeOrganization,
      activeStore,
      role: activeMembership?.role ?? null,
      loading: authLoading || loading,
      error,
      ...permissions,
      selectOrganization,
      selectStore,
      refreshTenant,
    }),
    [
      memberships,
      stores,
      activeMembership,
      activeOrganization,
      activeStore,
      authLoading,
      loading,
      error,
      permissions.isOwner,
      permissions.isAdmin,
      permissions.isSeller,
      permissions.canAccessAdmin,
      permissions.canManageOrganization,
      permissions.canManageStore,
      selectOrganization,
      selectStore,
      refreshTenant,
    ],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return context;
}
