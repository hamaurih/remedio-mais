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

export interface TaxProduct {
  id: string;
  name: string;
  price: number;
  barcode?: string | null;
  sku?: string | null;
  ncm?: string | null;
  cest?: string | null;
  monofasico?: boolean | null;
  fiscal_list?: "positiva" | "negativa" | "neutra" | null;
  is_medicine?: boolean | null;
  icms_st?: boolean | null;
  art146_zero?: boolean | null;
  medicine_list_type?: string | null;
  is_generic?: boolean;
  requires_prescription?: boolean;
  controlled?: boolean;
}
export type TaxClass = "medicamento" | "neutro" | "nao-medicamento" | "revisao";
export const TAX_CLASSES: Record<TaxClass, string> = {
  medicamento: "Medicamento",
  neutro: "Medicamento · lista neutra",
  "nao-medicamento": "Não medicamento",
  revisao: "Sem classificação",
};
const digits = (value?: string | null) => (value ?? "").replace(/[.\s-]/g, "");

export function classifyTaxProduct(p: TaxProduct) {
  const reasons: string[] = [];
  for (const key of [
    "monofasico",
    "is_medicine",
    "icms_st",
    "art146_zero",
    "is_generic",
    "requires_prescription",
    "controlled",
  ] as const) {
    if (p[key] != null && typeof p[key] !== "boolean")
      reasons.push(`Flag fiscal inválida: ${key}`);
  }
  if (
    p.fiscal_list != null &&
    !["positiva", "negativa", "neutra"].includes(p.fiscal_list)
  )
    reasons.push("Lista fiscal inválida");
  const ncm = digits(p.ncm);
  const cest = digits(p.cest);
  const validNcm = /^\d{8}$/.test(ncm);
  const medNcm = validNcm && /^(3003|3004)/.test(ncm);
  // Tarja, descrição e categoria não são listas fiscais nem prova de benefício.
  const medFlag =
    p.is_medicine === true ||
    p.is_generic === true ||
    p.requires_prescription === true ||
    p.controlled === true;
  const medicine = medNcm || medFlag;
  const conflict =
    (p.is_medicine === false && medicine) || (medFlag && validNcm && !medNcm);
  let kind: TaxClass = "revisao";
  if (conflict) reasons.push("NCM e flags de medicamento conflitantes");
  else if (medicine)
    kind = p.fiscal_list === "neutra" ? "neutro" : "medicamento";
  else if (validNcm && p.is_medicine === false) kind = "nao-medicamento";
  else
    reasons.push("Falta classificação fiscal de medicamento/não medicamento");
  if (!validNcm) reasons.push("NCM ausente ou inválido");
  if (p.cest && !/^\d{7}$/.test(cest)) reasons.push("CEST inválido");
  if (p.icms_st === false && medicine && /^13\d{5}$/.test(cest))
    reasons.push("CEST 13 e ICMS-ST conflitantes");
  const st = p.icms_st ?? (medicine && /^13\d{5}$/.test(cest) ? true : null);
  if (st === null) reasons.push("Falta enquadramento ICMS-ST");
  const mono =
    p.monofasico ??
    (p.fiscal_list === "positiva" || p.fiscal_list === "negativa"
      ? true
      : p.fiscal_list === "neutra"
        ? false
        : null);
  if (mono === null)
    reasons.push("Falta enquadramento PIS/COFINS monofásico/lista fiscal");
  if (
    (p.fiscal_list === "neutra" && mono === true) ||
    ((p.fiscal_list === "positiva" || p.fiscal_list === "negativa") &&
      mono === false)
  )
    reasons.push("Lista fiscal e monofásico conflitantes");
  if (medicine && p.art146_zero == null)
    reasons.push("Falta confirmar enquadramento no art. 146");
  if (!medicine && p.art146_zero === true)
    reasons.push("Art. 146 sem classificação de medicamento");
  return { kind, reasons, review: reasons.length > 0, st, mono };
}

