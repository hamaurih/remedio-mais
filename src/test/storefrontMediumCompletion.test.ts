import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const productCard = readFileSync("src/components/ProductCard.tsx","utf8");
const nav = readFileSync("src/components/CategoryNav.tsx","utf8");
const productPage = readFileSync("src/pages/Product.tsx","utf8");
const medicationFacts = readFileSync("src/components/MedicationFacts.tsx","utf8");
const prescription = readFileSync("src/pages/SendPrescription.tsx","utf8");
const homeTop = readFileSync("src/components/HomeTopCta.tsx","utf8");
const search = readFileSync("src/components/SearchAutocomplete.tsx","utf8");

describe("storefront medium UX completion", () => {
  it("M1 differentiates prescription products without a usable photo", () => {
    expect(productCard).toContain("RxImageFallback");
    expect(productCard).toContain("Receita obrigatória");
    expect(productCard).toContain("if (!hasImage && requiresPrescription)");
    expect(productCard).not.toContain("image.src = productPlaceholder");
  });

  it("M3 provides a visible affordance for horizontal category scrolling", () => {
    expect(nav).toContain("bg-gradient-to-l");
    expect(nav).toContain("ChevronRight");
    expect(nav).toContain("overflow-x-auto");
    expect(nav).toContain("pr-8");
  });

  it("M5 keeps listings paginated", () => {
    const category = readFileSync("src/pages/Category.tsx","utf8");
    const searchPage = readFileSync("src/pages/Search.tsx","utf8");
    expect(category).toContain("ListingPagination");
    expect(category).toContain("listingRange(page)");
    expect(searchPage).toContain("listingRange(page)");
  });

  it("M6 keeps manufacturer search and normalization", () => {
    const filters = readFileSync("src/components/ProductFilters.tsx","utf8");
    expect(filters).toContain("groupManufacturers");
    expect(filters).toContain("normalizeManufacturerKey");
    expect(filters).toContain("labQuery");
  });

  it("M7 keeps H1 and accessible search labels", () => {
    expect(homeTop).toContain("<h1");
    expect(search).toContain('className="sr-only">Buscar produtos</label>');
    expect(search).toContain('aria-label="Buscar produtos por nome, marca, princípio ativo ou código de barras"');
  });

  it("M8 keeps the enriched medication product page", () => {
    expect(productPage).toContain("md:grid-cols-12");
    expect(productPage).toContain("md:col-span-5");
    expect(productPage).toContain("md:col-span-7");
    expect(productPage).toContain("<MedicationFacts");
    expect(productPage).toContain("<ProductShippingQuote");
    expect(medicationFacts).toContain("Genéricos no nosso catálogo");
    expect(medicationFacts).toContain("Bulário da Anvisa");
    expect(medicationFacts).not.toContain("text-[11px]");
  });

  it("M9 explains prescription upload before login", () => {
    expect(prescription).toContain("Dá para ler esta página sem login");
    expect(prescription).toContain("A conta é pedida apenas no envio da receita");
  });
});
