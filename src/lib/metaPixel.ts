// Carregamento centralizado do Meta Pixel.
// Nenhum outro arquivo deve chamar window.fbq diretamente — use metaEvents.ts.

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
  }
}

let loadedPixelId: string | null = null;

/** Aceita um ou vários IDs separados por vírgula (ex.: "111,222"). */
function parseIds(pixelId: string): string[] {
  return Array.from(new Set(pixelId.split(",").map((v) => v.trim()).filter(Boolean)));
}

/** Injeta o fbevents.js uma única vez e inicializa o(s) Pixel(s). Idempotente. */
export function loadMetaPixel(pixelId: string) {
  if (typeof window === "undefined" || !pixelId) return;
  const ids = parseIds(pixelId);
  if (!ids.length) return;
  const key = ids.join(",");
  if (loadedPixelId === key) return;

  if (!window.fbq) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const n: any = function (...args: unknown[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    };
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    window._fbq = n;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  const already = loadedPixelId ? parseIds(loadedPixelId) : [];
  for (const id of ids) {
    if (!already.includes(id)) window.fbq?.("init", id);
  }
  loadedPixelId = key;
}


export function isPixelLoaded() {
  return !!loadedPixelId;
}

export function loadedPixel() {
  return loadedPixelId;
}

/** Dispara um evento padrão no browser com eventID (deduplicação com a CAPI). */
export function pixelTrack(eventName: string, params?: Record<string, unknown>, eventId?: string) {
  if (!loadedPixelId || !window.fbq) return false;
  window.fbq("track", eventName, params ?? {}, eventId ? { eventID: eventId } : undefined);
  return true;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** _fbp definido pelo próprio fbevents.js — nunca fabricamos um valor. */
export function getFbp(): string | null {
  return readCookie("_fbp");
}

/**
 * _fbc: cookie criado pelo Pixel. Se houver fbclid na URL e o cookie ainda não
 * existir, montamos no formato oficial da Meta (fb.1.<timestamp>.<fbclid>).
 * Sem fbclid real não inventamos identificador.
 */
export function getFbc(): string | null {
  const cookie = readCookie("_fbc");
  if (cookie) return cookie;
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (!fbclid) return null;
    const stored = sessionStorage.getItem("atacadao_fbc");
    if (stored) return stored;
    const value = `fb.1.${Date.now()}.${fbclid}`;
    sessionStorage.setItem("atacadao_fbc", value);
    return value;
  } catch {
    return null;
  }
}

/** Gera event_id estável por ação, compartilhado entre browser e servidor. */
export function newEventId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${rand}`;
}

/** event_id determinístico (ex.: purchase:<order_id>) — garante idempotência. */
export function stableEventId(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}
