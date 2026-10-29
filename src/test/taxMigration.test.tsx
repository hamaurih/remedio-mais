import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CBS_GO_LIVE,
  migrationCountdown,
  parseTaxChecklist,
  simulateProductTax,
  classifyTaxProduct,
  loadTaxCatalog,
  summarizeTaxCatalog,
  taxMargin,
  TaxProduct,
  taxMigrationMode,
} from "@/lib/taxMigration";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminTaxMigration from "@/pages/admin/AdminTaxMigration";

const auth = vi.hoisted(() => ({
  user: { id: "admin-a" },
  isAdmin: true,
  loading: false,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

const med: TaxProduct = {
  id: "1",
  name: "Medicamento fiscal",
  price: 100,
  ncm: "30049099",
  cest: "1300100",
  fiscal_list: "positiva",
  art146_zero: false,
};
const general: TaxProduct = {
  id: "2",
  name: "Higiene",
  price: 100,
  ncm: "33049990",
  is_medicine: false,
  icms_st: false,
  monofasico: false,
};
const remote = vi.hoisted(() => ({ fail: false, empty: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () =>
            remote.fail
              ? { data: null, error: new Error("offline") }
              : {
                  data: remote.empty
                    ? []
                    : [med, general, { id: "3", name: "Pendente", price: 10 }],
                  error: null,
                },
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  localStorage.clear();
  remote.fail = false;
  remote.empty = false;
  auth.user = { id: "admin-a" };
  auth.isAdmin = true;
  auth.loading = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("tax migration boundaries", () => {
  it("never enables the effective UI before the Brasília go-live", () => {
    expect(taxMigrationMode("effective", CBS_GO_LIVE - 1)).toBe("demo");
    expect(taxMigrationMode("effective", CBS_GO_LIVE)).toBe("effective");
    expect(taxMigrationMode("demo", CBS_GO_LIVE + 1)).toBe("demo");
    expect(taxMigrationMode("off", CBS_GO_LIVE)).toBe("off");
    expect(taxMigrationMode("invalid", CBS_GO_LIVE)).toBe("off");
    expect(migrationCountdown(CBS_GO_LIVE - 86400000)).toEqual({
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
    expect(migrationCountdown(CBS_GO_LIVE + 1000)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it("calculates each product, regimes, ICMS continuity, zero and settlement", () => {
    const r = simulateProductTax(med, "100", "presumido")!;
    expect(r).toMatchObject({
      todayRate: 0,
      futureRate: 4.52,
      futureAmount: 452,
      splitAmount: 452,
      sellerAmount: 9548,
      cbs2026: 90,
      ibs2026: 10,
    });
    expect(simulateProductTax(general, "100", "presumido")).toMatchObject({
      todayRate: 23.65,
      futureRate: 31.3,
      futureAmount: 3130,
      splitAmount: 1130,
      sellerAmount: 8870,
    });
    expect(simulateProductTax(general, "100", "real")?.todayRate).toBe(29.25);
    expect(
      simulateProductTax({ ...med, fiscal_list: "neutra" }, "100", "real")
        ?.todayRate,
    ).toBe(9.25);
    expect(
      simulateProductTax({ ...med, art146_zero: true }, "100", "real")
        ?.futureAmount,
    ).toBe(0);
    expect(simulateProductTax(med, "100", "real", false, 50)).toMatchObject({
      futureRate: 4.58,
      splitAmount: 229,
      sellerAmount: 9771,
    });
    expect(taxMargin(r, "80")).toMatchObject({
      beforeTax: 2000,
      todayProfit: 2000,
      futureProfit: 1548,
    });
    expect(taxMargin(r, "80")!.futureMargin).toBeCloseTo(15.48);
    expect(taxMargin(r, "80")!.profitConsumed).toBeCloseTo(22.6);
    expect(taxMargin(r, "110")!.futureProfit).toBeLessThan(0);
    expect(taxMargin(r, "")).toBeNull();
    for (const input of [
      "",
      "-1",
      "Infinity",
      "1e3",
      "1.000,00",
      "1,234",
      "1000001",
    ])
      expect(simulateProductTax(med, input, "real")).toBeNull();
    expect(simulateProductTax(med, "100", "real", true, NaN)).toBeNull();
  });
  it("blocks missing and conflicting evidence; never interprets tarja as fiscal list", () => {
    for (const p of [
      { id: "x", name: "x", price: 1 },
      { ...med, ncm: null },
      { ...med, art146_zero: null },
      { ...med, monofasico: false },
      { ...med, icms_st: false },
      { ...med, is_medicine: false },
      { ...med, fiscal_list: null, medicine_list_type: "positiva" },
    ]) {
      expect(classifyTaxProduct(p as TaxProduct).review).toBe(true);
      expect(simulateProductTax(p as TaxProduct, "100", "real")).toBeNull();
    }
  });
  it("loads 4501 products and excludes pending items from averages without partial success", async () => {
    const data = Array.from({ length: 4501 }, (_, i) => ({
      ...(i % 2 ? general : med),
      id: String(i),
    }));
    const fetch = vi.fn(async (from: number, to: number) =>
      data.slice(from, to + 1),
    );
    const loaded = await loadTaxCatalog(fetch);
    expect(loaded).toHaveLength(4501);
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(
      summarizeTaxCatalog(
        [...loaded, { id: "pending", name: "?", price: 10 }],
        "presumido",
      ),
    ).toMatchObject({ total: 4502, classified: 4501, review: 1 });
    expect(summarizeTaxCatalog([], "real").todayAverage).toBeNull();
    await expect(
      loadTaxCatalog(async (from) => {
        if (from) throw Error("page failed");
        return data.slice(0, 500);
      }),
    ).rejects.toThrow("page failed");
  });

  it("rejects corrupt storage and ignores obsolete checklist keys", () => {
    expect(parseTaxChecklist(null)).toEqual([]);
    expect(parseTaxChecklist('["nfe","nfe","obsolete"]')).toEqual(["nfe"]);
    expect(() => parseTaxChecklist("{")).toThrow();
    expect(() => parseTaxChecklist("[true]")).toThrow();
  });
});

const mount = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <AdminTaxMigration />
      </MemoryRouter>
    </QueryClientProvider>,
  );

it("shows catalog summary, three scenarios, margin, alert and review", async () => {
  mount();
  await screen.findByText(/3 produtos · 2 classificados · 1 em revisão/);
  fireEvent.click(screen.getByRole("button", { name: /Medicamento fiscal/ }));
  expect(screen.getByText("HOJE")).toBeInTheDocument();
  expect(screen.getByText("2027 reforma")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Split Payment" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Esse item subiu 4,52 pontos/)).toBeInTheDocument();
  fireEvent.change(
    screen.getByLabelText("Custo unitário para simular margem (R$)"),
    { target: { value: "80" } },
  );
  expect(screen.getByText(/2027 e Split Payment: lucro/)).toHaveTextContent(
    "15,48%",
  );
  fireEvent.click(screen.getByRole("button", { name: /Pendente/ }));
  expect(screen.getByText(/Classificação em revisão/)).toBeInTheDocument();
});
it("reports catalog failure and supports retry, and empty catalog", async () => {
  remote.fail = true;
  mount();
  await screen.findByText("Não foi possível carregar o catálogo completo");
  remote.fail = false;
  remote.empty = true;
  fireEvent.click(screen.getByRole("button", { name: "Recarregar catálogo" }));
  await screen.findByText("Catálogo vazio.");
});

it("persists the checklist and isolates administrators", async () => {
  const view = mount();
  fireEvent.click(screen.getByLabelText("Campos IBS/CBS na NF-e"));
  expect(localStorage.getItem("remedio-mais:tax-migration:v1:admin-a")).toBe(
    '["nfe"]',
  );
  view.unmount();
  const again = mount();
  expect(screen.getByLabelText("Campos IBS/CBS na NF-e")).toBeChecked();
  auth.user = { id: "admin-b" };
  again.rerender(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <AdminTaxMigration />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Campos IBS/CBS na NF-e")).not.toBeChecked(),
  );
});

it("reports failed saves without showing a false success", () => {
  mount();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  fireEvent.click(screen.getByLabelText("Campos IBS/CBS na NF-e"));
  expect(screen.getByText(/Não foi possível salvar/)).toBeInTheDocument();
  expect(screen.getByLabelText("Campos IBS/CBS na NF-e")).not.toBeChecked();
});

it("offers retry when storage cannot be read", () => {
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  mount();
  expect(screen.getByLabelText("Campos IBS/CBS na NF-e")).toBeDisabled();
  read.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(screen.getByLabelText("Campos IBS/CBS na NF-e")).toBeEnabled();
});

it("does not expose the page to a seller visiting its URL", () => {
  auth.isAdmin = false;
  mount();
  expect(
    screen.queryByRole("heading", { name: "Migração IBS/CBS" }),
  ).not.toBeInTheDocument();
});
