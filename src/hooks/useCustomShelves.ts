import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomShelf {
  id: string;
  shelf_key: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  background_variant: string;
  view_all_link: string | null;
  max_items: number;
  active: boolean;
}

export const CUSTOM_SHELF_PREFIX = "custom_shelf:";

/** section_key usado na tabela home_layout para uma vitrine personalizada */
export function customShelfSectionKey(shelfKey: string) {
  return `${CUSTOM_SHELF_PREFIX}${shelfKey}`;
}

export function slugifyShelfKey(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Vitrines personalizadas criadas em Admin > Vitrines da Home */
export function useCustomShelves(onlyActive = true) {
  return useQuery({
    queryKey: ["home_custom_shelves", onlyActive],
    queryFn: async () => {
      let q = (supabase as any).from("home_custom_shelves").select("*").order("created_at");
      if (onlyActive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CustomShelf[];
    },
  });
}
