/**
 * Ficha pública do produto — só dados que já existem.
 *
 * Fontes usadas:
 * 1. Colunas do cadastro (`products`): princípio ativo, laboratório, fabricante,
 *    tarja, receita, controlado, lista, genérico, EAN, descrição e aviso da loja.
 *    Campo vazio não é preenchido. `sale_observation` não entra na página:
 *    no ERP isso é orientação interna de venda.
 * 2. Leitura do próprio nome cadastrado (abreviações de embalagem e concentração
 *    escritas no nome, ex.: "10CP", "500MG", "ENV"). Isso não é bula nem
 *    dosagem consultada em outra fonte.
 *
 * Fontes consultadas e não usadas na ficha:
 * - API de consultas da Anvisa (`consultas.anvisa.gov.br/api/...`) responde 403
 *   sem credencial.
 * - API CMED oficial exige token Gov.br e devolve a lista inteira, sem busca por EAN.
 * - CSV aberto `https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv`
 *   (~45 MB) não traz EAN, apresentação nem bula, e não é indexado por SKU.
 *   Baixar o arquivo inteiro a cada produto não é uma consulta confiável.
 * - Sites de laboratório e de outras farmácias não entram: não há URL de bula
 *   no cadastro e uma busca por nome parecido pode apontar para outro SKU.
 *
 * O atalho do Bulário Eletrônico é só uma busca externa. Ele não preenche
 * princípio ativo, dose nem texto de bula.
 */

export type CatalogProduct = {
  name?: string | null;
  active_ingredient?: string | null;
  laboratory?: string | null;
  manufacturer?: string | null;
  tarja?: string | null;
  requires_prescription?: boolean | null;
  controlled?: boolean | null;
  medicine_list_type?: string | null;
  is_generic?: boolean | null;
  barcode?: string | null;
  description?: string | null;
  short_description?: string | null;
  sale_observation?: string | null;
  custom_warning?: string | null;
  generic_equivalent_id?: string | null;
};

export type MedicationFact = {
  id: string;
  label: string;
  value: string;
  source: "cadastro" | "nome_cadastrado";
};

export type PublishedLink = {
  href: string;
  label: string;
};

export type MedicationFactsModel = {
  displayName: string;
  catalogName: string;
  facts: MedicationFact[];
  publishedLinks: PublishedLink[];
  anvisaSearch: { term: string; url: string } | null;
  genericLookup: boolean;
};

export const MEDICATION_FACTS_NOTE =
  "Princípio ativo, tarja, receita, lista e código de barras só aparecem quando estão no cadastro da loja. Apresentação e concentração saem do nome do produto, não de uma bula. Se a informação não está aqui, ela não foi consultada em outra fonte.";

export const ANVISA_BULARIO_ORIGIN = "https://consultas.anvisa.gov.br/#/bulario/";

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "por", "a", "o", "as", "os"]);

const FORM_WORDS: Record<string, string> = {
  ENV: "envelope",
  ENVELOPE: "envelope",
  CX: "caixa",
  CAIXA: "caixa",
  FR: "frasco",
  FRASCO: "frasco",
  AMP: "ampola",
  AMPOLA: "ampola",
  XPE: "xarope",
  XAROPE: "xarope",
  SUSP: "suspensão",
  SUSPENSAO: "suspensão",
  POM: "pomada",
  POMADA: "pomada",
  CREM: "creme",
  CREME: "creme",
  GEL: "gel",
  SPRAY: "spray",
  SOL: "solução",
  SOLUCAO: "solução",
  INJ: "injetável",
  INJETAVEL: "injetável",
  GTS: "gotas",
  GOTAS: "gotas",
};

const COUNT_UNITS: Record<string, [string, string]> = {
  CP: ["comprimido", "comprimidos"],
  CPR: ["comprimido", "comprimidos"],
  COMP: ["comprimido", "comprimidos"],
  CAP: ["cápsula", "cápsulas"],
  CAPS: ["cápsula", "cápsulas"],
  ENV: ["envelope", "envelopes"],
  AMP: ["ampola", "ampolas"],
  DRG: ["drágea", "drágeas"],
};

