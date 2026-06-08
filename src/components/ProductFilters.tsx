import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { SlidersHorizontal, X } from "lucide-react";

export type ProductFiltersState = {
  onSale: boolean;
  noPresc: boolean;
  withPresc: boolean;
  generic: boolean;
  inStock: boolean;
  priceMin: number | null;
  priceMax: number | null;
  categorySlugs: string[];
  manufacturers: string[];
  saleType: "" | "livre" | "receita" | "controlado";
};

export const defaultFilters: ProductFiltersState = {
  onSale: false,
  noPresc: false,
  withPresc: false,
  generic: false,
  inStock: true,
  priceMin: null,
  priceMax: null,
  categorySlugs: [],
  manufacturers: [],
  saleType: "",
};

const PRICE_RANGES: { label: string; min: number | null; max: number | null }[] = [
  { label: "Até R$ 10", min: 0, max: 10 },
  { label: "R$ 10 a R$ 25", min: 10, max: 25 },
  { label: "R$ 25 a R$ 50", min: 25, max: 50 },
  { label: "R$ 50 a R$ 100", min: 50, max: 100 },
  { label: "Acima de R$ 100", min: 100, max: null },
];

export function activeChips(f: ProductFiltersState): { label: string; clear: () => Partial<ProductFiltersState> }[] {
  const chips: { label: string; clear: () => Partial<ProductFiltersState> }[] = [];
  if (f.onSale) chips.push({ label: "Em promoção", clear: () => ({ onSale: false }) });
  if (f.noPresc) chips.push({ label: "Sem receita", clear: () => ({ noPresc: false }) });
  if (f.withPresc) chips.push({ label: "Com receita", clear: () => ({ withPresc: false }) });
  if (f.generic) chips.push({ label: "Genérico", clear: () => ({ generic: false }) });
  if (f.priceMin != null || f.priceMax != null) {
    const lbl =
      f.priceMin != null && f.priceMax != null
        ? `R$ ${f.priceMin} – R$ ${f.priceMax}`
        : f.priceMin != null
        ? `≥ R$ ${f.priceMin}`
        : `≤ R$ ${f.priceMax}`;
    chips.push({ label: lbl, clear: () => ({ priceMin: null, priceMax: null }) });
  }
  f.manufacturers.forEach((m) =>
    chips.push({ label: m, clear: () => ({ manufacturers: f.manufacturers.filter((x) => x !== m) }) })
  );
  f.categorySlugs.forEach((c) =>
    chips.push({ label: c, clear: () => ({ categorySlugs: f.categorySlugs.filter((x) => x !== c) }) })
  );
  if (f.saleType) chips.push({ label: `Tipo: ${f.saleType}`, clear: () => ({ saleType: "" }) });
  return chips;
}

