// Modelos visuais prontos para banners. Cada modelo mapeia para um preset
// de visual_style + palette + copy defaults, mantendo consistência visual.

import type { VisualStyle } from "@/components/HeroSlider";

export type HeroVisualModel =
  | "auto"
  | "oferta-semana"
  | "genericos"
  | "mundo-infantil"
  | "mundo-dermo"
  | "vitaminas"
  | "higiene-beleza"
  | "conveniencia"
  | "primeiros-socorros"
  | "campanha-vermelha"
  | "campanha-azul"
  | "campanha-verde"
  | "campanha-rosa"
  | "campanha-escura";

export interface HeroVisualModelSpec {
  label: string;
  description: string;
  visualStyle: VisualStyle;
  swatch: string; // hex para pré-visualização no admin
  accent?: string;
  backgroundColor?: string;
  buttonColor?: string;
  sideShapesColor?: string;
}

export const HERO_VISUAL_MODELS: Record<HeroVisualModel, HeroVisualModelSpec> = {
  auto: {
    label: "Padrão (livre)",
    description: "Sem preset — usa as cores escolhidas manualmente",
    visualStyle: "light-neutral",
    swatch: "#F5F5F5",
  },
  "oferta-semana": {
    label: "Oferta da Semana",
    description: "Vermelho impacto para promoções semanais",
    visualStyle: "red-soft",
    swatch: "#E5253E",
    accent: "#E5253E",
    buttonColor: "#E5253E",
    sideShapesColor: "#E5253E",
  },
  genericos: {
    label: "Genéricos em Oferta",
    description: "Azul confiança para linha de genéricos",
    visualStyle: "blue-health",
    swatch: "#0A4DA2",
    accent: "#0A4DA2",
    buttonColor: "#0A4DA2",
  },
  "mundo-infantil": {
    label: "Mundo Infantil",
    description: "Rosa suave e alegre para linha kids/bebês",
    visualStyle: "red-soft",
    swatch: "#FF7AAE",
    backgroundColor: "#FFEAF3",
    accent: "#D6337A",
    buttonColor: "#D6337A",
    sideShapesColor: "#FF7AAE",
  },
  "mundo-dermo": {
    label: "Mundo Dermo",
    description: "Bege premium para dermocosméticos",
    visualStyle: "beige-health",
    swatch: "#B8410D",
    accent: "#B8410D",
    buttonColor: "#B8410D",
  },
  vitaminas: {
    label: "Vitaminas e Suplementos",
    description: "Verde vitalidade para suplementação",
    visualStyle: "beige-health",
    swatch: "#2E7D32",
    backgroundColor: "#E8F5E9",
    accent: "#2E7D32",
    buttonColor: "#2E7D32",
    sideShapesColor: "#2E7D32",
  },
  "higiene-beleza": {
    label: "Higiene e Beleza",
    description: "Vinho premium para beleza",
    visualStyle: "wine-premium",
    swatch: "#3A0F1A",
    accent: "#F5C46B",
    buttonColor: "#F5C46B",
  },
  conveniencia: {
    label: "Conveniência",
    description: "Amarelo oferta para conveniência",
    visualStyle: "yellow-offer",
    swatch: "#FFC107",
    accent: "#B8410D",
    buttonColor: "#B8410D",
  },
  "primeiros-socorros": {
    label: "Primeiros Socorros",
    description: "Azul saúde para primeiros socorros",
    visualStyle: "blue-health",
    swatch: "#0A4DA2",
    accent: "#0A4DA2",
    buttonColor: "#0A4DA2",
  },
  "campanha-vermelha": {
    label: "Campanha Vermelha",
    description: "Vermelho campanha institucional",
    visualStyle: "red-soft",
    swatch: "#C10E2A",
    accent: "#C10E2A",
    buttonColor: "#C10E2A",
    sideShapesColor: "#C10E2A",
  },
  "campanha-azul": {
    label: "Campanha Azul",
    description: "Azul campanha institucional",
    visualStyle: "blue-health",
    swatch: "#0A4DA2",
    accent: "#0A4DA2",
    buttonColor: "#0A4DA2",
    sideShapesColor: "#0A4DA2",
  },
  "campanha-verde": {
    label: "Campanha Verde",
    description: "Verde campanha institucional",
    visualStyle: "beige-health",
    swatch: "#1B7A3E",
    backgroundColor: "#E7F5EC",
    accent: "#1B7A3E",
    buttonColor: "#1B7A3E",
    sideShapesColor: "#1B7A3E",
  },
  "campanha-rosa": {
    label: "Campanha Rosa",
    description: "Rosa campanha (outubro rosa, kids)",
    visualStyle: "red-soft",
    swatch: "#D6337A",
    backgroundColor: "#FFEAF3",
    accent: "#D6337A",
    buttonColor: "#D6337A",
    sideShapesColor: "#D6337A",
  },
  "campanha-escura": {
    label: "Campanha Escura / Fitness",
    description: "Fundo escuro premium (fitness, esporte)",
    visualStyle: "wine-premium",
    swatch: "#1F2937",
    backgroundColor: "#111827",
    accent: "#F5C46B",
    buttonColor: "#F5C46B",
  },
};

export const HERO_VISUAL_MODEL_OPTIONS = (Object.keys(HERO_VISUAL_MODELS) as HeroVisualModel[]).map((v) => ({
  value: v,
  label: HERO_VISUAL_MODELS[v].label,
  description: HERO_VISUAL_MODELS[v].description,
  swatch: HERO_VISUAL_MODELS[v].swatch,
}));

export function getHeroVisualModel(v?: string | null): HeroVisualModelSpec {
  return HERO_VISUAL_MODELS[(v as HeroVisualModel) ?? "auto"] ?? HERO_VISUAL_MODELS.auto;
}

/**
 * Aplica um modelo visual em cima dos dados do banner, respeitando cores
 * manuais já definidas pelo admin (não sobrescreve o que o usuário customizou).
 */
export function applyVisualModel<T extends Record<string, any>>(banner: T): T {
  const model = getHeroVisualModel(banner.visual_model);
  if (!banner.visual_model || banner.visual_model === "auto") return banner;
  return {
    ...banner,
    visual_style: banner.visual_style || model.visualStyle,
    background_color: banner.background_color || model.backgroundColor || null,
    accent_color: banner.accent_color || model.accent || null,
    button_color: banner.button_color || model.buttonColor || null,
    side_shapes_color: banner.side_shapes_color || model.sideShapesColor || null,
  };
}