const SEARCH_STOP = new Set([
  "envelope", "envelopes", "comprimido", "comprimidos", "capsula", "cápsula", "cápsulas",
  "xarope", "suspensão", "suspensao", "pomada", "creme", "solução", "solucao",
  "injetável", "injetavel", "gotas", "ampola", "ampolas", "caixa", "frasco", "drágea", "drágeas",
  "ml", "mg", "mcg", "g", "ui", "kg", "gel", "spray",
]);

function clean(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function isShouty(value: string): boolean {
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  return letters === letters.toLocaleUpperCase("pt-BR") && letters !== letters.toLocaleLowerCase("pt-BR");
}

function titleToken(token: string, index: number): string {
  const pieces = token.split(/([/-])/);
  return pieces.map((piece, pieceIndex) => {
    if (piece === "/" || piece === "-") return piece;
    const lower = piece.toLocaleLowerCase("pt-BR");
    if (!lower) return piece;
    if (index > 0 && pieceIndex === 0 && SMALL_WORDS.has(lower)) return lower;
    return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
  }).join("");
}

function humanizeShoutyToken(token: string, index: number): string {
  if (token.includes("+")) {
    return token.split("+").map((part, partIndex) => humanizeShoutyToken(part, index + partIndex)).join(" + ");
  }
  if (/^[\d.,%/]+$/.test(token)) return token;

  const comCount = token.match(/^C\/(\d+)(CP|CPR|COMP|CAP|CAPS|ENV|AMP|DRG)$/i);
  if (comCount) {
    const amount = Number(comCount[1]);
    const pair = COUNT_UNITS[comCount[2].toUpperCase()];
    return `com ${amount} ${amount === 1 ? pair[0] : pair[1]}`;
  }

  const ratio = token.match(/^(\d+(?:[.,]\d+)?)(MG|MCG|G|UI)\/(\d+(?:[.,]\d+)?)?(MG|MCG|G|ML|UI)$/i);
  if (ratio) {
    const rightAmount = ratio[3] ? `${ratio[3]} ` : "";
    return `${ratio[1]} ${ratio[2].toLowerCase()}/${rightAmount}${ratio[4].toLowerCase()}`;
  }

  const dose = token.match(/^(\d+(?:[.,]\d+)?)(MG|ML|MCG|G|UI|KG)$/i);
  if (dose) return `${dose[1]} ${dose[2].toLowerCase()}`;

  const count = token.match(/^(\d+)(CP|CPR|COMP|CAP|CAPS|ENV|AMP|DRG)$/i);
  if (count) {
    const amount = Number(count[1]);
    const pair = COUNT_UNITS[count[2].toUpperCase()];
    return `${count[1]} ${amount === 1 ? pair[0] : pair[1]}`;
  }

  const form = FORM_WORDS[fold(token)];
  if (form && !/^\d/.test(token)) return form;

  const lowerWord = token.toLocaleLowerCase("pt-BR");
  if (index > 0 && SMALL_WORDS.has(lowerWord)) return lowerWord;

  const letters = token.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length > 0 && letters.length <= 3 && letters === letters.toLocaleUpperCase("pt-BR")) return token.toLocaleUpperCase("pt-BR");
  return titleToken(token, index);
}

/** Humaniza caixa alta do ERP. Não corrige acento, não troca o produto e não cria dose. */
export function humanizeCatalogName(name: string): string {
  const trimmed = clean(name);
  if (!trimmed || !isShouty(trimmed)) return trimmed;
  return trimmed.split(" ").map((token, index) => humanizeShoutyToken(token, index)).join(" ");
}

function plural(amount: number, pair: [string, string]): string {
  return `${amount} ${amount === 1 ? pair[0] : pair[1]}`;
}

export type CatalogReading = {
  presentation: string | null;
  concentration: string | null;
};

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

