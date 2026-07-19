import { Building2, Store } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";

export function TenantSwitcher() {
  const {
    memberships,
    stores,
    activeOrganization,
    activeStore,
    selectOrganization,
    selectStore,
  } = useTenant();

  const organizationStores = stores.filter(
    (store) => store.organizationId === activeOrganization?.id,
  );

  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="flex items-center gap-1.5">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="sr-only">Organização</span>
        <select
          aria-label="Organização ativa"
          className="h-8 max-w-48 rounded-md border bg-background px-2 font-medium"
          value={activeOrganization?.id ?? ""}
          onChange={(event) => selectOrganization(event.target.value)}
          disabled={memberships.length <= 1}
        >
          {memberships.map((membership) => (
            <option key={membership.id} value={membership.organizationId}>
              {membership.organization.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <Store className="h-4 w-4 text-muted-foreground" />
        <span className="sr-only">Filial</span>
        <select
          aria-label="Filial ativa"
          className="h-8 max-w-44 rounded-md border bg-background px-2"
          value={activeStore?.id ?? ""}
          onChange={(event) => selectStore(event.target.value)}
          disabled={organizationStores.length <= 1}
        >
          {organizationStores.length === 0 && <option value="">Sem filial ativa</option>}
          {organizationStores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
