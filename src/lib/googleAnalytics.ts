import { supabase } from "@/integrations/supabase/client";
import { isMarketingAllowed, onConsentChange } from "./metaConsent";

type GaConfig = {
  enabled: boolean;
  measurement_id: string | null;
  consent_required: boolean;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const ENV_GA_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim().toUpperCase();
const ENV_GA_ENABLED = String(import.meta.env.VITE_GA_ENABLED || "").toLowerCase() === "true";

let config: GaConfig = {
  enabled: ENV_GA_ENABLED && /^G-[A-Z0-9]+$/.test(ENV_GA_ID),
  measurement_id: /^G-[A-Z0-9]+$/.test(ENV_GA_ID) ? ENV_GA_ID : null,
  consent_required: true,
};
let configLoaded = false;
let loading: Promise<GaConfig> | null = null;
let initialized = false;
let lastPageView: string | null = null;

export function getGaConfig() {
  return config;
}

export async function loadGaConfig(): Promise<GaConfig> {
  if (configLoaded) return config;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { data } = await (supabase as any).rpc("public_ga_config");
      if (data && typeof data === "object") {
        const dbId = String(data.measurement_id || "").trim().toUpperCase();
        const dbValid = /^G-[A-Z0-9]+$/.test(dbId);
        config = {
          enabled: !!data.enabled || (ENV_GA_ENABLED && /^G-[A-Z0-9]+$/.test(ENV_GA_ID)),
          measurement_id: dbValid ? dbId : (/^G-[A-Z0-9]+$/.test(ENV_GA_ID) ? ENV_GA_ID : null),
          consent_required: data.consent_required !== false,
        };
      }
    } catch {
      // Analytics nunca deve impedir o funcionamento da loja.
    }
    configLoaded = true;
    return config;
  })();
  return loading;
}

function allowed() {
  return config.enabled
    && !!config.measurement_id
    && isMarketingAllowed(config.consent_required);
}

function install() {
  if (!allowed() || initialized || typeof document === "undefined") return;
  const id = config.measurement_id as string;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function (...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  window.gtag("js", new Date());
  window.gtag("config", id, {
    send_page_view: false,
    allow_google_signals: true,
  });

  if (!document.querySelector(`script[data-ga4="${id}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.dataset.ga4 = id;
    document.head.appendChild(script);
  }
  initialized = true;
}

export async function initGoogleAnalytics() {
  await loadGaConfig();
  install();
  onConsentChange(() => install());
}

function event(name: string, params: Record<string, unknown> = {}) {
  if (!allowed()) return;
  install();
  window.gtag?.("event", name, params);
}

export function gaPageView(path: string) {
  if (!allowed() || lastPageView === path) return;
  lastPageView = path;
  event("page_view", {
    page_path: path,
    page_location: typeof window !== "undefined" ? `${window.location.origin}${path}` : undefined,
  });
}

export function gaViewItem(id: string, value: number) {
  event("view_item", {
    currency: "BRL",
    value: Number(value) || 0,
    items: [{ item_id: id }],
  });
}

export function gaAddToCart(id: string, value: number, quantity: number) {
  event("add_to_cart", {
    currency: "BRL",
    value: Number(value) || 0,
    items: [{ item_id: id, quantity }],
  });
}

export function gaBeginCheckout(items: Array<{ id: string; quantity: number; item_price: number }>, value: number) {
  event("begin_checkout", {
    currency: "BRL",
    value: Number(value) || 0,
    items: items.map((i) => ({ item_id: i.id, quantity: i.quantity, price: i.item_price })),
  });
}

export function gaAddPaymentInfo(method: string, value: number) {
  event("add_payment_info", {
    currency: "BRL",
    value: Number(value) || 0,
    payment_type: method,
  });
}

export function gaPurchase(order: { id: string; total: number }) {
  const key = `ga4:purchase:${order.id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }
  // Em farmácia evitamos enviar nomes/IDs de produtos no Purchase para não
  // transformar o Analytics em fonte de dados potencialmente sensíveis.
  event("purchase", {
    transaction_id: order.id,
    currency: "BRL",
    value: Number(order.total) || 0,
  });
}
