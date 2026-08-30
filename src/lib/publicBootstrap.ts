import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PublicMenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
export type PublicCategory = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  | "id"
  | "name"
  | "slug"
  | "macro_group"
  | "show_in_menu"
  | "department_id"
  | "position"
>;
export type PublicDepartment = Pick<
  Database["public"]["Tables"]["departments"]["Row"],
  "id" | "name" | "slug" | "position" | "show_in_menu"
>;
export type PublicSubcategory = Pick<
  Database["public"]["Tables"]["subcategories"]["Row"],
  "id" | "name" | "slug" | "category_id" | "position" | "show_in_menu"
>;
export type PublicStoreSettings =
  Database["public"]["Views"]["store_settings_public"]["Row"];

export interface PublicBootstrapData {
  version: 1;
  generatedAt: string;
  settings: PublicStoreSettings | null;
  menuItems: PublicMenuItem[];
  categories: PublicCategory[];
  departments: PublicDepartment[];
  subcategories: PublicSubcategory[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPublicBootstrapData(
  value: unknown,
): value is PublicBootstrapData {
  return (
    isObject(value) &&
    value.version === 1 &&
    typeof value.generatedAt === "string" &&
    (value.settings === null || isObject(value.settings)) &&
    Array.isArray(value.menuItems) &&
    Array.isArray(value.categories) &&
    Array.isArray(value.departments) &&
    Array.isArray(value.subcategories)
  );
}

async function fetchDirectBootstrap(): Promise<PublicBootstrapData> {
  const [settingsResult, menuResult, categoryResult, departmentResult, subcategoryResult] =
    await Promise.all([
      supabase
        .from("store_settings_public")
        .select("*")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("menu_items")
        .select("*")
        .eq("active", true)
        .order("position"),
      supabase
        .from("categories")
        .select(
          "id,name,slug,macro_group,show_in_menu,department_id,position",
        )
        .eq("active", true)
        .order("position"),
      supabase
        .from("departments")
        .select("id,name,slug,position,show_in_menu")
        .eq("active", true)
        .order("position"),
      supabase
        .from("subcategories")
        .select("id,name,slug,category_id,position,show_in_menu")
        .eq("active", true)
        .order("position"),
    ]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    settings: (settingsResult.data as PublicStoreSettings | null) ?? null,
    menuItems: (menuResult.data as PublicMenuItem[] | null) ?? [],
    categories: (categoryResult.data as PublicCategory[] | null) ?? [],
    departments: (departmentResult.data as PublicDepartment[] | null) ?? [],
    subcategories:
      (subcategoryResult.data as PublicSubcategory[] | null) ?? [],
  };
}

export async function fetchPublicBootstrap(): Promise<PublicBootstrapData> {
  try {
    const response = await fetch("/api/public-bootstrap", {
      headers: { Accept: "application/json" },
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(`Public bootstrap respondeu ${response.status}`);
    }

    const data: unknown = await response.json();
    if (!isPublicBootstrapData(data)) {
      throw new Error("Public bootstrap retornou um formato inválido");
    }

    return data;
  } catch {
    // Se a nova camada não estiver disponível, preserva o caminho público atual.
    return fetchDirectBootstrap();
  }
}
