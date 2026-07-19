import {
  getTenantPermissions,
  resolveTenantSelection,
  type TenantMembership,
  type TenantStore,
} from "./tenant";

const memberships: TenantMembership[] = [
  {
    id: "membership-a",
    organizationId: "org-a",
    userId: "user-1",
    role: "admin",
    status: "active",
    defaultStoreId: "store-a-2",
    organization: {
      id: "org-a",
      name: "Farmácia A",
      slug: "farmacia-a",
      status: "active",
    },
  },
  {
    id: "membership-b",
    organizationId: "org-b",
    userId: "user-1",
    role: "seller",
    status: "active",
    defaultStoreId: null,
    organization: {
      id: "org-b",
      name: "Farmácia B",
      slug: "farmacia-b",
      status: "active",
    },
  },
];

const stores: TenantStore[] = [
  {
    id: "store-a-1",
    organizationId: "org-a",
    name: "Matriz A",
    code: "A1",
    slug: "matriz-a",
    isHeadquarters: true,
    active: true,
  },
  {
    id: "store-a-2",
    organizationId: "org-a",
    name: "Filial A",
    code: "A2",
    slug: "filial-a",
    isHeadquarters: false,
    active: true,
  },
  {
    id: "store-b-1",
    organizationId: "org-b",
    name: "Matriz B",
    code: "B1",
    slug: "matriz-b",
    isHeadquarters: true,
    active: true,
  },
];

describe("resolveTenantSelection", () => {
  it("preserves an allowed organization and store", () => {
    expect(
      resolveTenantSelection(memberships, stores, {
        organizationId: "org-b",
        storeId: "store-b-1",
      }),
    ).toEqual({ organizationId: "org-b", storeId: "store-b-1" });
  });

  it("ignores a store from another organization", () => {
    expect(
      resolveTenantSelection(memberships, stores, {
        organizationId: "org-a",
        storeId: "store-b-1",
      }),
    ).toEqual({ organizationId: "org-a", storeId: "store-a-2" });
  });

  it("returns an empty context for customers without memberships", () => {
    expect(
      resolveTenantSelection([], stores, {
        organizationId: "org-a",
        storeId: "store-a-1",
      }),
    ).toEqual({ organizationId: null, storeId: null });
  });
});

describe("getTenantPermissions", () => {
  it("does not let managers manage the organization", () => {
    expect(getTenantPermissions("manager")).toMatchObject({
      isAdmin: true,
      canAccessAdmin: true,
      canManageOrganization: false,
      canManageStore: true,
    });
  });

  it("keeps sellers out of administrative capabilities", () => {
    expect(getTenantPermissions("seller")).toMatchObject({
      isAdmin: false,
      isSeller: true,
      canAccessAdmin: true,
      canManageOrganization: false,
      canManageStore: false,
    });
  });
});
