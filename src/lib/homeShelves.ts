export interface HomeShelfDef {
  key: string;
  title: string;
  description: string;
}

/** Vitrines de produtos exibidas na home, na mesma ordem do bloco "Vitrines de produtos". */
export const HOME_SHELVES: HomeShelfDef[] = [
  { key: "ofertas-da-semana", title: "Ofertas da Semana", description: "Promoções por tempo limitado" },
  { key: "melhores-ofertas", title: "Melhores Ofertas", description: "Maiores descontos reais (fixados aparecem primeiro)" },
  { key: "mais-vendidos", title: "Mais Vendidos", description: "Ranking automático por unidades vendidas" },
  { key: "medicamentos-populares", title: "Medicamentos Populares", description: "Ranking de medicamentos mais vendidos" },
  { key: "higiene-e-beleza", title: "Higiene e Beleza", description: "Categoria Higiene pessoal" },
  { key: "mamaes-e-bebes", title: "Mamães e Bebês", description: "Categoria Mamães e bebês" },
  { key: "vitaminas-e-suplementos", title: "Vitaminas e Suplementos", description: "Categoria Vitaminas" },
  { key: "primeiros-socorros", title: "Primeiros Socorros", description: "Categoria Primeiros socorros" },
];


/**
 * Vitrines cuja seleção E ordem são exclusivamente definidas pelo administrador.
 * A Home não aplica ranking, categoria, tag ou qualquer outro fallback automático.
 * Produtos temporariamente indisponíveis são apenas omitidos sem alterar a ordem gravada.
 */
export const MANUAL_ONLY_HOME_SHELVES = new Set([
  "ofertas-da-semana",
  "higiene-e-beleza",
  "mamaes-e-bebes",
  "vitaminas-e-suplementos",
]);

export const isManualOnlyHomeShelf = (key: string) => MANUAL_ONLY_HOME_SHELVES.has(key);
