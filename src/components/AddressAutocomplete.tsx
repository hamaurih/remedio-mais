import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { Loader2, MapPin } from "lucide-react";

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

function extractComponents(comps: google.maps.GeocoderAddressComponent[] = []) {
  const get = (type: string) => comps.find((c) => c.types.includes(type));
  return {
    street: get("route")?.long_name,
    number: get("street_number")?.long_name,
    neighborhood: get("sublocality_level_1")?.long_name || get("sublocality")?.long_name,
    city:
      get("administrative_area_level_2")?.long_name ||
      get("locality")?.long_name,
    state: get("administrative_area_level_1")?.short_name,
    cep: get("postal_code")?.long_name?.replace(/\D/g, ""),
  };
}

export function AddressAutocomplete({ onSelect, placeholder, defaultValue, disabled }: Props) {
  const [input, setInput] = useState(defaultValue || "");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<any>(null);
  const placesLibRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async (g) => {
        if (cancelled) return;
        const lib = await g.maps.importLibrary("places");
        placesLibRef.current = lib;
        sessionTokenRef.current = new (lib as any).AutocompleteSessionToken();
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const fetchSuggestions = (q: string) => {
    if (!placesLibRef.current || !sessionTokenRef.current || q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    (placesLibRef.current as any).AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: q,
      sessionToken: sessionTokenRef.current,
      includedRegionCodes: ["br"],
      locationBias: {
        center: { lat: -7.236629, lng: -35.922702 },
        radius: 30000,
      },
    })
      .then(({ suggestions }: any) => {
        setSuggestions(suggestions || []);
        setOpen(true);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  };

  const onChange = (v: string) => {
    setInput(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchSuggestions(v), 250);
  };

  const pick = async (sug: any) => {
    try {
      const place = sug.placePrediction.toPlace();
      await place.fetchFields({
        fields: ["formattedAddress", "location", "addressComponents", "id"],
      });
      const loc = place.location;
      const comps = (place.addressComponents || []).map((c: any) => ({
        long_name: c.longText,
        short_name: c.shortText,
        types: c.types,
      })) as google.maps.GeocoderAddressComponent[];
      const parts = extractComponents(comps);
      const addr: SelectedAddress = {
        formatted: place.formattedAddress || sug.placePrediction.text?.text || "",
        lat: typeof loc?.lat === "function" ? loc.lat() : (loc as any)?.lat,
        lng: typeof loc?.lng === "function" ? loc.lng() : (loc as any)?.lng,
        place_id: place.id || "",
        ...parts,
      };
      setInput(addr.formatted);
      setOpen(false);
      onSelect(addr);
      // Renova session token após seleção (boas práticas Places)
      if (placesLibRef.current) {
        sessionTokenRef.current = new (placesLibRef.current as any).AutocompleteSessionToken();
      }
    } catch {
      /* ignore */
    }
  };

  return (
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
          className="pl-8"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-72 overflow-auto">
          {suggestions.map((s, i) => {
            const main = s.placePrediction?.mainText?.text || s.placePrediction?.text?.text || "";
            const secondary = s.placePrediction?.secondaryText?.text || "";
            return (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0"
              >
                <div className="font-medium">{main}</div>
                {secondary && <div className="text-xs text-muted-foreground">{secondary}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
