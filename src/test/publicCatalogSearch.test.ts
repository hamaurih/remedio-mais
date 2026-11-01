import { describe, expect, it } from "vitest";
import {
  buildCatalogPlans,
  buildPostgrestFilter,
  catalogEnvelopeMessage,
  filterCommasAreSafe,
  productMatchesPlan,
  scoreCatalogProduct,
  selectCatalogHits,
  splitCatalogItems,
  stockSystemMessage,
  tokenPosixPattern,
  type CatalogFields,
  type SearchPlan,
} from "../../supabase/functions/_shared/catalog-search";

function plan(query: string): SearchPlan {
  const plans = buildCatalogPlans(query).filter((item) => item.kind === "literal");
  expect(plans.length).toBeGreaterThan(0);
  return plans[0];
}

function matches(query: string, product: CatalogFields): boolean {
  return buildCatalogPlans(query)
    .filter((item) => item.kind === "literal")
    .some((item) => productMatchesPlan(product, item));
}

describe("vírgula decimal e vários itens", () => {
  it("não quebra o filtro do PostgREST com 1,5mg", () => {
    expect(splitCatalogItems("levonorgestrel 1,5mg")).toEqual(["levonorgestrel 1,5mg"]);
    expect(splitCatalogItems("diad 1,5mg")).toEqual(["diad 1,5mg"]);
    expect(filterCommasAreSafe('name.ilike.%levonorgestrel 1,5mg%,manufacturer.ilike.%levonorgestrel 1,5mg%')).toBe(false);
    const filter = buildPostgrestFilter(plan("levonorgestrel 1,5mg"));
    expect(filterCommasAreSafe(filter)).toBe(true);
    expect(filter).toContain("1[,.]5");
    expect(filter).toContain(tokenPosixPattern("levonorgestrel"));
    const roundTrip = new URLSearchParams();
    roundTrip.set("or", filter);
    expect(filterCommasAreSafe(roundTrip.get("or") || "")).toBe(true);
  });

  it("trata vírgula entre produtos como separador", () => {
    expect(splitCatalogItems("dipirona, shampoo")).toEqual(["dipirona", "shampoo"]);
    expect(splitCatalogItems("dipirona, shampoo 200ml, omega 3")).toEqual([
      "dipirona",
      "shampoo 200ml",
      "omega 3",
    ]);
    const plans = buildCatalogPlans("dipirona, shampoo");
    expect(plans.map((item) => item.text)).toEqual(["dipirona", "shampoo"]);
    for (const item of plans) expect(filterCommasAreSafe(buildPostgrestFilter(item))).toBe(true);
    expect(matches("dipirona, shampoo", { name: "DIPIRONA 1G 10CP" })).toBe(true);
    expect(matches("dipirona, shampoo", { name: "SHAMPOO CLEAR 400ML" })).toBe(true);
  });

  it("mantém dose junto do nome quando a vírgula não separa dois produtos", () => {
    expect(splitCatalogItems("dipirona, 1g")).toEqual(["dipirona, 1g"]);
    expect(matches("dipirona, 1g", { name: "DIPIRONA 1G 10CP" })).toBe(true);
    expect(matches("dipirona, 1g", { name: "DIPIRONA 500MG 10CP" })).toBe(false);
  });
});

