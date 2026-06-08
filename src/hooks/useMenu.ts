import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MenuArea =
  | "header_main"
  | "all_categories"
  | "footer_institutional"
  | "footer_support"
  | "footer_categories"
  | "mobile_menu";

export interface MenuItem {
  id: string;
  menu_area: MenuArea | string;
  label: string;
  slug: string | null;
  link_type: string;
  url: string | null;
  category_id: string | null;
  campaign_id: string | null;
  product_id: string | null;
  page_key: string | null;
  parent_id: string | null;
  position: number;
  active: boolean;
  show_on_desktop: boolean;
  show_on_mobile: boolean;
  open_in_new_tab: boolean;
  icon: string | null;
  badge_text: string | null;
  highlight: boolean;
  children?: MenuItem[];
}

export const PAGE_KEYS: { key: string; label: string; path: string }[] = [
  { key: "home", label: "Home", path: "/" },
  { key: "offers", label: "Ofertas", path: "/categoria/ofertas" },
  { key: "medicamentos", label: "Medicamentos", path: "/categoria/medicamentos" },
  { key: "genericos", label: "Genéricos", path: "/categoria/genericos" },
  { key: "send_prescription", label: "Enviar Receita", path: "/enviar-receita" },
  { key: "contact", label: "Fale Conosco", path: "/fale-conosco" },
  { key: "privacy", label: "Política de Privacidade", path: "/politica-de-privacidade" },
  { key: "terms", label: "Termos de Uso", path: "/termos-de-uso" },
  { key: "returns", label: "Trocas e Devoluções", path: "/trocas-e-devolucoes" },
  { key: "about", label: "Sobre", path: "/sobre" },
  { key: "departamentos", label: "Departamentos", path: "/departamentos" },
];

export function resolveMenuHref(m: Pick<MenuItem, "link_type" | "url" | "slug" | "page_key">): string {
  switch (m.link_type) {
    case "category":
      return m.url || (m.slug ? `/categoria/${m.slug}` : "#");
    case "subcategory":
      return m.url || "#";
    case "campaign":
      return m.url || (m.slug ? `/campanha/${m.slug}` : "#");
    case "product":
      return m.url || (m.slug ? `/produto/${m.slug}` : "#");
    case "page": {
      const found = PAGE_KEYS.find((p) => p.key === m.page_key);
      return m.url || found?.path || "#";
    }
    case "group":
      return "#";
    case "manual":
    default:
      return m.url || "#";
  }
}

function buildTree(rows: MenuItem[]): MenuItem[] {
  const byId = new Map<string, MenuItem>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const roots: MenuItem[] = [];
  byId.forEach((it) => {
    if (it.parent_id && byId.has(it.parent_id)) {
      byId.get(it.parent_id)!.children!.push(it);
    } else {
      roots.push(it);
    }
  });
  const sort = (arr: MenuItem[]) => {
    arr.sort((a, b) => a.position - b.position);
    arr.forEach((c) => c.children && sort(c.children));
  };
  sort(roots);
  return roots;
}

export function useMenu(area: MenuArea) {
  return useQuery({
    queryKey: ["menu_items", area],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("menu_items")
        .select("*")
        .eq("menu_area", area)
        .eq("active", true)
        .order("position");
      if (error) throw error;
      return buildTree((data ?? []) as MenuItem[]);
    },
  });
}
