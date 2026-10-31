import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const auth = readFileSync("src/pages/Auth.tsx","utf8");
const fab = readFileSync("src/components/WhatsAppFab.tsx","utf8");
const cart = readFileSync("src/pages/Cart.tsx","utf8");
const hero = readFileSync("src/components/HeroPromoCarousel.tsx","utf8");
const shelf = readFileSync("src/components/ProductShelf.tsx","utf8");
const footer = readFileSync("src/components/Footer.tsx","utf8");
const filters = readFileSync("src/components/ProductFilters.tsx","utf8");
const search = readFileSync("src/components/SearchAutocomplete.tsx","utf8");
const css = readFileSync("src/index.css","utf8");

describe("storefront low UX audit completion", () => {
  it("B1 keeps auth compact", () => {
    expect(auth).toContain("max-w-md");
  });

  it("B2 keeps the desktop WhatsApp FAB away from the footer", () => {
    expect(fab).toContain("footerVisible");
    expect(fab).toContain('document.querySelector("footer")');
    expect(fab).toContain("IntersectionObserver");
    expect(fab).toContain("bottom-6 right-6");
  });

  it("B3 enriches the empty cart", () => {
    expect(cart).toContain("Ver ofertas");
    expect(cart).toContain("empty-cart-bestsellers");
    expect(cart).toContain("Mais vendidos");
    expect(cart).toContain("h-28 w-28");
  });

  it("B4 enlarges carousel and navigation touch targets", () => {
    expect(hero).toContain('className="h-11 w-11 inline-flex items-center justify-center rounded-full"');
    expect(shelf).toContain("min-h-11");
    expect(footer).toContain("min-h-11");
  });

  it("B5 keeps Inter for body and Poppins for headings", () => {
    expect(css).toContain("font-family: 'Inter'");
    expect(css).toContain("h1, h2, h3, h4");
    expect(css).toContain("font-family: 'Poppins'");
  });

  it("B6 opens only the main filter group by default", () => {
    expect(filters).toContain('defaultValue={["principal"]}');
    expect(filters).not.toContain('defaultValue={["principal", "preco", "marca"]}');
  });

  it("B7 uses a shorter mobile search placeholder", () => {
    expect(search).toContain('compact ? "Buscar produto, marca ou código"');
    expect(search).toContain('"Busque por produto, marca, princípio ativo ou código de barras"');
  });
});