describe("busca parcial do jeito que o cliente escreve", () => {
  const mili = { name: "FRALDA MILI JUMBO XG 22UN" };
  const pampers = { name: "FRALDA PAMPERS PANTS AJUSTE TOTAL XXG 20UN" };
  const dipirona = { name: "DIPIRONA SODICA 1G 10CP" };
  const yasmin = {
    name: "DROSPIRENONA+ETINILESTRADIOL 3MG+0,03MG 21CP",
    active_ingredient: "DROSPIRENONA + ETINILESTRADIOL",
  };
  const diad = { name: "DIAD 1,5MG 1CP", manufacturer: "CIMED", active_ingredient: "LEVONORGESTREL" };
  const neovlar = { name: "NEOVLAR 21", active_ingredient: "LEVONORGESTREL" };

  it("acha fralda xg mesmo sem as palavras coladas", () => {
    expect(matches("fralda xg", mili)).toBe(true);
    expect(matches("fralda xg infantil", mili)).toBe(true);
    expect(matches("fralda mili", mili)).toBe(true);
    expect(matches("fralda xg", pampers)).toBe(false);
    expect(matches("fralda xg", { name: "SHAMPOO CLEAR" })).toBe(false);
  });

  it("acha pampers pants xxg com palavras no meio", () => {
    expect(matches("pampers pants xxg", pampers)).toBe(true);
    expect(matches("babysec", { name: "BABYSEC HIPER XG 56UN" })).toBe(true);
  });

  it("normaliza 1 grama para 1g e mantém dipirona 1g", () => {
    expect(matches("dipirona 1 grama", dipirona)).toBe(true);
    expect(matches("dipirona 1g", dipirona)).toBe(true);
    expect(matches("dipirona 1 grama", { name: "DIPIRONA 1 G 10CP" })).toBe(true);
    expect(matches("dipirona 1g", { name: "DIPIRONA 500MG 10CP" })).toBe(false);
    expect(matches("Qual o preço de dipirona 1 grama", dipirona)).toBe(true);
  });

  it("acha princípio ativo com as duas palavras separadas por +", () => {
    expect(matches("drospirenona etinilestradiol", yasmin)).toBe(true);
    expect(matches("drospirenona", yasmin)).toBe(true);
    expect(matches("drospirenona etinilestradiol", { name: "SHAMPOO CIMED", active_ingredient: "DROSPIRENONA" })).toBe(false);
  });

  it("aceita 1,5mg e 1.5mg e não mistura com anticoncepcional combinado", () => {
    expect(matches("levonorgestrel 1,5mg", diad)).toBe(true);
    expect(matches("levonorgestrel 1.5mg", diad)).toBe(true);
    expect(matches("diad 1,5mg", diad)).toBe(true);
    expect(matches("levonorgestrel 1,5mg", neovlar)).toBe(false);
    expect(matches("levonorgestrel", neovlar)).toBe(true);
  });

  it("não trata 8 como prefixo de 81", () => {
    expect(matches("koleston 82", { name: "KOLESTON 81" })).toBe(false);
    expect(matches("koleston 81", { name: "KOLESTON 81" })).toBe(true);
    expect(matches("koleston 8", { name: "KOLESTON 81" })).toBe(false);
  });

  it("candidíase consulta os princípios ativos do sintoma", () => {
    const plans = buildCatalogPlans("candidíase");
    expect(plans.map((item) => item.text)).toEqual([
      "candidíase",
      "fluconazol",
      "nistatina",
      "miconazol",
    ]);
    expect(plans[0].kind).toBe("literal");
    expect(plans.slice(1).every((item) => item.kind === "alias")).toBe(true);
    const fluconazol = { name: "FLUCONAZOL 150MG 2CAP", manufacturer: "CIMED" };
    expect(productMatchesPlan(fluconazol, plans[1])).toBe(true);
    expect(matches("candidase", fluconazol)).toBe(false);
    expect(buildCatalogPlans("candidase").some((item) => item.text === "fluconazol")).toBe(true);
  });

  it("prioriza o nome que contém a frase inteira", () => {
    const query = plan("dipirona 1g");
    const exact = scoreCatalogProduct({ name: "DIPIRONA 1G 10CP" }, query);
    const longer = scoreCatalogProduct({ name: "DIPIRONA SODICA 1G 10CP" }, query);
    expect(exact).not.toBeNull();
    expect(longer).not.toBeNull();
    expect(exact!).toBeGreaterThan(longer!);
  });
});

describe("estoque do sistema", () => {
  it("diz que a quantidade é pelo sistema e pede confirmação na loja", () => {
    expect(stockSystemMessage(40)).toBe("Pelo sistema temos 40 unidades; confirme na loja.");
    expect(stockSystemMessage(13)).toBe("Pelo sistema temos 13 unidades; confirme na loja.");
    const message = catalogEnvelopeMessage(2, false);
    expect(message.toLowerCase()).toContain("pelo sistema");
    expect(message.toLowerCase()).toContain("confirme na loja");
  });
});

describe("junção de vários itens", () => {
  it("devolve um pouco de cada item em vez de encher só com o primeiro", () => {
    const hits = [
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        id: `d${n}`,
        itemIndex: 0,
        planKind: "literal" as const,
        aliasKey: "dipirona",
        score: 10 - n,
        row: n,
      })),
      ...[1, 2, 3].map((n) => ({
        id: `s${n}`,
        itemIndex: 1,
        planKind: "literal" as const,
        aliasKey: "shampoo",
        score: 20 - n,
        row: n,
      })),
    ];
    const picked = selectCatalogHits(hits, 5);
    expect(picked.filter((hit) => hit.itemIndex === 0).length).toBe(5);
    expect(picked.filter((hit) => hit.itemIndex === 1).length).toBe(3);
    expect(picked.some((hit) => hit.id === "s1")).toBe(true);
  });

  it("intercala os princípios ativos quando o termo é só o sintoma", () => {
    const hits = ["fluconazol", "nistatina", "miconazol"].flatMap((alias, aliasIndex) =>
      [1, 2].map((n) => ({
        id: `${alias}-${n}`,
        itemIndex: 0,
        planKind: "alias" as const,
        aliasKey: alias,
        score: 10 - n - aliasIndex,
        row: alias,
      })),
    );
    const picked = selectCatalogHits(hits, 5).map((hit) => hit.id);
    expect(picked).toEqual(["fluconazol-1", "nistatina-1", "miconazol-1", "fluconazol-2", "nistatina-2"]);
  });
});
