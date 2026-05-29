import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

export type PickerKind = "product" | "category" | "campaign";

export type PickedEntity = {
  id: string;
  name: string;
  slug: string | null;
  image_url: string | null;
  subtitle?: string | null;
  raw: any;
};

interface Props {
  kind: PickerKind;
  value?: PickedEntity | null;
  onPick: (entity: PickedEntity | null) => void;
  placeholder?: string;
}

export function EntityPicker({ kind, value, onPick, placeholder }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PickedEntity[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search || search.length < 2) {
        setResults([]);
        return;
      }
      const term = `%${search}%`;
      if (kind === "product") {
        const { data } = await (supabase as any)
          .from("products")
          .select(
            "id,name,slug,image_url,short_description,sku,barcode,laboratory,category_name,on_sale,requires_prescription,controlled,price,promo_price,manufacturer",
          )
          .eq("active", true)
          .or(
            `name.ilike.${term},sku.ilike.${term},barcode.ilike.${term},laboratory.ilike.${term},category_name.ilike.${term}`,
          )
          .limit(15);
        setResults(
          ((data ?? []) as any[]).map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            image_url: p.image_url,
            subtitle: p.laboratory || p.category_name || p.short_description,
            raw: p,
          })),
        );
      } else if (kind === "category") {
        const { data } = await (supabase as any)
          .from("categories")
          .select("id,name,slug,image_url,description")
          .eq("active", true)
          .ilike("name", term)
          .limit(15);
        setResults(
          ((data ?? []) as any[]).map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            image_url: c.image_url,
            subtitle: c.description,
            raw: c,
          })),
        );
      } else {
        const { data } = await (supabase as any)
          .from("campaigns")
          .select("id,name,slug,banner_image_url,subtitle,cta_text")
          .ilike("name", term)
          .limit(15);
        setResults(
          ((data ?? []) as any[]).map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            image_url: c.banner_image_url,
            subtitle: c.subtitle,
            raw: c,
          })),
        );
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, kind]);

  if (value) {
    return (
      <div className="flex items-center gap-2 border rounded-md p-2 bg-background">
        {value.image_url && (
          <img src={value.image_url} alt="" className="h-10 w-10 object-contain" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{value.name}</div>
          {value.subtitle && (
            <div className="text-xs text-muted-foreground truncate">{value.subtitle}</div>
          )}
        </div>
        <button
          onClick={() => onPick(null)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remover"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={placeholder || "Buscar…"}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="pl-9"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onPick(r);
                setSearch("");
                setResults([]);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left text-sm"
            >
              {r.image_url && (
                <img src={r.image_url} alt="" className="h-8 w-8 object-contain shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate">{r.name}</div>
                {r.subtitle && (
                  <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
