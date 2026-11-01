// Busca do catálogo WhatsApp.
// Pura (sem Deno/Supabase) para o edge function e para o teste unitário.
//
// O filtro do PostgREST usa vírgula como separador. Um termo como
// "levonorgestrel 1,5mg" dentro de `.or(name.ilike.%1,5mg%)` vira um
// pedaço inválido e a API responde query_failed. Valores com vírgula,
// ponto ou parêntese vão entre aspas duplas.
//
// Várias palavras deixam de exigir o nome inteiro colado: cada termo
// significativo precisa aparecer (AND) em nome, fabricante, princípio
// ativo ou tags, com acento opcional e dose no jeito que o cliente escreve
// ("1 grama" casa com "1G", "1,5mg" casa com "1.5mg").

export const CATALOG_SEARCH_COLUMNS = [
  "name",
  "manufacturer",
  "active_ingredient",
  "tags",
] as const;

export const STOCK_SOURCE = "sistema";

export const STOCK_DISCLAIMER =
  "Estoque informado é pelo sistema e pode divergir da loja física. Confirme na loja.";

export function stockSystemMessage(stock: number): string {
  const n = Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0;
  return `Pelo sistema temos ${n} unidades; confirme na loja.`;
}

export function catalogEnvelopeMessage(count: number, hasPrescriptionItem: boolean): string {
  if (count === 0) {
    return "Nenhum produto encontrado com esse nome no catálogo disponível. Tente um termo mais curto ou parcial.";
  }
  const base = hasPrescriptionItem
    ? "Produtos encontrados. Há itens sujeitos à apresentação de receita."
    : "Produtos encontrados.";
  return `${base} ${STOCK_DISCLAIMER}`;
}

const STOPWORDS = new Set([
  "a", "o", "os", "as", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "para", "pra", "pro", "por", "com", "sem", "que", "qual", "quais",
  "quanto", "quantos", "quanta", "preco", "valor", "fica", "ficar",
  "ta", "esta", "este", "esse", "essa", "isso", "tem", "tenho", "ter",
  "voces", "voce", "vc", "vcs", "bom", "boa", "dia", "tarde", "noite",
  "ola", "oi", "favor", "pfv", "pf", "algum", "alguma", "alguns",
  "medicamento", "remedio", "produto", "produtos", "me", "meu", "minha",
  "quero", "queria", "precisa", "preciso", "saber", "sobre", "onde",
  "aqui", "loja", "farmacia", "manda", "mandar", "foto", "porfavor",
  "sim", "nao", "ok", "por", "gentileza",
]);

// Palavras que o cliente acrescenta e que muitas vezes não estão no nome
// cadastrado ("fralda xg infantil"). Entram no ranking, não no AND,
// desde que sobre pelo menos um termo obrigatório.
const SOFT_TOKENS = new Set([
  "infantil", "adulto", "adulta", "adultos", "bebe", "crianca",
  "grande", "pequeno", "pequena", "pacote", "pacotao", "caixa",
  "generico", "similar", "referencia", "original", "desconto",
  "barato", "barata", "oleo", "peixe", "capsula", "capsulas",
  "comprimido", "comprimidos", "dragea", "gotas", "xarope",
  "creme", "pomada", "gel", "spray", "aerosol", "locao", "fita",
  "hiper", "jumbo", "ultra", "unidade", "unidades", "cp", "cps",
  "cap", "caps", "un", "und",
]);

const ACCENT_CLASS: Record<string, string> = {
  a: "aAáàâãäÁÀÂÃÄ",
  e: "eEéèêëÉÈÊË",
  i: "iIíìîïÍÌÎÏ",
  o: "oOóòôõöÓÒÔÕÖ",
  u: "uUúùûüÚÙÛÜ",
  c: "cCçÇ",
  n: "nNñÑ",
};

