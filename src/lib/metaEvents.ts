// Camada única de eventos Meta (Pixel browser + espelho server-side via CAPI).
// Regras de farmácia: enviamos apenas IDs técnicos, nome comercial do produto e
// valores. Nunca princípio ativo, indicação clínica, receita ou dado de saúde.

import { supabase } from "@/integrations/supabase/client";
import { isMarketingAllowed, onConsentChange } from "./metaConsent";
import { getFbc, getFbp, loadMetaPixel, isPixelLoaded, newEventId, pixelTrack, stableEventId } from "./metaPixel";

export type MetaConfig = { enabled: boolean; pixel_id: string | null; consent_required: boolean };

const CURRENCY = "BRL";

let config: MetaConfig = { enabled: false, pixel_id: null, consent_required: false };
let configLoaded = false;
let loading: Promise<MetaConfig> | null = null;

export function getMetaConfig(): MetaConfig {
  return config;
}

export async function loadMetaConfig(): Promise<MetaConfig> {
  if (configLoaded) return config;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { data } = await (supabase as any).rpc("public_meta_config");
      if (data && typeof data === "object") {
        config = {
          enabled: !!data.enabled,
          pixel_id: data.pixel_id ?? null,
          consent_required: !!data.consent_required,
        };
      }
    } catch { /* integração indisponível: segue sem Pixel */ }
    configLoaded = true;
    return config;
  })();
  return loading;
}

function pixelAllowed() {
  return config.enabled && !!config.pixel_id && isMarketingAllowed(config.consent_required);
}

/** Ativa o Pixel se (e somente se) habilitado, com ID e consentimento aplicável. */
export function applyMetaPixelState() {
  if (pixelAllowed()) loadMetaPixel(config.pixel_id as string);
}

export async function initMetaPixel() {
  await loadMetaConfig();
  applyMetaPixelState();
  onConsentChange(() => applyMetaPixelState());
}

type Contents = Array<{ id: string; quantity: number; item_price: number }>;

/** Espelho server-side (CAPI). O token nunca sai do backend. */
function mirrorToCapi(eventName: string, eventId: string, customData: Record<string, unknown>) {
  if (!config.enabled || !isMarketingAllowed(config.consent_required)) return;
  const body = {
    action: "track",
    event_name: eventName,
    event_id: eventId,
    // Só a origem: caminhos de produto/categoria podem sugerir condição de saúde.
    event_source_url: typeof window !== "undefined" ? window.location.origin : undefined,
    custom_data: customData,
    fbp: getFbp(),
    fbc: getFbc(),
  };
  // Fire-and-forget: mensuração nunca deve travar a navegação/compra.
  void supabase.functions.invoke("meta-conversions-api", { body }).catch(() => {});
}

function track(eventName: string, params: Record<string, unknown>, eventId: string, mirror = true) {
  if (!pixelAllowed()) return eventId;
  pixelTrack(eventName, { ...params, currency: CURRENCY }, eventId);
  if (mirror) mirrorToCapi(eventName, eventId, { ...params, currency: CURRENCY });
  return eventId;
}

// ---------------------------------------------------------------- PageView
let lastPageViewPath: string | null = null;

export function trackPageView(path: string) {
  if (!pixelAllowed()) return;
  if (lastPageViewPath === path) return; // sem duplicar na mesma navegação
  lastPageViewPath = path;
  pixelTrack("PageView", {}, newEventId("pv"));
}

export function __resetPageViewDedupe() {
  lastPageViewPath = null;
}

// ------------------------------------------------------------- ViewContent
export function trackViewContent(p: { id: string; name: string; price: number; trier_product_id?: string | null }) {
  return track("ViewContent", {
    content_type: "product",
    content_ids: [contentId(p)],
    value: Number(p.price) || 0,
  }, newEventId("vc"));
}

// ------------------------------------------------------------------ Search
export function trackSearch(term: string) {
  const q = (term || "").trim();
  if (q.length < 2) return;
  // Nunca enviamos o termo digitado: buscas em farmácia podem revelar condição
  // de saúde (política de Ferramentas da Meta para Empresas).
  return track("Search", {}, newEventId("se"));
}

// --------------------------------------------------------------- AddToCart
export function trackAddToCart(item: { id: string; product_id?: string | null; name: string; price: number; quantity: number }) {
  const id = item.product_id || item.id;
  const contents: Contents = [{ id, quantity: item.quantity, item_price: Number(item.price) || 0 }];
  return track("AddToCart", {
    content_type: "product",
    content_ids: [id],
    contents,
    value: (Number(item.price) || 0) * item.quantity,
  }, newEventId("atc"));
}

// -------------------------------------------------------- InitiateCheckout
export function trackInitiateCheckout(items: Array<{ id: string; product_id?: string | null; price: number; quantity: number }>, value: number) {
  if (!items.length) return;
  const contents: Contents = items.map((i) => ({
    id: i.product_id || i.id,
    quantity: i.quantity,
    item_price: Number(i.price) || 0,
  }));
  return track("InitiateCheckout", {
    content_type: "product",
    content_ids: contents.map((c) => c.id),
    contents,
    num_items: contents.reduce((s, c) => s + c.quantity, 0),
    value: Number(value) || 0,
  }, newEventId("ic"));
}

// --------------------------------------------------------- AddPaymentInfo
export function trackAddPaymentInfo(method: "pix" | "credit_card", value: number) {
  // Apenas o tipo de meio de pagamento — nunca número de cartão, CVV ou titular.
  return track("AddPaymentInfo", {
    payment_method: method,
    value: Number(value) || 0,
  }, newEventId("api"));
}

// ---------------------------------------------------------------- Purchase
/**
 * Purchase no browser SOMENTE com pagamento aprovado confirmado.
 * event_id determinístico (purchase:<order_id>) — o servidor usa o mesmo,
 * então a Meta deduplica browser × webhook × polling Pix.
 */
export function trackPurchase(order: { id: string; total: number; items: Contents }) {
  if (!pixelAllowed()) return;
  const eventId = stableEventId("purchase", order.id);
  const key = `meta:purchase:${order.id}`;
  try {
    if (sessionStorage.getItem(key)) return eventId; // não repete na mesma sessão
    sessionStorage.setItem(key, "1");
  } catch { /* ignore */ }
  // Não espelhamos pela CAPI aqui: a fonte de verdade server-side é o webhook.
  pixelTrack("Purchase", {
    content_type: "product",
    content_ids: order.items.map((i) => i.id),
    contents: order.items,
    num_items: order.items.reduce((s, i) => s + i.quantity, 0),
    order_id: order.id,
    value: Number(order.total) || 0,
    currency: CURRENCY,
  }, eventId);
  return eventId;
}

// ------------------------------------------------- Lead / CompleteRegistration
export function trackCompleteRegistration() {
  return track("CompleteRegistration", {}, newEventId("cr"));
}

/** Use somente em ação com intenção comercial real (ex.: formulário comercial). */
export function trackLead(source: string) {
  return track("Lead", { content_name: source }, newEventId("lead"));
}

function contentId(p: { id: string; trier_product_id?: string | null }) {
  return p.id; // padrão único do catálogo: products.id
}

export { isPixelLoaded };
