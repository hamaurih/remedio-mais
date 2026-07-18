// Central helper for product data quality, publication status and score.
// Focused on SELLABLE products (com estoque, ativos). Sem estoque = fora do site
// e fora da análise principal de qualidade.

export type StrictMode = "off" | "strict";

export type QualitySettings = {
  strict_mode: StrictMode;
  default_image_url: string; // fallback exibido no site quando o produto não tem imagem própria
};

export const DEFAULT_PLACEHOLDER = "/placeholder.svg";

export const DEFAULT_QUALITY_SETTINGS: QualitySettings = {
  strict_mode: "off",
  default_image_url: DEFAULT_PLACEHOLDER,
};

export type PublicationStatus =
  | "published"
  | "published_with_warning"
  | "hidden_missing_required"
  | "hidden_out_of_stock"
  | "hidden_manual"
  | "hidden_inactive";

export type QualityProduct = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  price?: number | null;
  stock?: number | null;
  stock_quantity?: number | null;
  active?: boolean | null;
  trier_active?: boolean | null;
  manual_disabled?: boolean | null;
  publish_even_incomplete?: boolean | null;
  image_url?: string | null;
  gallery_images?: string[] | null;
  barcode?: string | null;
  short_description?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  laboratory?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  active_ingredient?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  tags?: string | null;
  requires_prescription?: boolean | null;
  controlled?: boolean | null;
};

const nonEmpty = (v: unknown) =>
  v !== null && v !== undefined && String(v).trim().length > 0;

const PLACEHOLDER_RE = /placeholder|no-image|sem-imagem/i;

export function effectiveStock(p: QualityProduct): number {
  const s = p.stock_quantity ?? p.stock ?? 0;
  return Number(s) || 0;
}

/** Imagem própria do produto (não é o placeholder padrão). */
export function hasOwnImage(p: QualityProduct): boolean {
  const url = (p.image_url ?? "").trim();
  if (!url) return false;
  if (PLACEHOLDER_RE.test(url)) return false;
  return true;
}

/** Imagem exibível no site: própria OU imagem padrão configurada. */
export function hasDisplayImage(
  p: QualityProduct,
  settings: QualitySettings = DEFAULT_QUALITY_SETTINGS,
): boolean {
  if (hasOwnImage(p)) return true;
  // Se o site tem um placeholder configurado, o produto ainda é exibível.
  return nonEmpty(settings.default_image_url);
}

export function usesPlaceholderImage(
  p: QualityProduct,
  settings: QualitySettings = DEFAULT_QUALITY_SETTINGS,
): boolean {
  return !hasOwnImage(p) && hasDisplayImage(p, settings);
}

/** Produto potencialmente vendável: ativo em todos os canais e com estoque. */
export function isSellable(p: QualityProduct): boolean {
  if (p.active === false) return false;
  if (p.trier_active === false) return false;
  if (p.manual_disabled === true) return false;
  return effectiveStock(p) > 0;
}

// Peso reduzido para imagem própria — não bloqueia, apenas influencia score.
const SCORE_FIELDS: { key: string; weight: number; check: (p: QualityProduct) => boolean }[] = [
  { key: "own_image", weight: 8, check: hasOwnImage },
  { key: "barcode", weight: 12, check: (p) => nonEmpty(p.barcode) },
  { key: "short_description", weight: 8, check: (p) => nonEmpty(p.short_description) },
  { key: "description", weight: 14, check: (p) => (p.description ?? "").trim().length >= 40 },
  { key: "manufacturer", weight: 8, check: (p) => nonEmpty(p.manufacturer) || nonEmpty(p.laboratory) },
  { key: "category", weight: 12, check: (p) => nonEmpty(p.category_id) || nonEmpty(p.category_name) },
  { key: "active_ingredient", weight: 8, check: (p) => nonEmpty(p.active_ingredient) },
  { key: "seo_title", weight: 6, check: (p) => nonEmpty(p.seo_title) },
  { key: "seo_description", weight: 6, check: (p) => nonEmpty(p.seo_description) },
  { key: "tags", weight: 4, check: (p) => nonEmpty(p.tags) },
  { key: "gallery", weight: 6, check: (p) => Array.isArray(p.gallery_images) && p.gallery_images.length > 0 },
  { key: "prescription_flag", weight: 3, check: (p) => p.requires_prescription !== null && p.requires_prescription !== undefined },
  { key: "controlled_flag", weight: 5, check: (p) => p.controlled !== null && p.controlled !== undefined },
];