const SYMPTOM_ALIASES: Record<string, string[]> = {
  // O cadastro traz o princípio ativo, não o sintoma. Sem isso a busca
  // "candidíase" volta vazia mesmo com fluconazol, nistatina e miconazol.
  candidiase: ["fluconazol", "nistatina", "miconazol"],
};

export type CatalogFields = {
  name?: string | null;
  manufacturer?: string | null;
  active_ingredient?: string | null;
  tags?: string | null;
  barcode?: string | null;
};

export type SearchPlan = {
  text: string;
  itemIndex: number;
  kind: "literal" | "alias";
  tokens: string[];
  softTokens: string[];
  barcode: string | null;
};

export function foldCatalogText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function hasProductWord(value: string): boolean {
  return /[\p{L}]{3,}/u.test(value);
}

/** Separa itens ("dipirona, shampoo") e preserva vírgula decimal ("1,5mg"). */
export function splitCatalogItems(input: string): string[] {
  const protectedText = input.replace(/(\d)\s*,\s*(\d)/g, "$1\u0000$2");
  const parts = protectedText.split(",").map((part) => part.replace(/\u0000/g, ",").trim());
  const kept = parts.filter((part) => part.length > 0);
  if (kept.length <= 1) return kept;

  const items: string[] = [];
  let current = kept[0];
  for (let i = 1; i < kept.length; i++) {
    const next = kept[i];
    if (hasProductWord(current) && hasProductWord(next)) {
      items.push(current.trim());
      current = next;
    } else {
      current = `${current}, ${next}`;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items.filter(Boolean).slice(0, 5);
}

function normalizeDosageWords(folded: string): string {
  let s = folded.replace(/(\d)\s*[.,]\s*(\d)/g, "$1,$2");
  s = s.replace(/(\d+(?:,\d+)?)\s*gramas?\b/g, "$1g");
  s = s.replace(/(\d+(?:,\d+)?)\s*miligramas?\b/g, "$1mg");
  s = s.replace(/(\d+(?:,\d+)?)\s*microgramas?\b/g, "$1mcg");
  s = s.replace(/(\d+(?:,\d+)?)\s*mililitros?\b/g, "$1ml");
  // "1 gr" depois de "grama", senão "grama" perde o "gr".
  s = s.replace(/(\d+(?:,\d+)?)\s*gr\b/g, "$1g");
  s = s.replace(/(\d+(?:,\d+)?)\s+(mg|ml|mcg|g|l|ui|cp|un)\b/g, "$1$2");
  return s;
}

export function tokenizeCatalogQuery(raw: string): { tokens: string[]; softTokens: string[] } {
  let s = foldCatalogText(raw);
  s = normalizeDosageWords(s);
  s = s.replace(/[^\p{L}\p{N},]+/gu, " ");
  s = s.replace(/(^|\s),+|,(?!\d)/g, " ");
  const all = s.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0 && t !== ",");
  const content = all.filter((t) => !STOPWORDS.has(t));
  let required = content.filter((t) => !SOFT_TOKENS.has(t));
  const softTokens = content.filter((t) => SOFT_TOKENS.has(t));
  if (required.length === 0) required = content;
  if (required.length === 0) required = all.filter((t) => t.length >= 2);
  return { tokens: required.slice(0, 6), softTokens: softTokens.slice(0, 4) };
}

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

function symptomAliasKey(tokens: string[]): string | null {
  if (tokens.length !== 1) return null;
  const folded = foldCatalogText(tokens[0]);
  if (SYMPTOM_ALIASES[folded]) return folded;
  // "candidase", "candidiase", "candidíase" (o acento já foi removido no token).
  if (/^candidi?as[ae]s?$/.test(folded) || folded === "candidiase") return "candidiase";
  return null;
}

function planFromText(text: string, itemIndex: number, kind: SearchPlan["kind"]): SearchPlan | null {
  const { tokens, softTokens } = tokenizeCatalogQuery(text);
  const barcodeDigits = digitsOnly(text);
  const barcode = barcodeDigits.length >= 8 && barcodeDigits.length >= text.replace(/\s+/g, "").length - 2
    ? barcodeDigits
    : null;
  if (tokens.length === 0 && !barcode) return null;
  return { text, itemIndex, kind, tokens, softTokens, barcode };
}

export function buildCatalogPlans(raw: string): SearchPlan[] {
  const plans: SearchPlan[] = [];
  splitCatalogItems(raw).forEach((item, itemIndex) => {
    const literal = planFromText(item, itemIndex, "literal");
    if (!literal) return;
    plans.push(literal);
    const aliasKey = symptomAliasKey(literal.tokens);
    if (!aliasKey) return;
    for (const alias of SYMPTOM_ALIASES[aliasKey]) {
      const extra = planFromText(alias, itemIndex, "alias");
      if (extra) plans.push(extra);
    }
  });
  return plans;
}

function escapeRegexChar(ch: string): string {
  return /[\\.^$|?*+()[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

function charClass(ch: string): string {
  const folded = foldCatalogText(ch);
  const accent = ACCENT_CLASS[folded];
  if (accent) return `[${accent}]`;
  return escapeRegexChar(ch);
}

type PatternDialect = "posix" | "js";

function patternBounds(dialect: PatternDialect): { left: string; right: string; space: string } {
  // POSIX e JS não leem [[:alnum:]] do mesmo jeito. Cada um recebe a sua forma.
  const notAlnum = dialect === "posix" ? "[^[:alnum:]]" : "[^0-9A-Za-zÀ-ÿ]";
  const space = dialect === "posix" ? "[[:space:]]" : "\\s";
  return { left: `(^|${notAlnum})`, right: `(${notAlnum}|$)`, space };
}

function tokenPattern(token: string, dialect: PatternDialect): string {
  const { left, right, space } = patternBounds(dialect);
  const dosage = token.match(/^(\d+)(?:,(\d+))?([a-z]+)?$/);
  if (dosage && (dosage[2] || dosage[3])) {
    const whole = dosage[1];
    const frac = dosage[2] ? `[,.]${dosage[2]}` : "";
    const unit = dosage[3] || "";
    let unitPattern = "";
    if (unit === "g") unitPattern = `${space}*g`;
    else if (unit === "mg") unitPattern = `${space}*mg`;
    else if (unit === "ml") unitPattern = `${space}*ml`;
    else if (unit === "mcg") unitPattern = `${space}*(mcg|µg|ug)`;
    else if (unit) unitPattern = `${space}*${[...unit].map(charClass).join("")}`;
    return `${left}${whole}${frac}${unitPattern}${right}`;
  }
  const body = [...token].map(charClass).join("");
  return `${left}${body}${right}`;
}

/** Regex POSIX (~*) enviada ao PostgREST. Sem asterisco: imatch não converte * em %. */
export function tokenPosixPattern(token: string): string {
  return tokenPattern(token, "posix");
}

export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildPostgrestFilter(plan: SearchPlan): string {
  const groups = plan.tokens.map((token) => {
    const quoted = quotePostgrestValue(tokenPosixPattern(token));
    const clauses = CATALOG_SEARCH_COLUMNS.map((column) => `${column}.imatch.${quoted}`);
    return `or(${clauses.join(",")})`;
  });
  const combined = groups.length > 0 ? `and(${groups.join(",")})` : "";
  if (plan.barcode && combined) return `or(${combined},barcode.eq.${plan.barcode})`;
  if (plan.barcode) return `barcode.eq.${plan.barcode}`;
  return combined;
}

/**
 * Vírgulas fora de aspas só podem separar cláusulas do PostgREST
 * (or/and/coluna.operador), nunca o texto do cliente.
 */
export function filterCommasAreSafe(filter: string): boolean {
  let inQuotes = false;
  let escaped = false;
  for (let i = 0; i < filter.length; i++) {
    const ch = filter[i];
    if (inQuotes) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inQuotes = false;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch !== ",") continue;
    const rest = filter.slice(i + 1).trimStart();
    if (!/^(or\(|and\(|not\(|barcode\.eq\.|[a-z_]+\.(imatch|ilike|eq|fts)\.)/.test(rest)) {
      return false;
    }
  }
  return !inQuotes;
}

export function fieldMatchesToken(field: string | null | undefined, token: string): boolean {
  if (!field || !token) return false;
  return new RegExp(tokenPattern(token, "js"), "i").test(field);
}

export function productMatchesPlan(product: CatalogFields, plan: SearchPlan): boolean {
  if (plan.barcode && product.barcode && product.barcode === plan.barcode) return true;
  if (plan.tokens.length === 0) return false;
  return plan.tokens.every((token) =>
    CATALOG_SEARCH_COLUMNS.some((column) => fieldMatchesToken(product[column], token))
  );
}

export function scoreCatalogProduct(product: CatalogFields, plan: SearchPlan): number | null {
  if (!productMatchesPlan(product, plan)) return null;
  const name = product.name || "";
  let score = 0;
  if (plan.barcode && product.barcode === plan.barcode) score += 100;
  for (const token of plan.tokens) {
    score += 10;
    if (fieldMatchesToken(name, token)) score += 6;
  }
  const foldedName = foldCatalogText(name);
  const phrase = plan.tokens.join(" ");
  if (phrase && foldedName.includes(phrase)) score += 15;
  if (plan.tokens[0] && foldedName.startsWith(plan.tokens[0])) score += 6;
  for (const token of plan.softTokens) {
    if (fieldMatchesToken(name, token)) score += 2;
  }
  if (plan.kind === "alias") score -= 1;
  return score;
}

export type CatalogHit<T> = {
  id: string;
  itemIndex: number;
  planKind: "literal" | "alias";
  aliasKey: string;
  score: number;
  row: T;
};

export function selectCatalogHits<T>(hits: CatalogHit<T>[], limit: number): CatalogHit<T>[] {
  const byItem = new Map<number, CatalogHit<T>[]>();
  for (const hit of hits) {
    const list = byItem.get(hit.itemIndex) ?? [];
    list.push(hit);
    byItem.set(hit.itemIndex, list);
  }
  const itemIndexes = [...byItem.keys()].sort((a, b) => a - b);
  const itemCount = Math.max(itemIndexes.length, 1);
  const totalCap = Math.min(20, Math.max(limit, limit * itemCount));
  const perItem = Math.max(1, Math.ceil(totalCap / itemCount));
  const chosen: CatalogHit<T>[] = [];
  const seen = new Set<string>();

  const interleave = (rows: CatalogHit<T>[]) => {
    const buckets = new Map<string, CatalogHit<T>[]>();
    for (const row of rows) {
      const list = buckets.get(row.aliasKey) ?? [];
      list.push(row);
      buckets.set(row.aliasKey, list);
    }
    for (const list of buckets.values()) list.sort((a, b) => b.score - a.score || 0);
    const keys = [...buckets.keys()];
    const ordered: CatalogHit<T>[] = [];
    let index = 0;
    let added = true;
    while (added) {
      added = false;
      for (const key of keys) {
        const row = buckets.get(key)?.[index];
        if (row) {
          ordered.push(row);
          added = true;
        }
      }
      index++;
    }
    return ordered;
  };

  for (const itemIndex of itemIndexes) {
    const group = byItem.get(itemIndex) ?? [];
    const literals = group.filter((hit) => hit.planKind === "literal")
      .sort((a, b) => b.score - a.score);
    const aliases = group.filter((hit) => hit.planKind === "alias");
    const ordered = literals.length > 0 ? literals : interleave(aliases);
    let taken = 0;
    for (const hit of ordered) {
      if (seen.has(hit.id) || taken >= perItem) continue;
      seen.add(hit.id);
      chosen.push(hit);
      taken++;
    }
  }
  return chosen.slice(0, totalCap);
}