function FilterBody({
  value,
  onChange,
  hideCategories,
  manufacturers,
}: {
  value: ProductFiltersState;
  onChange: (next: ProductFiltersState) => void;
  hideCategories?: boolean;
  manufacturers: string[];
}) {
  const { data: cats } = useQuery({
    queryKey: ["filter_categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("name, slug")
        .eq("active", true)
        .order("position");
      return data ?? [];
    },
    enabled: !hideCategories,
  });

  const set = (patch: Partial<ProductFiltersState>) => onChange({ ...value, ...patch });
  const togglePrice = (min: number | null, max: number | null) => {
    if (value.priceMin === min && value.priceMax === max) set({ priceMin: null, priceMax: null });
    else set({ priceMin: min, priceMax: max });
  };

  return (
    <Accordion type="multiple" defaultValue={["principal", "preco", "marca"]} className="w-full">
      <AccordionItem value="principal">
        <AccordionTrigger className="text-sm font-bold">Filtros principais</AccordionTrigger>
        <AccordionContent className="space-y-2.5">
          {[
            { k: "onSale", l: "Em promoção" },
            { k: "noPresc", l: "Sem necessidade de receita" },
            { k: "withPresc", l: "Com receita" },
            { k: "generic", l: "Genérico" },
            { k: "inStock", l: "Disponível em estoque" },
          ].map((o) => (
            <div key={o.k} className="flex items-center gap-2">
              <Checkbox
                id={`f-${o.k}`}
                checked={(value as any)[o.k]}
                onCheckedChange={(v) => set({ [o.k]: !!v } as any)}
              />
              <Label htmlFor={`f-${o.k}`} className="cursor-pointer text-sm">
                {o.l}
              </Label>
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="preco">
        <AccordionTrigger className="text-sm font-bold">Preço</AccordionTrigger>
        <AccordionContent className="space-y-2.5">
          {PRICE_RANGES.map((r) => {
            const checked = value.priceMin === r.min && value.priceMax === r.max;
            return (
              <div key={r.label} className="flex items-center gap-2">
                <Checkbox
                  id={`p-${r.label}`}
                  checked={checked}
                  onCheckedChange={() => togglePrice(r.min, r.max)}
                />
                <Label htmlFor={`p-${r.label}`} className="cursor-pointer text-sm">
                  {r.label}
                </Label>
              </div>
            );
          })}
          <div className="flex items-center gap-2 pt-2">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Mín"
              value={value.priceMin ?? ""}
              onChange={(e) => set({ priceMin: e.target.value ? Number(e.target.value) : null })}
              className="h-9"
            />
            <span className="text-muted-foreground text-xs">a</span>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Máx"
              value={value.priceMax ?? ""}
              onChange={(e) => set({ priceMax: e.target.value ? Number(e.target.value) : null })}
              className="h-9"
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      {!hideCategories && (
        <AccordionItem value="categoria">
          <AccordionTrigger className="text-sm font-bold">Categoria</AccordionTrigger>
          <AccordionContent className="space-y-2 max-h-64 overflow-y-auto">
            {(cats ?? []).map((c: any) => (
              <div key={c.slug} className="flex items-center gap-2">
                <Checkbox
                  id={`c-${c.slug}`}
                  checked={value.categorySlugs.includes(c.slug)}
                  onCheckedChange={(v) =>
                    set({
                      categorySlugs: v
                        ? [...value.categorySlugs, c.slug]
                        : value.categorySlugs.filter((x) => x !== c.slug),
                    })
                  }
                />
                <Label htmlFor={`c-${c.slug}`} className="cursor-pointer text-sm">
                  {c.name}
                </Label>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      )}

      <AccordionItem value="marca">
        <AccordionTrigger className="text-sm font-bold">Laboratório / Marca</AccordionTrigger>
        <AccordionContent className="space-y-2 max-h-64 overflow-y-auto">
          {manufacturers.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma marca disponível.</p>
          )}
          {manufacturers.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                id={`m-${m}`}
                checked={value.manufacturers.includes(m)}
                onCheckedChange={(v) =>
                  set({
                    manufacturers: v
                      ? [...value.manufacturers, m]
                      : value.manufacturers.filter((x) => x !== m),
                  })
                }
              />
              <Label htmlFor={`m-${m}`} className="cursor-pointer text-sm truncate">
                {m}
              </Label>
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="venda">
        <AccordionTrigger className="text-sm font-bold">Tipo de venda</AccordionTrigger>
        <AccordionContent className="space-y-2">
          {[
            { v: "", l: "Todos" },
            { v: "livre", l: "Livre" },
            { v: "receita", l: "Com receita" },
            { v: "controlado", l: "Controlado" },
          ].map((o) => (
            <label key={o.v} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="saletype"
                checked={value.saleType === o.v}
                onChange={() => set({ saleType: o.v as any })}
              />
              {o.l}
            </label>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function ProductFilters({
  value,
  onChange,
  hideCategories,
  manufacturers,
}: {
  value: ProductFiltersState;
  onChange: (next: ProductFiltersState) => void;
  hideCategories?: boolean;
  manufacturers: string[];
}) {
  return (
    <aside className="hidden md:block bg-card border rounded-xl p-4 h-fit shadow-card sticky top-24">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Filtros</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChange({ ...defaultFilters })}
        >
          Limpar
        </Button>
      </div>
      <FilterBody value={value} onChange={onChange} hideCategories={hideCategories} manufacturers={manufacturers} />
    </aside>
  );
}

export function MobileFilters({
  value,
  onChange,
  hideCategories,
  manufacturers,
  totalCount,
}: {
  value: ProductFiltersState;
  onChange: (next: ProductFiltersState) => void;
  hideCategories?: boolean;
  manufacturers: string[];
  totalCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="md:hidden gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Filtrar
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[90vw] sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <FilterBody value={draft} onChange={setDraft} hideCategories={hideCategories} manufacturers={manufacturers} />
        </div>
        <SheetFooter className="p-4 border-t flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setDraft({ ...defaultFilters });
            }}
          >
            Limpar
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Aplicar ({totalCount})
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function ActiveFilterChips({
  value,
  onChange,
}: {
  value: ProductFiltersState;
  onChange: (next: ProductFiltersState) => void;
}) {
  const chips = activeChips(value);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((c, i) => (
        <button
          key={i}
          onClick={() => onChange({ ...value, ...c.clear() })}
          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground hover:bg-accent/80"
        >
          {c.label} <X className="h-3 w-3" />
        </button>
      ))}
      <button
        onClick={() => onChange({ ...defaultFilters })}
        className="text-xs font-semibold text-primary hover:underline"
      >
        Limpar tudo
      </button>
    </div>
  );
}

export const SORT_OPTIONS = [
  { v: "popular", l: "Mais vendidos" },
  { v: "price_asc", l: "Menor preço" },
  { v: "price_desc", l: "Maior preço" },
  { v: "discount", l: "Maior desconto" },
  { v: "new", l: "Mais recentes" },
  { v: "name_asc", l: "Nome A-Z" },
  { v: "name_desc", l: "Nome Z-A" },
];

export function applyClientFilters<T extends any>(rows: T[], f: ProductFiltersState): T[] {
  return rows.filter((p: any) => {
    if (f.generic) {
      const t = `${p.name ?? ""} ${p.manufacturer ?? ""}`.toLowerCase();
      if (!/gen[eé]rico/.test(t)) return false;
    }
    if (f.saleType === "controlado" && !p.controlled) return false;
    if (f.saleType === "receita" && !p.requires_prescription) return false;
    if (f.saleType === "livre" && (p.requires_prescription || p.controlled)) return false;
    return true;
  });
}

export function buildQuery(base: any, f: ProductFiltersState) {
  let q = base;
  if (f.onSale) q = q.eq("on_sale", true);
  if (f.noPresc) q = q.eq("requires_prescription", false);
  if (f.withPresc) q = q.eq("requires_prescription", true);
  if (f.inStock) q = q.gt("stock", 0);
  if (f.priceMin != null) q = q.gte("price", f.priceMin);
  if (f.priceMax != null) q = q.lte("price", f.priceMax);
  if (f.manufacturers.length) q = q.in("manufacturer", f.manufacturers);
  return q;
}

export function sortQuery(q: any, sort: string) {
  switch (sort) {
    case "price_asc":
      return q.order("price", { ascending: true });
    case "price_desc":
      return q.order("price", { ascending: false });
    case "discount":
      return q.order("discount_percentage", { ascending: false, nullsFirst: false });
    case "new":
      return q.order("created_at", { ascending: false });
    case "name_asc":
      return q.order("name", { ascending: true });
    case "name_desc":
      return q.order("name", { ascending: false });
    default:
      return q.order("featured", { ascending: false }).order("updated_at", { ascending: false });
  }
}