/** Lê embalagem e concentração somente de tokens que já estão no nome. */
export function readCatalogName(name: string): CatalogReading {
  const tokens = clean(name).toUpperCase().split(/\s+/).map((token) => token.replace(/^[^A-Z0-9%,./]+|[^A-Z0-9%]+$/g, "")).filter(Boolean);
  let form: string | null = null;
  let quantity: string | null = null;
  let volume: string | null = null;
  let concentration: string | null = null;

  for (const token of tokens) {
    const ratio = token.match(/^(\d+(?:[.,]\d+)?)(MG|MCG|G|UI)\/(\d+(?:[.,]\d+)?)?(MG|MCG|G|ML|UI)$/);
    if (ratio && !concentration) {
      const rightAmount = ratio[3] ? `${ratio[3]} ` : "";
      concentration = `${ratio[1]} ${ratio[2].toLowerCase()}/${rightAmount}${ratio[4].toLowerCase()}`;
      continue;
    }

    const dose = token.match(/^(\d+(?:[.,]\d+)?)(MG|MCG|UI|G)$/);
    if (dose && !concentration) {
      concentration = `${dose[1]} ${dose[2].toLowerCase()}`;
      continue;
    }

    const percent = token.match(/^(\d+(?:[.,]\d+)?)%$/);
    if (percent && !concentration) {
      concentration = `${percent[1]}%`;
      continue;
    }

    const volumeMatch = token.match(/^(\d+(?:[.,]\d+)?)ML$/);
    if (volumeMatch && !volume) {
      volume = `${volumeMatch[1]} ml`;
      continue;
    }

    const count = token.match(/^(?:C\/)?(\d+)(CP|CPR|COMP|CAP|CAPS|ENV|AMP|DRG)$/);
    if (count && !quantity) {
      quantity = plural(Number(count[1]), COUNT_UNITS[count[2]]);
      continue;
    }

    const word = FORM_WORDS[fold(token)];
    if (word && !form && !/^\d/.test(token)) form = word;
  }

  let presentation: string | null = null;
  if (form && quantity) presentation = `${capitalize(form)} com ${quantity}`;
  else if (quantity && volume) presentation = `${capitalize(quantity)} · ${volume}`;
  else if (quantity) presentation = capitalize(quantity);
  else if (form && volume) presentation = `${capitalize(form)} com ${volume}`;
  else if (form) presentation = capitalize(form);
  else if (volume) presentation = volume;

  return { presentation, concentration };
}

export function tarjaLabel(value: string | null | undefined): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const folded = fold(raw);
  if (folded === "VERMELHA" || folded === "TARJA VERMELHA") return "Tarja vermelha";
  if (folded === "PRETA" || folded === "TARJA PRETA") return "Tarja preta";
  if (folded === "SEM TARJA") return "Sem tarja";
  if (folded === "VENDA LIVRE") return "Venda livre";
  return raw;
}

function prescriptionCopy(product: CatalogProduct): string | null {
  const list = clean(product.medicine_list_type);
  if (product.controlled || list) {
    return list
      ? `Controlado no cadastro da loja (lista ${list}). A compra exige receita e conferência da farmácia.`
      : "Controlado no cadastro da loja. A compra exige receita e conferência da farmácia.";
  }
  if (product.requires_prescription) {
    return "Exige receita no cadastro da loja. O envio é analisado pela farmácia antes da liberação.";
  }
  return null;
}

function laboratoryLine(product: CatalogProduct): string | null {
  const lab = clean(product.laboratory);
  const maker = clean(product.manufacturer);
  if (lab && maker && fold(lab) !== fold(maker)) {
    return `${humanizeCatalogName(lab)} · ${humanizeCatalogName(maker)}`;
  }
  const chosen = lab || maker;
  return chosen ? humanizeCatalogName(chosen) : null;
}

function barcodeLabel(value: string | null | undefined): string | null {
  const digits = clean(value).replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  return digits;
}

