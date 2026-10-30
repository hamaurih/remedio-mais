import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;
const MAX_ROWS = 5000;

/**
 * Loads manufacturer strings for a listing scope (category, department or search)
 * without downloading product cards. Callers apply the same scope used by the grid.
 */
export async function loadManufacturerNames(scope: (query: any) => any): Promise<string[]> {
  const names: string[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = (supabase as any)
      .from("products")
      .select("manufacturer")
      .eq("active", true)
      .not("manufacturer", "is", null)
      .order("id", { ascending: true });
    query = scope(query);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const name = String(row.manufacturer || "").trim();
      if (name) names.push(name);
    }
    if (rows.length < PAGE) break;
  }
  return names;
}
