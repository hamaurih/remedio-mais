import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { getCurrentPosition, normalizeGoogleComponents, reverseGeocode } from "@/lib/addressLookup";
import { Loader2, LocateFixed, MapPin, Info } from "lucide-react";

export type SelectedAddress = {
  formatted: string;
  lat: number;
  lng: number;
  place_id: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
};

type Props = {
  onSelect: (addr: SelectedAddress) => void;
  placeholder?: string;
  defaultValue?: string;
  disabled?: boolean;
};

type Suggestion = {
  key: string;
  main: string;
  secondary: string;
  /** resolve os detalhes do endereço quando o usuário escolhe a sugestão */
  resolve: () => Promise<SelectedAddress | null>;
};

const BIAS_CENTER = { lat: -7.236629, lng: -35.922702 };

export function AddressAutocomplete({ onSelect, placeholder, defaultValue, disabled }: Props) {
  const [input, setInput] = useState(defaultValue || "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchUnavailable, setSearchUnavailable] = useState(false);

  const newApiRef = useRef<any>(null);       // Places API (New)
  const legacyRef = useRef<any>(null);       // AutocompleteService (legado)
  const legacyPlacesRef = useRef<any>(null); // PlacesService (legado)
  const sessionTokenRef = useRef<any>(null);
  const mapsRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async (g) => {
        if (cancelled) return;
        mapsRef.current = g;
        try {
          const lib: any = await g.maps.importLibrary("places");
          if (cancelled) return;
          if (lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
            newApiRef.current = lib;
            sessionTokenRef.current = new lib.AutocompleteSessionToken();
          }
          if (lib?.AutocompleteService) {
            legacyRef.current = new lib.AutocompleteService();
            legacyPlacesRef.current = new lib.PlacesService(document.createElement("div"));
          }
        } catch {
          if (!cancelled) setSearchUnavailable(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSearchUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Places API (New) ----------
  async function fetchNew(q: string): Promise<Suggestion[]> {
    const lib = newApiRef.current;
    if (!lib) throw new Error("sem-new-api");
    const { suggestions: sugs } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: q,
      sessionToken: sessionTokenRef.current,
      includedRegionCodes: ["br"],
      locationBias: { center: BIAS_CENTER, radius: 30000 },
    });
    return (sugs || []).map((s: any, i: number) => ({
      key: `n${i}`,
      main: s.placePrediction?.mainText?.text || s.placePrediction?.text?.text || "",
      secondary: s.placePrediction?.secondaryText?.text || "",
      resolve: async () => {
        const place = s.placePrediction.toPlace();
        await place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents", "id"] });
        const loc = place.location;
        const comps = (place.addressComponents || []).map((c: any) => ({
          long_name: c.longText,
          short_name: c.shortText,
          types: c.types,
        }));
        sessionTokenRef.current = new lib.AutocompleteSessionToken();
        return {
          formatted: place.formattedAddress || s.placePrediction.text?.text || "",
          lat: typeof loc?.lat === "function" ? loc.lat() : (loc as any)?.lat,
          lng: typeof loc?.lng === "function" ? loc.lng() : (loc as any)?.lng,
          place_id: place.id || "",
          ...normalizeGoogleComponents(comps),
        } as SelectedAddress;
      },
    }));
  }

  // ---------- AutocompleteService (legado, fallback) ----------
  function fetchLegacy(q: string): Promise<Suggestion[]> {
    const svc = legacyRef.current;
    if (!svc) return Promise.reject(new Error("sem-legacy"));
    return new Promise((resolve, reject) => {
      svc.getPlacePredictions(
        { input: q, componentRestrictions: { country: "br" }, language: "pt-BR" },
        (preds: any[], status: string) => {
          if (status !== "OK" || !preds) {
            reject(new Error(status || "erro"));
            return;
          }
          resolve(
            preds.map((p, i) => ({
              key: `l${i}`,
              main: p.structured_formatting?.main_text || p.description,
              secondary: p.structured_formatting?.secondary_text || "",
              resolve: () =>
                new Promise<SelectedAddress | null>((res) => {
                  legacyPlacesRef.current?.getDetails(
                    { placeId: p.place_id, fields: ["formatted_address", "geometry", "address_components", "place_id"] },
                    (det: any, st: string) => {
                      if (st !== "OK" || !det) {
                        res(null);
                        return;
                      }
                      res({
                        formatted: det.formatted_address || p.description,
                        lat: det.geometry?.location?.lat?.(),
                        lng: det.geometry?.location?.lng?.(),
                        place_id: det.place_id || p.place_id,
                        ...normalizeGoogleComponents(det.address_components || []),
                      } as SelectedAddress);
                    },
                  );
                }),
            })),
          );
        },
      );
    });
  }

  const fetchSuggestions = async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      let list: Suggestion[] = [];
      try {
        list = await fetchNew(q);
      } catch {
        list = await fetchLegacy(q);
      }
      setSuggestions(list);
      setOpen(list.length > 0);
      if (list.length === 0) setNotice("Nenhum endereço encontrado. Tente pelo CEP abaixo.");
      setSearchUnavailable(false);
    } catch {
      setSuggestions([]);
      setOpen(false);
      setSearchUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  const onChange = (v: string) => {
    setInput(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchSuggestions(v), 300);
  };

  const pick = async (s: Suggestion) => {
    setOpen(false);
    setLoading(true);
    try {
      const addr = await s.resolve();
      if (!addr) {
        setNotice("Não conseguimos detalhar esse endereço. Preencha pelo CEP.");
        return;
      }
      setInput(addr.formatted);
      onSelect(addr);
    } catch {
      setNotice("Não conseguimos detalhar esse endereço. Preencha pelo CEP.");
    } finally {
      setLoading(false);
    }
  };

  const useMyLocation = async () => {
    setNotice(null);
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      const parts = await reverseGeocode(pos.lat, pos.lng);
      if (!parts) {
        setNotice("Não conseguimos identificar o endereço da sua localização. Use o CEP.");
        return;
      }
      // Número só quando a precisão é boa (<= 40 m); senão o cliente informa.
      const number = pos.accuracy <= 40 ? parts.number : undefined;
      const addr: SelectedAddress = {
        formatted: parts.formatted || "",
        lat: pos.lat,
        lng: pos.lng,
        place_id: "",
        street: parts.street,
        number,
        neighborhood: parts.neighborhood,
        city: parts.city,
        state: parts.state,
        cep: parts.cep,
      };
      if (parts.formatted) setInput(parts.formatted);
      onSelect(addr);
      setNotice(
        number
          ? "Endereço preenchido pela sua localização. Confira antes de continuar."
          : "Endereço aproximado preenchido. Confirme o número e o complemento.",
      );
    } catch (e: any) {
      setNotice(e?.message || "Não conseguimos usar sua localização agora.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="relative">
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder || "Buscar endereço (rua, número, cidade)"}
            disabled={disabled}
            autoComplete="off"
            inputMode="search"
            className="pl-8 pr-9"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-72 overflow-auto">
            {suggestions.map((s) => (
              <button
                key={s.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm border-b last:border-b-0"
              >
                <div className="font-medium">{s.main}</div>
                {s.secondary && <div className="text-xs text-muted-foreground">{s.secondary}</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={useMyLocation}
        disabled={disabled || locating}
        className="w-full sm:w-auto gap-2"
      >
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
        {locating ? "Localizando…" : "Usar minha localização"}
      </Button>

      {(notice || searchUnavailable) && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {notice ||
              "Busca por endereço indisponível no momento. Use “Usar minha localização” ou preencha o CEP abaixo."}
          </span>
        </p>
      )}
    </div>
  );
}