function extractPublishedLinks(blobs: string[]): PublishedLink[] {
  const seen = new Set<string>();
  const links: PublishedLink[] = [];
  const urlRe = /https?:\/\/[^\s)<>"']+/gi;
  for (const blob of blobs) {
    const text = blob || "";
    for (const match of text.matchAll(urlRe)) {
      const href = match[0].replace(/[.,;:]+$/, "");
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const around = text.slice(Math.max(0, (match.index ?? 0) - 80), (match.index ?? 0) + href.length + 80);
      const callsItselfBula = /bula|bul[aá]rio|package[-_\s]?insert/i.test(`${href} ${around}`);
      const isPdf = /\.pdf($|\?)/i.test(href);
      links.push({
        href,
        label: callsItselfBula ? "Bula publicada no cadastro" : isPdf ? "Documento publicado no cadastro" : "Link publicado no cadastro",
      });
    }
  }
  return links;
}

export function hasMedicationSignal(product: CatalogProduct): boolean {
  return Boolean(
    clean(product.active_ingredient)
    || product.requires_prescription
    || product.controlled
    || clean(product.tarja)
    || clean(product.medicine_list_type)
    || product.is_generic,
  );
}

export function anvisaSearchTerm(rawName: string): string | null {
  const display = humanizeCatalogName(rawName);
  const tokens = display.split(/\s+/).filter((token) => {
    const normalized = token.toLocaleLowerCase("pt-BR").replace(/[.,]/g, "");
    if (normalized.length < 2) return false;
    if (SEARCH_STOP.has(normalized)) return false;
    if (/^\d/.test(normalized)) return false;
    return true;
  });
  const term = tokens.slice(0, 3).join(" ").trim();
  return term.length >= 3 ? term : null;
}

export function anvisaBularioSearchUrl(term: string): string {
  return `https://consultas.anvisa.gov.br/#/bulario/q/?nomeProduto=${encodeURIComponent(term)}`;
}

export function buildMedicationFacts(product: CatalogProduct): MedicationFactsModel {
  const catalogName = clean(product.name);
  const displayName = humanizeCatalogName(catalogName);
  const reading = readCatalogName(catalogName);
  const facts: MedicationFact[] = [];

  const ingredient = clean(product.active_ingredient);
  if (ingredient) {
    facts.push({ id: "ingredient", label: "Princípio ativo", value: humanizeCatalogName(ingredient), source: "cadastro" });
  }
  if (reading.presentation) {
    facts.push({ id: "presentation", label: "Apresentação", value: reading.presentation, source: "nome_cadastrado" });
  }
  if (reading.concentration) {
    facts.push({ id: "concentration", label: "Concentração no nome", value: reading.concentration, source: "nome_cadastrado" });
  }
  const lab = laboratoryLine(product);
  if (lab) facts.push({ id: "lab", label: "Laboratório", value: lab, source: "cadastro" });

  const tarja = tarjaLabel(product.tarja);
  if (tarja) facts.push({ id: "tarja", label: "Tarja", value: tarja, source: "cadastro" });

  const prescription = prescriptionCopy(product);
  if (prescription) facts.push({ id: "prescription", label: "Receita", value: prescription, source: "cadastro" });

  if (product.is_generic) {
    facts.push({ id: "generic", label: "Genérico", value: "Marcado como genérico no cadastro da loja.", source: "cadastro" });
  }

  const barcode = barcodeLabel(product.barcode);
  if (barcode) facts.push({ id: "barcode", label: "Código de barras", value: barcode, source: "cadastro" });

  const warning = clean(product.custom_warning);
  if (warning) facts.push({ id: "warning", label: "Aviso da loja", value: warning, source: "cadastro" });

  const term = hasMedicationSignal(product) ? anvisaSearchTerm(catalogName) : null;
  const genericLookup = Boolean(clean(product.active_ingredient).length >= 3 || clean(product.generic_equivalent_id));

  return {
    displayName: displayName || catalogName,
    catalogName,
    facts,
    publishedLinks: extractPublishedLinks([product.description || "", product.short_description || ""]),
    anvisaSearch: term ? { term, url: anvisaBularioSearchUrl(term) } : null,
    genericLookup,
  };
}
