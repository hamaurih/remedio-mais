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
import { useMenu, resolveMenuHref, type MenuItem } from "@/hooks/useMenu";

export interface Category {
  id?: string;
  name: string;
  slug: string;
  macro_group?: string | null;
  show_in_menu?: boolean | null;
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

type MegaItem = { label: string; href: string; group: string };

function buildGroups(items: MegaItem[]) {
  const byGroup = new Map<string, MegaItem[]>();
  items.forEach((it) => {
    const g = it.group || "Outros";
    const list = byGroup.get(g) ?? [];
    if (!list.find((x) => x.href === it.href)) list.push(it);
    byGroup.set(g, list);
  });
  const ordered: { label: string; items: MegaItem[] }[] = [];
  GROUP_ORDER.forEach((g) => {
    if (byGroup.has(g)) {
      ordered.push({ label: g, items: byGroup.get(g)! });
      byGroup.delete(g);
    }
  });
  Array.from(byGroup.entries()).forEach(([label, items]) => ordered.push({ label, items }));
  return ordered;
}

type MegaCategory = { label: string; href: string; subs: { label: string; href: string }[] };
type MegaGroupRich = { label: string; categories: MegaCategory[] };

function MegaMenuDesktop({ groups }: { groups: MegaGroupRich[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="inline-flex items-center gap-2 px-4 md:px-5 py-2 rounded-full bg-primary text-primary-foreground font-bold text-base md:text-lg shadow-sm hover:shadow-md transition"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Menu className="h-5 w-5" /> <span className="hidden sm:inline">Todas as Categorias</span><span className="sm:hidden">Categorias</span>
        <ChevronDown className={cn("h-5 w-5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-2 z-50 w-[min(1080px,92vw)]">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 max-h-[70vh] overflow-y-auto">
            {groups.map((g) => (
              <div key={g.label} className="min-w-0">
                <div className="text-sm uppercase tracking-wider font-extrabold text-primary mb-2">{g.label}</div>
                <ul className="space-y-3">
                  {g.categories.map((c) => (
                    <li key={c.href}>
                      <Link to={c.href} className="text-base font-semibold text-foreground hover:text-primary transition-colors">{c.label}</Link>
                      {c.subs.length > 0 && (
                        <ul className="mt-1.5 ml-2 space-y-1 border-l border-border pl-2">
                          {c.subs.map((s) => (
                            <li key={s.href}>
                              <Link to={s.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{s.label}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
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

function MegaMenuMobile({ groups }: { groups: MegaGroupRich[] }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-bold text-base shrink-0">
          <Menu className="h-5 w-5" /> Categorias
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] sm:w-96 p-0 overflow-y-auto">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-left">Todas as Categorias</SheetTitle>
        </SheetHeader>
        <Accordion type="multiple" className="px-2 py-2">
          {groups.map((g) => (
            <AccordionItem key={g.label} value={g.label} className="border-b">
              <AccordionTrigger className="px-2 text-base font-bold">{g.label}</AccordionTrigger>
              <AccordionContent>
                <ul className="px-2 pb-2 space-y-2.5">
                  {g.categories.map((c) => (
                    <li key={c.href}>
                      <Link to={c.href} className="block py-1 text-base font-semibold text-foreground hover:text-primary">{c.label}</Link>
                      {c.subs.length > 0 && (
                        <ul className="ml-3 mt-1 space-y-1 border-l border-border pl-2">
                          {c.subs.map((s) => (
                            <li key={s.href}>
                              <Link to={s.href} className="block py-0.5 text-sm text-muted-foreground hover:text-primary">{s.label}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
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

export function CategoryNav() {
  // Live categories — keeps macro_group info for grouping the mega menu
  const { data: live } = useQuery({
    queryKey: ["nav_categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug, macro_group, show_in_menu")
        .eq("active", true)
        .order("position");
      return (data ?? []) as Category[];
    },
  });

  // New taxonomy: departments + per-category subcategories
  const { data: depts = [] } = useQuery({
    queryKey: ["nav_departments"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("departments")
        .select("id, name, slug, position, show_in_menu")
        .eq("active", true)
        .order("position");
      return (data ?? []) as Array<{ id: string; name: string; slug: string; position: number; show_in_menu: boolean }>;
    },
  });
  const { data: catsWithDept = [] } = useQuery({
    queryKey: ["nav_cats_with_dept"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("categories")
        .select("id, name, slug, department_id, position")
        .eq("active", true)
        .order("position");
      return (data ?? []) as Array<{ id: string; name: string; slug: string; department_id: string | null; position: number }>;
    },
  });
  const { data: subsAll = [] } = useQuery({
    queryKey: ["nav_subs"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subcategories")
        .select("id, name, slug, category_id, position, show_in_menu")
        .eq("active", true)
        .order("position");
      return (data ?? []) as Array<{ id: string; name: string; slug: string; category_id: string; position: number; show_in_menu: boolean }>;
    },
  });

  const { data: headerMenu = [] } = useMenu("header_main");
  const { data: allCatsMenu = [] } = useMenu("all_categories");

  // Map category_id -> macro_group from live categories
  const macroById = new Map<string, string | null>();
  const macroBySlug = new Map<string, string | null>();
  const liveBySlug = new Map<string, Category>();
  (live ?? []).forEach((c) => {
    if (c.id) macroById.set(c.id, c.macro_group ?? null);
    macroBySlug.set(c.slug, c.macro_group ?? null);
    liveBySlug.set(c.slug, c);
  });
  DEFAULT_CATS.forEach((c) => {
    if (!macroBySlug.has(c.slug)) macroBySlug.set(c.slug, c.macro_group ?? null);
  });

  const resolveGroup = (m: MenuItem) =>
    (m.category_id && macroById.get(m.category_id)) ||
    (m.slug && macroBySlug.get(m.slug)) ||
    "Outros";

  // CHIPS — prefer header_main from DB, fallback to live categories
  const chipsFromMenu: { label: string; href: string; key: string; highlight?: boolean }[] = headerMenu
    .filter((m) => m.show_on_desktop || m.show_on_mobile)
    .map((m) => ({ label: m.label, href: resolveMenuHref(m), key: m.id, highlight: m.highlight }));

  const chipsFallback = (() => {
    const bySlug = new Map<string, Category>();
    DEFAULT_CATS.forEach((c) => bySlug.set(c.slug, { ...c, show_in_menu: true }));
    (live ?? []).forEach((c) => bySlug.set(c.slug, { ...(bySlug.get(c.slug) || {}), ...c, show_in_menu: c.show_in_menu ?? true }));
    return Array.from(bySlug.values())
      .filter((c) => c.show_in_menu !== false)
      .map((c) => ({ label: c.name, href: `/categoria/${c.slug}`, key: c.slug, highlight: c.name.toLowerCase().includes("oferta") }));
  })();

  const chipList = chipsFromMenu.length > 0 ? chipsFromMenu : chipsFallback;
  const isHighlightChip = (c: { label: string; highlight?: boolean }) =>
    c.highlight || c.label.toLowerCase().includes("melhores ofertas");

  // ----- Build MEGA MENU groups (rich) -----
  // Priority 1: new departments → categories → subcategories (when populated)
  const subsByCategory = new Map<string, Array<{ label: string; href: string }>>();
  subsAll.forEach((s) => {
    if (s.show_in_menu === false) return;
    const cat = catsWithDept.find((c) => c.id === s.category_id);
    if (!cat) return;
    const arr = subsByCategory.get(s.category_id) ?? [];
    arr.push({ label: s.name, href: `/categoria/${cat.slug}/${s.slug}` });
    subsByCategory.set(s.category_id, arr);
  });

  const linkedDepartments = depts.filter(
    (d) => d.show_in_menu !== false && catsWithDept.some((c) => c.department_id === d.id)
  );

  let groups: MegaGroupRich[];
  if (linkedDepartments.length > 0) {
    groups = linkedDepartments.map((d) => ({
      label: d.name,
      categories: catsWithDept
        .filter((c) => c.department_id === d.id)
        .map((c) => ({
          label: c.name,
          href: `/categoria/${c.slug}`,
          subs: subsByCategory.get(c.id) ?? [],
        })),
    }));
  } else {
    // Fallback: legacy macro_group grouping
    const megaItems: MegaItem[] = allCatsMenu.length > 0
      ? allCatsMenu.map((m) => ({ label: m.label, href: resolveMenuHref(m), group: resolveGroup(m) || "Outros" }))
      : (live ?? DEFAULT_CATS)
          .filter((c) => c.macro_group)
          .map((c) => ({ label: c.name, href: `/categoria/${c.slug}`, group: c.macro_group || "Outros" }));
    const legacy = buildGroups(megaItems);
    groups = legacy.map((g) => ({
      label: g.label,
      categories: g.items.map((it) => ({ label: it.label, href: it.href, subs: [] })),
    }));
  }

  return (
    <nav className="border-t bg-background">
      <div className="container flex items-stretch gap-2 py-2 md:py-2.5">
        <div className="hidden md:flex items-center">
          <MegaMenuDesktop groups={groups} />
        </div>
        <div className="md:hidden flex items-center">
          <MegaMenuMobile groups={groups} />
        </div>

        <div className="flex-1 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
          <ul className="flex gap-2 md:gap-3 whitespace-nowrap text-base md:text-lg items-center">
            {chipList.map((c) => (
              <li key={c.key} className="snap-start">
                <Link
                  to={c.href}
                  className="inline-block px-3 md:px-4 py-1.5 rounded-full hover:bg-accent hover:text-accent-foreground transition-colors font-semibold relative group"
                >
                  <span>{c.label}</span>
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
