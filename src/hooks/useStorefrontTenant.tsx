import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CLIENT_ZERO_ORGANIZATION_ID,
  CLIENT_ZERO_STORE_ID,
  isStorefrontPreviewHostname,
  normalizeStorefrontHostname,
} from "@/lib/storefrontTenant";

export type StorefrontTenant = {
  organizationId: string;
  storeId: string;
  hostname: string;
  source: "domain" | "preview";
};

type StorefrontTenantContextValue = {
  tenant: StorefrontTenant | null;
  organizationId: string | null;
  storeId: string | null;
  loading: boolean;
  error: string | null;
};

const StorefrontTenantContext = createContext<StorefrontTenantContextValue | undefined>(
  undefined,
);

export function StorefrontTenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<StorefrontTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveTenant() {
      const browserHostname = normalizeStorefrontHostname(window.location.hostname);
      const configuredHostname = normalizeStorefrontHostname(
        import.meta.env.VITE_DEFAULT_STOREFRONT_HOSTNAME ?? "",
      );
      const hostname = configuredHostname || browserHostname;
      const isPreview = isStorefrontPreviewHostname(browserHostname);

      setLoading(true);
      setError(null);

      try {
        // SaaS tables are temporarily isolated behind a compatibility cast until
        // generated types are refreshed from the fully migrated database.
        const tenantDb = supabase as any;
        const { data, error: domainError } = await tenantDb
          .from("organization_domains")
          .select("organization_id, store_id, hostname")
          .eq("hostname", hostname)
          .eq("status", "verified")
          .maybeSingle();

        // Preview deployments may still point at a database that has not
        // received the SaaS migrations. Preserve preview access only there;
        // a custom production domain must never bypass domain verification.
        if (domainError && !isPreview) throw domainError;

        if (data?.organization_id && data?.store_id) {
          if (!cancelled) {
            setTenant({
              organizationId: data.organization_id,
              storeId: data.store_id,
              hostname: data.hostname,
              source: "domain",
            });
            setLoading(false);
          }
          return;
        }

        if (isPreview) {
          if (!cancelled) {
            setTenant({
              organizationId: CLIENT_ZERO_ORGANIZATION_ID,
              storeId: CLIENT_ZERO_STORE_ID,
              hostname: browserHostname,
              source: "preview",
            });
            setLoading(false);
          }
          return;
        }

        throw new Error("Este domínio ainda não está vinculado a uma loja ativa.");
      } catch (tenantError: any) {
        if (cancelled) return;
        setTenant(null);
        setError(tenantError?.message || "Não foi possível identificar esta loja.");
        setLoading(false);
      }
    }

    void resolveTenant();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<StorefrontTenantContextValue>(
    () => ({
      tenant,
      organizationId: tenant?.organizationId ?? null,
      storeId: tenant?.storeId ?? null,
      loading,
      error,
    }),
    [tenant, loading, error],
  );

  return (
    <StorefrontTenantContext.Provider value={value}>
      {children}
    </StorefrontTenantContext.Provider>
  );
}

export function StorefrontTenantBoundary({ children }: { children: ReactNode }) {
  const { loading, error } = useStorefrontTenant();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">Carregando loja…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold">Loja não encontrada</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

export function useStorefrontTenant() {
  const context = useContext(StorefrontTenantContext);
  if (!context) {
    throw new Error("useStorefrontTenant must be used within StorefrontTenantProvider");
  }
  return context;
}
