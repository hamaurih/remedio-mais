import { useQuery } from "@tanstack/react-query";
import { publicBootstrapQueryOptions } from "@/hooks/usePublicBootstrap";

export type StoreSettings = {
  whatsapp: string | null;
  address: string | null;
  instagram: string | null;
  hours: string | null;
  delivery_fee: number | null;
  delivery_mode: "flat" | "distance" | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  store_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  state_registration: string | null;
  pharmacist_name: string | null;
  crf: string | null;
  sanitary_license: string | null;
  afe: string | null;
  contact_email: string | null;
  facebook: string | null;
  tiktok: string | null;
  footer_text: string | null;
  sanitary_notice: string | null;
};

export function useStoreSettings() {
  return useQuery({
    ...publicBootstrapQueryOptions,
    select: (bootstrap): StoreSettings =>
      (bootstrap.settings as StoreSettings | null) ??
        ({
          whatsapp: "5583999286000",
          address: null,
          instagram: null,
          hours: null,
          delivery_fee: 0,
          delivery_mode: "distance",
          hero_title: null,
          hero_subtitle: null,
          store_name: null,
          legal_name: null,
          cnpj: null,
          state_registration: null,
          pharmacist_name: null,
          crf: null,
          sanitary_license: null,
          afe: null,
          contact_email: null,
          facebook: null,
          tiktok: null,
          footer_text: null,
          sanitary_notice: null,
        } as StoreSettings),
  });
}
