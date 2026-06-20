// Presets visuais para Faixa Promocional / Mini Banners
// Cada tema define cores, decoração e contraste seguro.
// Nada de imagem pesada por padrão — usamos gradientes e elementos CSS leves.

export type PromoThemeKey =
  | "default"
  | "red_offer"
  | "blue_health"
  | "green_natural"
  | "pink_baby"
  | "yellow_promo"
  | "sao_joao"
  | "carnaval"
  | "natal"
  | "summer"
  | "black_friday"
  | "mothers_day"
  | "valentines"
  | "kids"
  | "dermocosmetics"
  | "generics"
  | "medicines";

export type DecorationKind =
  | "none"
  | "flags"        // bandeirinhas (São João)
  | "confetti"     // Carnaval / Aniversário
  | "snow"         // Natal (pontos de luz)
  | "waves"        // Verão
  | "hearts"       // Namorados / Mães
  | "petals"       // Dia das Mães
  | "sparkle"      // Black Friday / luxo
  | "dots"         // genérico leve
  | "shine_strip"; // brilho contínuo

export type PromoTheme = {
  key: PromoThemeKey;
  label: string;
  background: string;          // CSS background
  textColor: string;           // CSS color para o texto principal
  mutedTextColor: string;
  badgeColor: string;          // CSS background do badge
  badgeTextColor: string;
  ctaColor: string;            // CSS background do CTA
  ctaTextColor: string;
  priceColor: string;          // cor do preço novo
  border: string;              // border CSS
  shadow: string;              // box-shadow
  decoration: DecorationKind;
  decorationAccent: string;    // cor base dos elementos
  dark: boolean;               // tema escuro? (usado para overlays)
};

const DARK = "#0f172a";
const NEAR_WHITE = "#ffffff";

