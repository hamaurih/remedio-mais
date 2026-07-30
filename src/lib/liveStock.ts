import { supabase } from "@/integrations/supabase/client";

export type LiveItem = {
  product_id: string;
  name: string;
  stock: number;
  price: number;
  active: boolean;
  fresh: boolean;
};

/**
 * Consulta o sistema da farmácia (Trier) na hora e devolve estoque/preço reais.
 * Também grava os valores atualizados no banco, para o site não ficar defasado
 * entre um ciclo de sincronização e outro.
 */
export async function liveCheckProducts(productIds: string[]): Promise<LiveItem[]> {
  const ids = Array.from(new Set(productIds.filter(Boolean))).slice(0, 30);
  if (ids.length === 0) return [];
  try {
    const { data, error } = await supabase.functions.invoke("trier", {
      body: { action: "live-check", product_ids: ids },
    });
    if (error || !data?.ok) return [];
    return (data.items || []) as LiveItem[];
  } catch {
    return [];
  }
}
