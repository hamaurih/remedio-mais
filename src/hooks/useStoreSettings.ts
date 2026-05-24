import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreSettings = {
  whatsapp: string | null;
  address: string | null;
  instagram: string | null;
  hours: string | null;
  delivery_fee: number | null;
  hero_title: string | null;
  hero_subtitle: string | null;
};

export function useStoreSettings() {
  return useQuery({
    queryKey: ["store_settings"],
    queryFn: async (): Promise<StoreSettings> => {
      const { data, error } = await (supabase as any).from("store_settings_public").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data as StoreSettings) ?? {
        whatsapp: "5583999286000", address: null, instagram: null, hours: null,
        delivery_fee: 0, hero_title: null, hero_subtitle: null,
      };
    },
  });
}
