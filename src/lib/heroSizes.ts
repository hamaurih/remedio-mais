// Tamanhos padronizados para o Hero. Aplicados via aspect-ratio + min/max height
// para evitar layout shift e manter proporção profissional.

export type HeroSizeVariant =
  | "hero-grande"
  | "hero-medio"
  | "hero-compacto"
  | "full-width"
  | "container"
  | "banner-categoria"
  | "mobile-otimizado";

export interface HeroSizeSpec {
  label: string;
  description: string;
  desktopAspect: string; // CSS aspect-ratio value
  minHeight: number; // px
  maxHeight: number; // px
  mobileAspect: string;
  mobileMinHeight: number;
  container: boolean; // true = respeita max-width do container
}

export const HERO_SIZES: Record<HeroSizeVariant, HeroSizeSpec> = {
  "hero-grande": {
    label: "Hero grande",
    description: "Impacto máximo na home — proporção cinema 16:5",
    desktopAspect: "16 / 5",
    minHeight: 360,
    maxHeight: 520,
    mobileAspect: "4 / 5",
    mobileMinHeight: 420,
    container: true,
  },
  "hero-medio": {
    label: "Hero médio",
    description: "Equilíbrio entre destaque e leveza — 16:4.5",
    desktopAspect: "16 / 4.5",
    minHeight: 300,
    maxHeight: 420,
    mobileAspect: "4 / 5",
    mobileMinHeight: 380,
    container: true,
  },
  "hero-compacto": {
    label: "Hero compacto",
    description: "Faixa promocional discreta — 16:3.5",
    desktopAspect: "16 / 3.5",
    minHeight: 220,
    maxHeight: 320,
    mobileAspect: "3 / 2",
    mobileMinHeight: 260,
    container: true,
  },
  "full-width": {
    label: "Full width",
    description: "Ocupa toda a largura da tela",
    desktopAspect: "16 / 5",
    minHeight: 360,
    maxHeight: 520,
    mobileAspect: "4 / 5",
    mobileMinHeight: 420,
    container: false,
  },
  container: {
    label: "Container centralizado",
    description: "Segue o container do site, com bordas arredondadas",
    desktopAspect: "16 / 5",
    minHeight: 320,
    maxHeight: 460,
    mobileAspect: "4 / 5",
    mobileMinHeight: 400,
    container: true,
  },
  "banner-categoria": {
    label: "Banner categoria",
    description: "Menor, adequado para páginas internas",
    desktopAspect: "16 / 3",
    minHeight: 180,
    maxHeight: 260,
    mobileAspect: "3 / 2",
    mobileMinHeight: 220,
    container: true,
  },
  "mobile-otimizado": {
    label: "Mobile otimizado",
    description: "Quadrado 1:1, ideal quando o público é majoritariamente mobile",
    desktopAspect: "16 / 4",
    minHeight: 280,
    maxHeight: 360,
    mobileAspect: "1 / 1",
    mobileMinHeight: 360,
    container: true,
  },
};

export const HERO_SIZE_OPTIONS = (Object.keys(HERO_SIZES) as HeroSizeVariant[]).map((v) => ({
  value: v,
  label: HERO_SIZES[v].label,
  description: HERO_SIZES[v].description,
}));

export function getHeroSize(v?: string | null): HeroSizeSpec {
  return HERO_SIZES[(v as HeroSizeVariant) ?? "hero-grande"] ?? HERO_SIZES["hero-grande"];
}
