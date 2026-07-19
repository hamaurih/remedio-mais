import { useStorefrontTenant } from "@/hooks/useStorefrontTenant";
import { selectStorefrontRows, storefrontQueryKey } from "@/lib/storefrontQuery";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/store";
import productPlaceholder from "@/assets/product-placeholder.jpg";

type Suggestion = {
  id: string;
  name: string;
  slug: string;
  price: number;
  promo_price: number | null;
  on_sale: boolean;
  requires_prescription: boolean;
  image_url: string | null;
  manufacturer: string | null;
  category_name: string | null;
};

const MAX = 8;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function rank(name: string, term: string) {
  const n = name.toLowerCase();
  const t = term.toLowerCase();
  if (n.startsWith(t)) return 0;
  if (n.split(/\s+/).some((w) => w.startsWith(t))) return 1;
  if (n.includes(t)) return 2;
  return 3;
}

export function SearchAutocomplete({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const storefront = useStorefrontTenant();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(q.trim(), 300);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    let cancel = false;
    if (debounced.length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    const term = debounced.replace(/[%_]/g, "");
    const numeric = /^\d+$/.test(term);
    const orFilter = [
      `name.ilike.${term}%`,
      `name.ilike.%${term}%`,
      `manufacturer.ilike.%${term}%`,
      `active_ingredient.ilike.%${term}%`,
      numeric ? `barcode.eq.${term}` : null,
    ]
      .filter(Boolean)
      .join(",");

    selectStorefrontRows("products", "id,name,slug,price,promo_price,on_sale,requires_prescription,image_url,manufacturer,category_name", storefront)
      .eq("active", true)
      .gt("stock", 0)
      .or(orFilter)
      .limit(20)
      .then(({ data }) => {
        if (cancel) return;
        const rows = (data ?? []) as Suggestion[];
        rows.sort((a, b) => {
          const ra = rank(a.name, term);
          const rb = rank(b.name, term);
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name);
        });
        setItems(rows.slice(0, MAX));
        setLoading(false);
        setOpen(true);
        setActive(-1);
      });
    return () => {
      cancel = true;
    };
  }, [debounced]);

  function submit(term?: string) {
    const t = (term ?? q).trim();
    if (!t) return;
    setOpen(false);
    nav(`/buscar?q=${encodeURIComponent(t)}`);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || items.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) {
        setOpen(false);
        nav(`/produto/${items[active].slug}`);
      } else {
        submit();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKey}
          placeholder="Busque por produto, marca ou princípio ativo"
          className={`pl-10 pr-10 ${compact ? "h-10" : "h-11"} rounded-full bg-secondary border-transparent focus-visible:ring-primary w-full`}
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setItems([]);
              setOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-popover border border-border rounded-xl shadow-elevated overflow-hidden">
          {loading && items.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Buscando…</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhum produto encontrado.</div>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto divide-y">
              {items.map((p, i) => {
                const final = p.promo_price ?? p.price;
                const promo = !!p.promo_price && p.promo_price < p.price;
                return (
                  <li key={p.id}>
                    <Link
                      to={`/produto/${p.slug}`}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex items-center gap-3 p-3 hover:bg-accent transition-colors ${
                        active === i ? "bg-accent" : ""
                      }`}
                    >
                      <img
                        src={p.image_url || productPlaceholder}
                        alt={p.name}
                        className="h-12 w-12 object-contain rounded bg-secondary/30 shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold line-clamp-1">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground line-clamp-1">
                          {[p.manufacturer, p.category_name].filter(Boolean).join(" • ")}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm font-extrabold text-primary">{formatBRL(final)}</span>
                          {promo && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                              Promoção
                            </span>
                          )}
                          {p.requires_prescription && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                              Receita
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => submit()}
                  className="w-full text-left px-3 py-2.5 text-sm font-semibold text-primary hover:bg-accent"
                >
                  Ver todos os resultados para “{q.trim()}”
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
