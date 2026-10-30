export type ManufacturerOption = {
  /** Fuller name already stored in the catalog. Nothing is invented. */
  label: string;
  /** Raw `products.manufacturer` values grouped under that label. */
  values: string[];
};

export function normalizeManufacturerKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Groups truncated catalog labels with a longer sibling already present
 * in the same list (OPELLA/SAN + OPELLA/SANOFI, UNIAO + UNIAO QUIMICA).
 * A name is never expanded from an external dictionary.
 */
export function sameManufacturer(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const shortTokens = short.split(" ");
  const longTokens = long.split(" ");
  if (shortTokens.length === 0 || shortTokens.length > longTokens.length) return false;

  for (let i = 0; i < shortTokens.length - 1; i += 1) {
    if (shortTokens[i] !== longTokens[i]) return false;
  }

  const shortLast = shortTokens[shortTokens.length - 1];
  const longLast = longTokens[shortTokens.length - 1];
  if (!shortLast || !longLast) return false;

  if (shortLast === longLast) {
    return short.length >= 5 && longTokens.length > shortTokens.length;
  }

  if (!longLast.startsWith(shortLast) || shortLast.length < 3) return false;
  if (shortLast.length >= 8) return true;
  if (short.length >= 8 && short.length / long.length >= 0.62) return true;
  return shortLast.length >= 4 && shortLast.length / longLast.length >= 0.6;
}

function canonicalLabel(values: string[]): string {
  return values.slice().sort((a, b) => {
    const ak = normalizeManufacturerKey(a);
    const bk = normalizeManufacturerKey(b);
    if (bk.length !== ak.length) return bk.length - ak.length;
    if (b.length !== a.length) return b.length - a.length;
    return a.localeCompare(b, "pt-BR");
  })[0];
}

export function groupManufacturers(raw: string[]): ManufacturerOption[] {
  const unique = Array.from(new Set(raw.map((value) => value.trim()).filter(Boolean)));
  const items = unique.map((original) => ({
    original,
    key: normalizeManufacturerKey(original),
  })).filter((item) => item.key);

  const parent = items.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (sameManufacturer(items[i].key, items[j].key)) union(i, j);
    }
  }

  const buckets = new Map<number, string[]>();
  items.forEach((item, index) => {
    const root = find(index);
    const list = buckets.get(root) ?? [];
    list.push(item.original);
    buckets.set(root, list);
  });

  return Array.from(buckets.values())
    .map((values) => ({
      label: canonicalLabel(values),
      values: values.slice().sort((a, b) => a.localeCompare(b, "pt-BR")),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
