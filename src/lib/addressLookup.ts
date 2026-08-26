// Busca de endereço por CEP e geocodificação reversa (coordenadas -> endereço).
// Sem chaves secretas: usa a chave *browser* do Google Maps já configurada
// (restrita por domínio) e serviços públicos brasileiros como fallback.

import { loadGoogleMaps } from "@/lib/googleMaps";

export type AddressParts = {
  cep?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  number?: string;
  formatted?: string;
};

export function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

export function formatCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** ViaCEP com fallback BrasilAPI. Retorna null quando o CEP não existe. */
export async function lookupCep(cepRaw: string): Promise<AddressParts | null> {
  const cep = onlyDigits(cepRaw);
  if (cep.length !== 8) return null;

  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (r.ok) {
      const d = await r.json();
      if (!d?.erro) {
        return {
          cep,
          street: d.logradouro || "",
          neighborhood: d.bairro || "",
          city: d.localidade || "",
          state: d.uf || "",
        };
      }
      return null;
    }
  } catch {
    /* tenta fallback */
  }

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
    if (!r.ok) return null;
    const d = await r.json();
    return {
      cep,
      street: d.street || "",
      neighborhood: d.neighborhood || "",
      city: d.city || "",
      state: d.state || "",
    };
  } catch {
    throw new Error("indisponivel");
  }
}

function fromGoogleComponents(comps: any[] = []): AddressParts {
  const get = (type: string) => comps.find((c) => (c.types || []).includes(type));
  return {
    street: get("route")?.long_name,
    number: get("street_number")?.long_name,
    neighborhood:
      get("sublocality_level_1")?.long_name || get("sublocality")?.long_name || get("neighborhood")?.long_name,
    city: get("administrative_area_level_2")?.long_name || get("locality")?.long_name,
    state: get("administrative_area_level_1")?.short_name,
    cep: onlyDigits(get("postal_code")?.long_name || ""),
  };
}

export function normalizeGoogleComponents(comps: any[] = []): AddressParts {
  return fromGoogleComponents(comps);
}

async function reverseGeocodeGoogle(lat: number, lng: number): Promise<AddressParts | null> {
  try {
    const g = await loadGoogleMaps();
    const geocoder = new g.maps.Geocoder();
    const res: any = await geocoder.geocode({ location: { lat, lng }, language: "pt-BR" });
    const first = res?.results?.[0];
    if (!first) return null;
    const parts = fromGoogleComponents(
      (first.address_components || []).map((c: any) => ({
        long_name: c.long_name ?? c.longText,
        short_name: c.short_name ?? c.shortText,
        types: c.types,
      })),
    );
    return { ...parts, formatted: first.formatted_address };
  } catch {
    return null;
  }
}

/** Fallback aberto (sem chave) para geocodificação reversa. */
async function reverseGeocodeOpen(lat: number, lng: number): Promise<AddressParts | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=pt-BR`,
    );
    if (!r.ok) return null;
    const d = await r.json();
    const a = d?.address || {};
    return {
      street: a.road || a.pedestrian || "",
      number: a.house_number || "",
      neighborhood: a.suburb || a.neighbourhood || a.city_district || "",
      city: a.city || a.town || a.village || a.municipality || "",
      state: (a["ISO3166-2-lvl4"] || "").split("-")[1] || "",
      cep: onlyDigits(a.postcode || ""),
      formatted: d?.display_name || "",
    };
  } catch {
    return null;
  }
}

/** Tenta Google (chave browser) e cai para serviço aberto; completa via ViaCEP. */
export async function reverseGeocode(lat: number, lng: number): Promise<AddressParts | null> {
  const parts = (await reverseGeocodeGoogle(lat, lng)) || (await reverseGeocodeOpen(lat, lng));
  if (!parts) return null;

  const missing = !parts.street || !parts.neighborhood || !parts.city || !parts.state;
  if (parts.cep && parts.cep.length === 8 && missing) {
    try {
      const byCep = await lookupCep(parts.cep);
      if (byCep) {
        return {
          ...parts,
          street: parts.street || byCep.street,
          neighborhood: parts.neighborhood || byCep.neighborhood,
          city: parts.city || byCep.city,
          state: parts.state || byCep.state,
        };
      }
    } catch {
      /* mantém o que já temos */
    }
  }
  return parts;
}

export type GeoPosition = { lat: number; lng: number; accuracy: number };

/** Geolocalização do navegador — só deve ser chamada após clique do usuário. */
export function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Seu navegador não suporta localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy ?? 9999,
        }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada. Você pode digitar o CEP normalmente."
            : "Não conseguimos obter sua localização agora. Digite o CEP para continuar.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}