export function computeQualityScore(p: QualityProduct): { score: number; missing: string[] } {
  let total = 0;
  let earned = 0;
  const missing: string[] = [];
  for (const f of SCORE_FIELDS) {
    total += f.weight;
    if (f.check(p)) earned += f.weight;
    else missing.push(f.key);
  }
  const score = Math.round((earned / total) * 100);
  return { score, missing };
}

/** Mínimos absolutos para venda. */
export function missingRequired(
  p: QualityProduct,
  settings: QualitySettings = DEFAULT_QUALITY_SETTINGS,
): string[] {
  const miss: string[] = [];
  if (!nonEmpty(p.name)) miss.push("name");
  if (!(Number(p.price) > 0)) miss.push("price");
  if (!nonEmpty(p.category_id) && !nonEmpty(p.category_name)) miss.push("category");
  if (!hasDisplayImage(p, settings)) miss.push("image");
  return miss;
}

/** Aba mais relevante do editor para corrigir o primeiro problema. */
export function suggestedEditTab(p: QualityProduct): "basic" | "images" | "seo" | "price" | "stock" {
  if (!hasOwnImage(p)) return "images";
  if (!nonEmpty(p.category_id) && !nonEmpty(p.category_name)) return "basic";
  if (!(Number(p.price) > 0)) return "price";
  if (effectiveStock(p) <= 0) return "stock";
  if (!nonEmpty(p.description) || (p.description ?? "").trim().length < 40) return "basic";
  if (!nonEmpty(p.seo_title) || !nonEmpty(p.seo_description)) return "seo";
  return "basic";
}

export function getPublicationStatus(
  p: QualityProduct,
  settings: QualitySettings = DEFAULT_QUALITY_SETTINGS,
): { status: PublicationStatus; reason: string; missing: string[] } {
  if (p.active === false) return { status: "hidden_inactive", reason: "Produto inativo", missing: [] };
  if (p.trier_active === false) return { status: "hidden_inactive", reason: "Inativo no Trier", missing: [] };
  if (p.manual_disabled === true) return { status: "hidden_manual", reason: "Ocultado manualmente", missing: [] };

  const required = missingRequired(p, settings);
  if (required.length > 0) {
    return { status: "hidden_missing_required", reason: `Falta: ${required.join(", ")}`, missing: required };
  }

  if (effectiveStock(p) <= 0) {
    return { status: "hidden_out_of_stock", reason: "Sem estoque — não aparece no site", missing: [] };
  }

  const { score, missing } = computeQualityScore(p);
  const whitelisted = p.publish_even_incomplete === true;

  // Modo rigoroso opcional (padrão: off).
  if (settings.strict_mode === "strict" && score < 100 && !whitelisted) {
    return {
      status: "hidden_missing_required",
      reason: `Modo rigoroso: score ${score}% (< 100%)`,
      missing,
    };
  }

  if (usesPlaceholderImage(p, settings)) {
    return {
      status: "published_with_warning",
      reason: `Usa imagem padrão — ${score}% completo`,
      missing: ["own_image", ...missing.filter((m) => m !== "own_image")],
    };
  }

  if (missing.length > 0) {
    return {
      status: "published_with_warning",
      reason: `${score}% completo — falta ${missing.slice(0, 3).join(", ")}`,
      missing,
    };
  }

  return { status: "published", reason: "Cadastro completo", missing: [] };
}

export function isProductPubliclyVisible(
  p: QualityProduct,
  settings: QualitySettings = DEFAULT_QUALITY_SETTINGS,
): boolean {
  const s = getPublicationStatus(p, settings).status;
  return s === "published" || s === "published_with_warning";
}

export const STATUS_META: Record<PublicationStatus, { label: string; tone: string }> = {
  published: { label: "Publicado", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  published_with_warning: { label: "Publicado c/ alerta", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  hidden_missing_required: { label: "Oculto — dados faltando", tone: "bg-rose-100 text-rose-800 border-rose-200" },
  hidden_out_of_stock: { label: "Sem estoque", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  hidden_manual: { label: "Ocultado manualmente", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  hidden_inactive: { label: "Inativo", tone: "bg-slate-200 text-slate-800 border-slate-300" },
};

export function scoreTone(score: number): string {
  if (score >= 90) return "bg-emerald-100 text-emerald-800";
  if (score >= 70) return "bg-lime-100 text-lime-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}