export const PROMO_THEMES: Record<PromoThemeKey, PromoTheme> = {
  default: {
    key: "default",
    label: "Padrão",
    background: "linear-gradient(135deg,#ffffff 0%,#eef8ff 60%,#ffffff 100%)",
    textColor: "#0f172a",
    mutedTextColor: "#64748b",
    badgeColor: "hsl(var(--primary))",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "hsl(var(--primary))",
    ctaTextColor: NEAR_WHITE,
    priceColor: "hsl(var(--primary))",
    border: "1px solid #e0f0fb",
    shadow: "0 2px 10px rgba(15,40,75,0.08)",
    decoration: "none",
    decorationAccent: "#38bdf8",
    dark: false,
  },
  red_offer: {
    key: "red_offer",
    label: "Vermelho Oferta",
    background: "linear-gradient(135deg,#fff5f5 0%,#ffe0e0 100%)",
    textColor: "#7f1d1d",
    mutedTextColor: "#9c3a3a",
    badgeColor: "#dc2626",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#dc2626",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#b91c1c",
    border: "1px solid #fecaca",
    shadow: "0 4px 14px rgba(220,38,38,0.18)",
    decoration: "shine_strip",
    decorationAccent: "#fca5a5",
    dark: false,
  },
  blue_health: {
    key: "blue_health",
    label: "Azul Saúde",
    background: "linear-gradient(135deg,#f0f9ff 0%,#dbeafe 100%)",
    textColor: "#0c4a6e",
    mutedTextColor: "#475569",
    badgeColor: "#0284c7",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#0284c7",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#0369a1",
    border: "1px solid #bae6fd",
    shadow: "0 2px 10px rgba(2,132,199,0.14)",
    decoration: "dots",
    decorationAccent: "#7dd3fc",
    dark: false,
  },
  green_natural: {
    key: "green_natural",
    label: "Verde Natural",
    background: "linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)",
    textColor: "#14532d",
    mutedTextColor: "#4d7c5f",
    badgeColor: "#16a34a",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#16a34a",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#15803d",
    border: "1px solid #bbf7d0",
    shadow: "0 2px 10px rgba(22,163,74,0.14)",
    decoration: "dots",
    decorationAccent: "#86efac",
    dark: false,
  },
  pink_baby: {
    key: "pink_baby",
    label: "Rosa Bebê",
    background: "linear-gradient(135deg,#fff1f5 0%,#fce7f3 100%)",
    textColor: "#831843",
    mutedTextColor: "#9d445e",
    badgeColor: "#ec4899",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#ec4899",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#be185d",
    border: "1px solid #fbcfe8",
    shadow: "0 2px 10px rgba(236,72,153,0.14)",
    decoration: "dots",
    decorationAccent: "#f9a8d4",
    dark: false,
  },
  yellow_promo: {
    key: "yellow_promo",
    label: "Amarelo Promoção",
    background: "linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)",
    textColor: "#78350f",
    mutedTextColor: "#92400e",
    badgeColor: "#dc2626",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#dc2626",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#b91c1c",
    border: "1px solid #fde68a",
    shadow: "0 4px 14px rgba(245,158,11,0.18)",
    decoration: "sparkle",
    decorationAccent: "#f59e0b",
    dark: false,
  },
  sao_joao: {
    key: "sao_joao",
    label: "São João",
    background: "linear-gradient(135deg,#fff7ed 0%,#fed7aa 60%,#fde68a 100%)",
    textColor: "#7c2d12",
    mutedTextColor: "#9a3412",
    badgeColor: "#dc2626",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#ea580c",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#b91c1c",
    border: "1px solid #fdba74",
    shadow: "0 4px 14px rgba(234,88,12,0.20)",
    decoration: "flags",
    decorationAccent: "#dc2626",
    dark: false,
  },
  carnaval: {
    key: "carnaval",
    label: "Carnaval",
    background: "linear-gradient(135deg,#fef3c7 0%,#fbcfe8 40%,#bae6fd 100%)",
    textColor: "#1e1b4b",
    mutedTextColor: "#4338ca",
    badgeColor: "#a21caf",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#a21caf",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#a21caf",
    border: "1px solid #f0abfc",
    shadow: "0 4px 14px rgba(162,28,175,0.18)",
    decoration: "confetti",
    decorationAccent: "#a21caf",
    dark: false,
  },
  natal: {
    key: "natal",
    label: "Natal",
    background: "linear-gradient(135deg,#fef2f2 0%,#fee2e2 50%,#dcfce7 100%)",
    textColor: "#7f1d1d",
    mutedTextColor: "#166534",
    badgeColor: "#15803d",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#b91c1c",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#b91c1c",
    border: "1px solid #fecaca",
    shadow: "0 4px 14px rgba(185,28,28,0.16)",
    decoration: "snow",
    decorationAccent: "#fde68a",
    dark: false,
  },
  summer: {
    key: "summer",
    label: "Verão",
    background: "linear-gradient(135deg,#fef9c3 0%,#bae6fd 100%)",
    textColor: "#0c4a6e",
    mutedTextColor: "#0369a1",
    badgeColor: "#f59e0b",
    badgeTextColor: DARK,
    ctaColor: "#0284c7",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#0369a1",
    border: "1px solid #bae6fd",
    shadow: "0 4px 14px rgba(2,132,199,0.18)",
    decoration: "waves",
    decorationAccent: "#38bdf8",
    dark: false,
  },
  black_friday: {
    key: "black_friday",
    label: "Black Friday",
    background: "linear-gradient(135deg,#000000 0%,#0f172a 60%,#1f1f1f 100%)",
    textColor: "#ffffff",
    mutedTextColor: "#cbd5e1",
    badgeColor: "#facc15",
    badgeTextColor: "#000000",
    ctaColor: "#facc15",
    ctaTextColor: "#000000",
    priceColor: "#facc15",
    border: "1px solid #facc15",
    shadow: "0 6px 18px rgba(250,204,21,0.30)",
    decoration: "sparkle",
    decorationAccent: "#facc15",
    dark: true,
  },
  mothers_day: {
    key: "mothers_day",
    label: "Dia das Mães",
    background: "linear-gradient(135deg,#fff1f5 0%,#fbcfe8 100%)",
    textColor: "#831843",
    mutedTextColor: "#9d174d",
    badgeColor: "#be185d",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#be185d",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#be185d",
    border: "1px solid #f9a8d4",
    shadow: "0 4px 14px rgba(190,24,93,0.18)",
    decoration: "petals",
    decorationAccent: "#f472b6",
    dark: false,
  },
  valentines: {
    key: "valentines",
    label: "Dia dos Namorados",
    background: "linear-gradient(135deg,#fee2e2 0%,#fecdd3 100%)",
    textColor: "#881337",
    mutedTextColor: "#9f1239",
    badgeColor: "#e11d48",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#e11d48",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#be123c",
    border: "1px solid #fda4af",
    shadow: "0 4px 14px rgba(225,29,72,0.18)",
    decoration: "hearts",
    decorationAccent: "#e11d48",
    dark: false,
  },
  kids: {
    key: "kids",
    label: "Infantil",
    background: "linear-gradient(135deg,#e0f2fe 0%,#fef3c7 60%,#fce7f3 100%)",
    textColor: "#0c4a6e",
    mutedTextColor: "#0369a1",
    badgeColor: "#f59e0b",
    badgeTextColor: DARK,
    ctaColor: "#0284c7",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#0284c7",
    border: "1px solid #bae6fd",
    shadow: "0 4px 14px rgba(2,132,199,0.14)",
    decoration: "dots",
    decorationAccent: "#fbbf24",
    dark: false,
  },
  dermocosmetics: {
    key: "dermocosmetics",
    label: "Dermocosméticos",
    background: "linear-gradient(135deg,#faf5f0 0%,#fce7f3 100%)",
    textColor: "#3f3f46",
    mutedTextColor: "#71717a",
    badgeColor: "#9f1239",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#0f172a",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#0f172a",
    border: "1px solid #e4d8c8",
    shadow: "0 2px 10px rgba(15,23,42,0.10)",
    decoration: "shine_strip",
    decorationAccent: "#e7d3c2",
    dark: false,
  },
  generics: {
    key: "generics",
    label: "Genéricos",
    background: "linear-gradient(135deg,#ecfeff 0%,#dcfce7 100%)",
    textColor: "#0c4a6e",
    mutedTextColor: "#15803d",
    badgeColor: "#0e7490",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#0e7490",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#15803d",
    border: "1px solid #a7f3d0",
    shadow: "0 2px 10px rgba(14,116,144,0.14)",
    decoration: "none",
    decorationAccent: "#22d3ee",
    dark: false,
  },
  medicines: {
    key: "medicines",
    label: "Medicamentos",
    background: "linear-gradient(135deg,#ffffff 0%,#eff6ff 60%,#fee2e2 100%)",
    textColor: "#0f172a",
    mutedTextColor: "#475569",
    badgeColor: "#dc2626",
    badgeTextColor: NEAR_WHITE,
    ctaColor: "#0284c7",
    ctaTextColor: NEAR_WHITE,
    priceColor: "#dc2626",
    border: "1px solid #bfdbfe",
    shadow: "0 2px 10px rgba(2,132,199,0.12)",
    decoration: "none",
    decorationAccent: "#60a5fa",
    dark: false,
  },
};

export const PROMO_THEME_OPTIONS = Object.values(PROMO_THEMES).map((t) => ({
  value: t.key,
  label: t.label,
}));

export type BackgroundIntensity = "off" | "very_soft" | "soft" | "medium" | "strong";

export const INTENSITY_OPTIONS: { value: BackgroundIntensity; label: string }[] = [
  { value: "off", label: "Desligado" },
  { value: "very_soft", label: "Muito suave" },
  { value: "soft", label: "Suave" },
  { value: "medium", label: "Médio" },
  { value: "strong", label: "Forte" },
];

export const INTENSITY_OPACITY: Record<BackgroundIntensity, number> = {
  off: 0,
  very_soft: 0.18,
  soft: 0.35,
  medium: 0.55,
  strong: 0.8,
};

export function getTheme(key: string | null | undefined): PromoTheme {
  if (!key) return PROMO_THEMES.default;
  return PROMO_THEMES[(key as PromoThemeKey)] ?? PROMO_THEMES.default;
}
