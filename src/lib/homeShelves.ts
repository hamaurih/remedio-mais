export interface HomeShelfDef {
  key: string;
  title: string;
  description: string;
}

/** Vitrines de produtos exibidas na home, na mesma ordem do bloco "Vitrines de produtos". */
export const HOME_SHELVES: HomeShelfDef[] = [
  { key: "ofertas-da-semana", title: "Ofertas da Semana", description: "Promoções por tempo limitado" },
  { key: "mais-vendidos", title: "Mais Vendidos", description: "Campeões de venda da loja" },
  { key: "medicamentos-populares", title: "Medicamentos Populares", description: "Categoria Medicamentos" },
  { key: "higiene-e-beleza", title: "Higiene e Beleza", description: "Categoria Higiene pessoal" },
  { key: "mamaes-e-bebes", title: "Mamães e Bebês", description: "Categoria Mamães e bebês" },
  { key: "vitaminas-e-suplementos", title: "Vitaminas e Suplementos", description: "Categoria Vitaminas" },
  { key: "primeiros-socorros", title: "Primeiros Socorros", description: "Categoria Primeiros socorros" },
];
