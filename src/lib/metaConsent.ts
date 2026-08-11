// Estado técnico de consentimento para marketing/ads.
// NÃO é uma solução jurídica: apenas a estrutura que permite bloquear/ativar
// o Meta Pixel conforme a política definida pelo site (LGPD).
// Se o site não exigir consentimento (marketing_settings.meta_consent_required = false),
// o Pixel é liberado por padrão.

const KEY = "atacadao_consent_v1";
const EVENT = "atacadao:consent-changed";

export type ConsentState = {
  marketing: boolean;
  updated_at?: string;
};

export function getConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    return { marketing: !!parsed.marketing, updated_at: parsed.updated_at };
  } catch {
    return null;
  }
}

export function setConsent(state: ConsentState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, updated_at: new Date().toISOString() }));
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Marketing liberado? Quando o consentimento não é exigido, libera por padrão. */
export function isMarketingAllowed(consentRequired: boolean): boolean {
  if (!consentRequired) return true;
  return getConsent()?.marketing === true;
}

export function onConsentChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
