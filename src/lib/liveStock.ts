import { supabase } from "@/integrations/supabase/client";

export type LiveItem = {
  product_id: string;
  name: string;
  stock: number;
  price: number;
  active: boolean;
  fresh: boolean;
};

export type LiveCheckResult = {
  ok: boolean;
  items: LiveItem[];
  error?: string;
};

/**
 * Consulta o sistema da farmácia (Trier) na hora e devolve estoque/preço reais.
 * A loja usa um endpoint público mínimo que aceita somente IDs de produtos e
 * encaminha internamente a ação permitida. A função administrativa Trier não
 * precisa mais ficar exposta para esta leitura.
 */
export async function liveCheckProductsDetailed(productIds: string[]): Promise<LiveCheckResult> {
  const ids = Array.from(new Set(productIds.filter(Boolean))).slice(0, 30);
  if (ids.length === 0) return { ok: false, items: [], error: "Nenhum produto para conferir." };
  try {
    const { data, error } = await supabase.functions.invoke("trier-live-check", {
      body: { product_ids: ids },
    });
    if (error || !data?.ok) {
      return { ok: false, items: [], error: data?.error || error?.message || "A Trier não respondeu." };
    }
    const items = (data.items || []) as LiveItem[];
    const allFresh = ids.every((id) => items.some((item) => item.product_id === id && item.fresh));
    return {
      ok: allFresh,
      items,
      error: allFresh ? undefined : "Não foi possível confirmar todos os produtos na Trier.",
    };
  } catch (error) {
    return { ok: false, items: [], error: error instanceof Error ? error.message : "A Trier não respondeu." };
  }
}

export async function liveCheckProducts(productIds: string[]): Promise<LiveItem[]> {
  return (await liveCheckProductsDetailed(productIds)).items;
}
