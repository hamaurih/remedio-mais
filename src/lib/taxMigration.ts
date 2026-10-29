// UI only. Never consume this flag in checkout, fiscal issuance or ERP syncs.
// VITE_TAX_MIGRATION_PREVIEW: off | demo (default) | effective.
// "effective" only changes the UI from 01/01/2027; it never enables collection.
export const tax_migration_preview =
  import.meta.env.VITE_TAX_MIGRATION_PREVIEW ?? "demo";
export const TAX_MIGRATION_VISIBLE = ["demo", "effective"].includes(
  tax_migration_preview,
);
export const CBS_GO_LIVE = new Date("2027-01-01T00:00:00-03:00").getTime();

export function taxMigrationMode(flag: string, now: number) {
  if (!["demo", "effective"].includes(flag)) return "off";
  return flag === "effective" && now >= CBS_GO_LIVE ? "effective" : "demo";
}

export function migrationCountdown(now: number) {
  const seconds = Math.max(0, Math.ceil((CBS_GO_LIVE - now) / 1000));
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

export function simulateTaxPrice(input: string) {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const base = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(base) || base > 100_000_000) return null;
  const cbs2026 = Math.round(base * 0.009);
  const ibs2026 = Math.round(base * 0.001);
  const cbs2027 = Math.round(base * 0.113);
  return {
    base,
    cbs2026,
    ibs2026,
    cbs2027,
    total2026: base,
    total2027: base + cbs2027,
  };
}

export const TAX_CHECKLIST = [
  {
    id: "nfe",
    label: "Campos IBS/CBS na NF-e",
    detail: "Conferir os novos campos e o leiaute fiscal com a contabilidade.",
  },
  {
    id: "operation",
    label: "Cálculo por operação",
    detail: "Revisar enquadramento, alíquotas, reduções e créditos aplicáveis.",
  },
  {
    id: "ibge",
    label: "Destino IBGE",
    detail: "Validar o código do município de destino em cada operação.",
  },
  {
    id: "split",
    label: "Split payment",
    detail:
      "Planejar a adequação ao recolhimento segregado quando regulamentado.",
  },
  {
    id: "marketplace",
    label: "Marketplace / responsabilidade solidária",
    detail:
      "Revisar responsabilidades fiscais nas vendas por plataformas digitais.",
  },
] as const;

export function parseTaxChecklist(raw: string | null): string[] {
  const parsed: unknown = JSON.parse(raw ?? "[]");
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
    throw new Error("Checklist inválido");
  }
  return TAX_CHECKLIST.filter((item) => parsed.includes(item.id)).map(
    (item) => item.id,
  );
}
