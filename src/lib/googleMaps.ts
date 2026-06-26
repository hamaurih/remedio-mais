// Carrega o Google Maps JavaScript API de forma idempotente.
// Usa loading=async + callback global, conforme regras do conector.
let loadPromise: Promise<typeof google> | null = null;

declare global {
  interface Window {
    __lovableMapsInit?: () => void;
    google: typeof google;
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  if (!key) return Promise.reject(new Error("Google Maps key não configurada"));

  loadPromise = new Promise<typeof google>((resolve, reject) => {
    window.__lovableMapsInit = () => resolve(window.google);
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key,
      v: "weekly",
      libraries: "places",
      loading: "async",
      callback: "__lovableMapsInit",
    });
    if (channel) params.set("channel", channel);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });

  return loadPromise;
}
