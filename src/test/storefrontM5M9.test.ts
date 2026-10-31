import { describe, expect, it, vi } from "vitest";
import { groupManufacturers } from "@/lib/manufacturerFacet";
import { listingRange, pageCount } from "@/lib/listingPage";
import { buildMedicationFacts, humanizeCatalogName, readCatalogName } from "@/lib/medicationFacts";
// Pure filter serialization tests do not initialize auth or a real backend.
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get() { throw new Error("Backend disabled in filter unit tests"); } }) }));
import { buildQuery, defaultFilters } from "@/components/ProductFilters";

describe("paginação da vitrine", () => {
  it("mantém a primeira página curta", () => {
    expect(listingRange(1)).toEqual({ page: 1, from: 0, to: 23 });
    expect(pageCount(240)).toBe(10);
    expect(pageCount(0)).toBe(1);
  });
});

describe("laboratório / marca", () => {
  it("agrupa truncamentos e prefere o nome mais completo que já existe", () => {
    const groups = groupManufacturers([
      "OPELLA/SAN",
      "OPELLA/SANOFI",
      "CATARINENS",
      "CATARINENSE",
      "UNIAO",
      "UNIAO QUIMICA",
      "MEDLEY",
      "MEDLEY FARMACEUTICA",
      "ACHE/BIOSIN",
      "ACHE/BIOSINTETICA",
      "SANOFI",
      "SANDOZ",
    ]);
    const labels = groups.map((group) => group.label);
    expect(labels).toContain("OPELLA/SANOFI");
    expect(labels).toContain("CATARINENSE");
    expect(labels).toContain("UNIAO QUIMICA");
    expect(labels).toContain("MEDLEY FARMACEUTICA");
    expect(labels).toContain("ACHE/BIOSINTETICA");
    expect(labels).not.toContain("OPELLA/SAN");
    expect(labels).not.toContain("CATARINENS");
    expect(groups.find((group) => group.label === "SANOFI")?.values).toEqual(["SANOFI"]);
    expect(groups.find((group) => group.label === "SANDOZ")?.values).toEqual(["SANDOZ"]);
    expect(groups.find((group) => group.label === "OPELLA/SANOFI")?.values.sort()).toEqual(["OPELLA/SAN", "OPELLA/SANOFI"]);
  });
});

describe("ficha do medicamento", () => {
  it("humaniza o nome do ERP sem inventar acento ou princípio ativo", () => {
    expect(humanizeCatalogName("DORFLEX ENV 10CP")).toBe("Dorflex envelope 10 comprimidos");
    expect(humanizeCatalogName("DIPIRONA+CAFEINA+CITRATO DE ORFENADRINA")).toBe("Dipirona + Cafeina + Citrato de Orfenadrina");
    expect(humanizeCatalogName("Dipirona 500 mg")).toBe("Dipirona 500 mg");
    expect(humanizeCatalogName("GSK")).toBe("GSK");
    const facts = buildMedicationFacts({ name: "DORFLEX ENV 10CP", manufacturer: "SANOFI" });
    expect(facts.displayName).toBe("Dorflex envelope 10 comprimidos");
    expect(facts.facts.map((fact) => fact.id)).not.toContain("ingredient");
    expect(facts.anvisaSearch).toBeNull();
    expect(readCatalogName("DORFLEX ENV 10CP")).toEqual({
      presentation: "Envelope com 10 comprimidos",
      concentration: null,
    });
  });

  it("mostra concentração e receita só quando o dado existe", () => {
    expect(readCatalogName("PARACETAMOL 500MG 10CP")).toEqual({
      presentation: "10 comprimidos",
      concentration: "500 mg",
    });
    const facts = buildMedicationFacts({
      name: "PARACETAMOL 500MG 10CP",
      active_ingredient: "PARACETAMOL",
      requires_prescription: false,
      controlled: true,
      tarja: "vermelha",
      barcode: "7891234567895",
      description: "Bula em https://exemplo.com/bula.pdf.",
    });
    const byId = Object.fromEntries(facts.facts.map((fact) => [fact.id, fact.value]));
    expect(byId.ingredient).toBe("Paracetamol");
    expect(byId.presentation).toBe("10 comprimidos");
    expect(byId.concentration).toBe("500 mg");
    expect(byId.tarja).toBe("Tarja vermelha");
    expect(byId.prescription).toMatch(/Controlado/);
    expect(byId.barcode).toBe("7891234567895");
    expect(facts.publishedLinks[0]?.label).toBe("Bula publicada no cadastro");
    expect(facts.anvisaSearch?.term).toBe("Paracetamol");
    expect(facts.anvisaSearch?.url).toContain("nomeProduto=Paracetamol");
  });

  it("não trata link comum como bula e não chama venda livre quando a flag é falsa", () => {
    const facts = buildMedicationFacts({
      name: "SHAMPOO",
      requires_prescription: false,
      description: "Mais em https://exemplo.com/produto",
    });
    expect(facts.facts.map((fact) => fact.id)).not.toContain("prescription");
    expect(facts.publishedLinks[0]?.label).toBe("Link publicado no cadastro");
    expect(facts.anvisaSearch).toBeNull();
    const boxed = buildMedicationFacts({
      name: "ACICLOVIR 200MG C/25CP",
      sale_observation: "OFERECER GENERICO.",
      requires_prescription: false,
    });
    expect(boxed.displayName).toBe("Aciclovir 200 mg com 25 comprimidos");
    expect(boxed.facts.find((fact) => fact.id === "presentation")?.value).toBe("25 comprimidos");
    expect(boxed.facts.map((fact) => fact.id)).not.toContain("sale");
  });
});

describe("filtros no servidor", () => {
  it("envia tipo de venda e genérico para a consulta paginada", () => {
    const calls: string[] = [];
    const query: any = {
      eq: (column: string, value: unknown) => {
        calls.push(`eq:${column}:${String(value)}`);
        return query;
      },
      or: (value: string) => {
        calls.push(`or:${value}`);
        return query;
      },
      in: () => query,
      gt: () => query,
      gte: () => query,
      lte: () => query,
    };
    buildQuery(query, { ...defaultFilters, inStock: false, generic: true, saleType: "receita" });
    expect(calls).toContain("or:is_generic.eq.true,name.ilike.%genérico%,name.ilike.%generico%,manufacturer.ilike.%genérico%,manufacturer.ilike.%generico%");
    expect(calls).toContain("eq:requires_prescription:true");
  });
});