export function parseTaxBase(input: string) {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const base = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(base) && base <= 100_000_000 ? base : null;
}

export function simulateProductTax(
  p: TaxProduct,
  input: string,
  regime: "presumido" | "real",
  reducedIbs = true,
  splitPercent = 100,
) {
  const classification = classifyTaxProduct(p);
  const base = parseTaxBase(input);
  if (
    classification.review ||
    base === null ||
    !Number.isFinite(splitPercent) ||
    splitPercent < 0 ||
    splitPercent > 100
  )
    return null;
  const pisCofins = classification.mono ? 0 : regime === "real" ? 9.25 : 3.65;
  const icms = classification.st ? 0 : 20;
  const medicine = classification.kind !== "nao-medicamento";
  const cbs = p.art146_zero ? 0 : medicine ? 4.48 : 11.2;
  const ibs = p.art146_zero ? 0 : medicine && reducedIbs ? 0.04 : 0.1;
  const amount = (rate: number) => Math.round((base * rate) / 100);
  return {
    base,
    pisCofins,
    icms,
    cbs,
    ibs,
    todayRate: pisCofins + icms,
    futureRate: Number((icms + cbs + ibs).toFixed(2)),
    splitRate: Number((((cbs + ibs) * splitPercent) / 100).toFixed(4)),
    splitAmount: Math.round(((amount(cbs) + amount(ibs)) * splitPercent) / 100),
    sellerAmount:
      base - Math.round(((amount(cbs) + amount(ibs)) * splitPercent) / 100),
    todayAmount: amount(pisCofins) + amount(icms),
    futureAmount: amount(icms) + amount(cbs) + amount(ibs),
    cbs2026: amount(0.9),
    ibs2026: amount(0.1),
  };
}

export function taxMargin(
  result: NonNullable<ReturnType<typeof simulateProductTax>>,
  costInput: string,
) {
  const cost = parseTaxBase(costInput);
  if (cost === null || result.base === 0) return null;
  const beforeTax = result.base - cost;
  const todayProfit = beforeTax - result.todayAmount;
  const futureProfit = beforeTax - result.futureAmount;
  // Same final price, no credits or other expenses; the seller absorbs the delta.
  return {
    cost,
    beforeTax,
    todayProfit,
    futureProfit,
    todayMargin: (todayProfit / result.base) * 100,
    futureMargin: (futureProfit / result.base) * 100,
    profitConsumed:
      beforeTax > 0 ? (result.futureAmount / beforeTax) * 100 : null,
    priceToKeepProfit: Math.ceil(
      (cost + todayProfit) / (1 - result.futureRate / 100),
    ),
  };
}

export function summarizeTaxCatalog(
  products: TaxProduct[],
  regime: "presumido" | "real",
  reducedIbs = true,
) {
  const rows = products.map((product) => ({
    product,
    result: simulateProductTax(product, "100", regime, reducedIbs),
  }));
  const classified = rows.filter((row) => row.result !== null);
  const changes = classified.filter(
    (row) => row.result!.futureRate !== row.result!.todayRate,
  );
  const average = (key: "todayRate" | "futureRate") =>
    classified.length
      ? classified.reduce((sum, row) => sum + row.result![key], 0) /
        classified.length
      : null;
  return {
    total: products.length,
    classified: classified.length,
    review: products.length - classified.length,
    changes,
    todayAverage: average("todayRate"),
    futureAverage: average("futureRate"),
  };
}

// Fetch every page; never publish partial totals after a failed page.
export async function loadTaxCatalog(
  fetchPage: (from: number, to: number) => Promise<TaxProduct[]>,
) {
  const result: TaxProduct[] = [];
  for (let from = 0; ; from += 500) {
    const page = await fetchPage(from, from + 499);
    result.push(...page);
    if (page.length < 500) return result;
  }
}
