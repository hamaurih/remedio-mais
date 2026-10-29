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
  simulateTaxPrice,
  taxMigrationMode,
} from "@/lib/taxMigration";
import AdminTaxMigration from "@/pages/admin/AdminTaxMigration";

const auth = vi.hoisted(() => ({
  user: { id: "admin-a" },
  isAdmin: true,
  loading: false,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

beforeEach(() => {
  localStorage.clear();
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

  it("keeps 2026 informative and rounds each tax in cents", () => {
    expect(simulateTaxPrice("100,00")).toEqual({
      base: 10000,
      cbs2026: 90,
      ibs2026: 10,
      cbs2027: 1130,
      total2026: 10000,
      total2027: 11130,
    });
    expect(simulateTaxPrice("0")?.total2027).toBe(0);
    expect(simulateTaxPrice("19.99")?.total2027).toBe(2225);
    for (const input of [
      "",
      "-1",
      "Infinity",
      "1e3",
      "1.000,00",
      "1,234",
      "1000001",
    ])
      expect(simulateTaxPrice(input)).toBeNull();
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
    <MemoryRouter>
      <AdminTaxMigration />
    </MemoryRouter>,
  );

it("shows understandable empty and invalid price states, and real calculated results", () => {
  mount();
  const input = screen.getByLabelText("Preço base (R$)");
  expect(
    screen.getByText("Digite um preço para comparar os dois cenários."),
  ).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "-1" } });
  expect(input).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(input, { target: { value: "100,00" } });
  expect(screen.getByText("Preço final: R$ 111,30")).toBeInTheDocument();
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
    <MemoryRouter>
      <AdminTaxMigration />
    </MemoryRouter>,
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
