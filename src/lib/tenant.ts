export const organizationRoles = [
  "owner",
  "admin",
  "manager",
  "pharmacist",
  "seller",
  "support",
] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

export type TenantOrganization = {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "cancelled";
};

export type TenantStore = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  slug: string;
  isHeadquarters: boolean;
  active: boolean;
};

export type TenantMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: "invited" | "active" | "suspended" | "revoked";
  defaultStoreId: string | null;
  organization: TenantOrganization;
};

export type TenantSelection = {
  organizationId: string | null;
  storeId: string | null;
};

export function getTenantPermissions(role?: OrganizationRole | null) {
  const isOwner = role === "owner";
  const isAdmin = role === "owner" || role === "admin" || role === "manager";
  const isSeller = role === "seller";

  return {
    isOwner,
    isAdmin,
    isSeller,
    canAccessAdmin: isAdmin || isSeller || role === "pharmacist" || role === "support",
    canManageOrganization: isOwner || role === "admin",
    canManageStore: isAdmin,
  };
}

export function resolveTenantSelection(
  memberships: TenantMembership[],
  stores: TenantStore[],
  preferred: TenantSelection,
): TenantSelection {
  const membership =
    memberships.find((item) => item.organizationId === preferred.organizationId) ??
    memberships[0];

  if (!membership) {
    return { organizationId: null, storeId: null };
  }

  const organizationStores = stores.filter(
    (store) => store.organizationId === membership.organizationId && store.active,
  );

  const store =
    organizationStores.find((item) => item.id === preferred.storeId) ??
    organizationStores.find((item) => item.id === membership.defaultStoreId) ??
    organizationStores.find((item) => item.isHeadquarters) ??
    organizationStores[0];

  return {
    organizationId: membership.organizationId,
    storeId: store?.id ?? null,
  };
}
