import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Menu, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Category {
  name: string;
  slug: string;
  macro_group?: string | null;
}

const DEFAULT_CATS: Category[] = [
  { name: "Ofertas", slug: "ofertas" },
  { name: "Medicamentos", slug: "medicamentos", macro_group: "Medicamentos e Saúde" },
  { name: "Genéricos", slug: "genericos", macro_group: "Medicamentos e Saúde" },
  { name: "Dor e Febre", slug: "dor-e-febre", macro_group: "Medicamentos e Saúde" },
  { name: "Gripe e Resfriado", slug: "gripe-e-resfriado", macro_group: "Medicamentos e Saúde" },
  { name: "Vitaminas", slug: "vitaminas", macro_group: "Vitaminas e Suplementos" },
  { name: "Higiene Pessoal", slug: "higiene-pessoal", macro_group: "Higiene Pessoal" },
  { name: "Mamães e Bebês", slug: "mamaes-e-bebes", macro_group: "Mamães e Bebês" },
  { name: "Dermocosméticos", slug: "dermocosmeticos", macro_group: "Dermo e Beleza" },
  { name: "Conveniência", slug: "conveniencia", macro_group: "Conveniência" },
  { name: "Primeiros Socorros", slug: "primeiros-socorros", macro_group: "Primeiros Socorros" },
  { name: "Aparelhos de Saúde", slug: "aparelhos-de-saude", macro_group: "Medicamentos e Saúde" },
];

const GROUP_ORDER = [
  "Medicamentos e Saúde",
  "Dermo e Beleza",
  "Higiene Pessoal",
  "Mamães e Bebês",
  "Vitaminas e Suplementos",
  "Conveniência",
  "Primeiros Socorros",
];

function buildMacroGroups(all: Category[]) {
  const byGroup = new Map<string, Category[]>();
  all.forEach((c) => {
    const g = (c.macro_group || "").trim();
    if (!g) return;
    const list = byGroup.get(g) ?? [];
    if (!list.find((x) => x.slug === c.slug)) list.push(c);
    byGroup.set(g, list);
  });
  const ordered: { label: string; items: Category[] }[] = [];
  GROUP_ORDER.forEach((g) => {
    if (byGroup.has(g)) {
      ordered.push({ label: g, items: byGroup.get(g)! });
      byGroup.delete(g);
    }
  });
  Array.from(byGroup.entries()).forEach(([label, items]) =>
    ordered.push({ label, items })
  );
  return ordered;
}

function MegaMenuDesktop({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const groups = buildMacroGroups(categories);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-sm hover:shadow-md transition"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Menu className="h-4 w-4" /> Todas as Categorias
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full pt-2 z-50 w-[min(960px,90vw)]">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
            {groups.map((g) => (
              <div key={g.label} className="min-w-0">
                <div className="text-xs uppercase tracking-wider font-extrabold text-primary mb-2">
                  {g.label}
                </div>
                <ul className="space-y-1.5">
                  {g.items.map((c) => (
                    <li key={c.slug}>
                      <Link
                        to={`/categoria/${c.slug}`}
                        className="text-sm text-foreground hover:text-primary transition-colors"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MegaMenuMobile({ categories }: { categories: Category[] }) {
  const groups = buildMacroGroups(categories);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-bold text-sm shrink-0"
        >
          <Menu className="h-4 w-4" /> Categorias
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] sm:w-96 p-0 overflow-y-auto">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-left">Todas as Categorias</SheetTitle>
        </SheetHeader>
        <Accordion type="multiple" className="px-2 py-2">
          {groups.map((g) => (
            <AccordionItem key={g.label} value={g.label} className="border-b">
              <AccordionTrigger className="px-2 text-sm font-bold">
                {g.label}
              </AccordionTrigger>
              <AccordionContent>
                <ul className="px-2 pb-2 space-y-1">
                  {g.items.map((c) => (
                    <li key={c.slug}>
                      <Link
                        to={`/categoria/${c.slug}`}
                        className="block py-1.5 text-sm text-foreground hover:text-primary"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SheetContent>
    </Sheet>
  );
}

export function CategoryNav({ categories }: { categories?: Category[] }) {
  // Prefer live categories from DB so mega menu reflects published items
  const { data: live } = useQuery({
    queryKey: ["nav_categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("name, slug, macro_group")
        .eq("active", true)
        .order("position");
      return (data ?? []) as Category[];
    },
  });

  const cats = categories ?? live ?? DEFAULT_CATS;
  // Merge with defaults — DB entries (with macro_group) override defaults
  const bySlug = new Map<string, Category>();
  DEFAULT_CATS.forEach((c) => bySlug.set(c.slug, c));
  cats.forEach((c) => {
    const prev = bySlug.get(c.slug);
    bySlug.set(c.slug, { ...prev, ...c, macro_group: c.macro_group ?? prev?.macro_group ?? null });
  });
  const merged = Array.from(bySlug.values());

  return (
    <nav className="border-t bg-background">
      <div className="container flex items-stretch gap-2 py-2 md:py-2.5">
        {/* Mega menu trigger */}
        <div className="hidden md:flex items-center">
          <MegaMenuDesktop categories={merged} />
        </div>
        <div className="md:hidden flex items-center">
          <MegaMenuMobile categories={merged} />
        </div>

        {/* Chips */}
        <div className="flex-1 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
          <ul className="flex gap-1 md:gap-2 whitespace-nowrap text-sm items-center">
            {merged.map((c) => (
              <li key={c.slug} className="snap-start">
                <Link
                  to={`/categoria/${c.slug}`}
                  className="inline-block px-3 md:px-4 py-1.5 rounded-full hover:bg-accent hover:text-accent-foreground transition-colors font-medium relative group"
                >
                  <span>{c.name}</span>
                  <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-200" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
