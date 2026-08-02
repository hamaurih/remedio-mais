import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { discountPercentage, hasActiveOffer } from "@/lib/collections";

const sb = supabase as any;

type TabKey =
  | "all"
  | "decrease"
  | "increase"
  | "promotion_started"
  | "active_offers"
  | "promotion_ended"
  | "expired_offers"
  | "out_of_stock_offer"
  | "inconsistent_offer"
  | "changed_in_offer"
  | "locked_base_price";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "decrease", label: "Preço reduzido" },
  { key: "increase", label: "Preço aumentado" },
  { key: "promotion_started", label: "Entraram em oferta" },
  { key: "active_offers", label: "Ofertas ativas" },
  { key: "promotion_ended", label: "Saíram da oferta" },
  { key: "expired_offers", label: "Ofertas expiradas" },
  { key: "out_of_stock_offer", label: "Sem estoque em oferta" },
  { key: "changed_in_offer", label: "Mudou de preço em oferta" },
  { key: "inconsistent_offer", label: "Ofertas inconsistentes" },
  { key: "locked_base_price", label: "Preço normal travado" },
];

const isInconsistent = (p: any) =>
  p?.promo_price != null && Number(p.price ?? 0) > 0 && Number(p.promo_price) >= Number(p.price);

const money = (v: any) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
const SOURCE_LABEL: Record<string, string> = {
  trier: "Trier",
  manual: "Manual",
  import: "Importação",
  campaign: "Campanha",
};

const PRODUCT_COLS =
  "id,name,image_url,stock,price,promo_price,on_sale,promotion_start,promotion_end,trier_product_id,shelves,active,lock_base_price,lock_promotion,promotion_source,last_trier_sync_at";

export default function AdminPriceMonitor() {
  const [tab, setTab] = useState<TabKey>("all");

  const history = useQuery({
    queryKey: ["price_history"],
    queryFn: async () => {
      const { data } = await sb
        .from("product_price_history")
        .select(`*, products:product_id(${PRODUCT_COLS})`)
        .order("changed_at", { ascending: false })
        .limit(500);
      return (data || []) as any[];
    },
  });

  const offers = useQuery({
    queryKey: ["price_monitor_offers"],
    queryFn: async () => {
      const { data } = await sb
        .from("products")
        .select(PRODUCT_COLS)
        .eq("active", true)
        .or("promo_price.not.is.null,lock_base_price.eq.true")
        .limit(1000);
      return (data || []) as any[];
    },
  });

  const rows = useMemo(() => {
    const hist = history.data || [];
    const prods = offers.data || [];
    const fromProduct = (p: any, label: string) => ({
      id: `${label}-${p.id}`,
      product: p,
      old_price: p.price,
      new_price: p.promo_price ?? p.price,
      change_type: label,
      source: null,
      changed_at: null,
    });

    if (tab === "all") return hist;
    if (tab === "decrease" || tab === "increase" || tab === "promotion_started" || tab === "promotion_ended") {
      return hist.filter((h) => h.change_type === tab);
    }
    if (tab === "active_offers") return prods.filter((p) => hasActiveOffer(p)).map((p) => fromProduct(p, "active_offer"));
    if (tab === "expired_offers")
      return prods
        .filter((p) => p.promotion_end && new Date(p.promotion_end).getTime() < Date.now())
        .map((p) => fromProduct(p, "expired_offer"));
    if (tab === "changed_in_offer")
      return hist.filter(
        (h) =>
          (h.change_type === "decrease" || h.change_type === "increase") &&
          h.products &&
          hasActiveOffer(h.products),
      );
    if (tab === "inconsistent_offer")
      return prods.filter(isInconsistent).map((p) => fromProduct(p, "inconsistent_offer"));
    if (tab === "locked_base_price")
      return prods.filter((p) => p.lock_base_price === true).map((p) => fromProduct(p, "locked_base_price"));
    if (tab === "out_of_stock_offer")
      return prods
        .filter((p) => hasActiveOffer(p) && Number(p.stock ?? 0) <= 0)
        .map((p) => fromProduct(p, "out_of_stock_offer"));
    return hist;
  }, [tab, history.data, offers.data]);

  const counts = useMemo(() => {
    const hist = history.data || [];
    const prods = offers.data || [];
    return {
      all: hist.length,
      decrease: hist.filter((h) => h.change_type === "decrease").length,
      increase: hist.filter((h) => h.change_type === "increase").length,
      promotion_started: hist.filter((h) => h.change_type === "promotion_started").length,
      promotion_ended: hist.filter((h) => h.change_type === "promotion_ended").length,
      active_offers: prods.filter((p) => hasActiveOffer(p)).length,
      expired_offers: prods.filter((p) => p.promotion_end && new Date(p.promotion_end).getTime() < Date.now()).length,
      out_of_stock_offer: prods.filter((p) => hasActiveOffer(p) && Number(p.stock ?? 0) <= 0).length,
      changed_in_offer: hist.filter(
        (h) => (h.change_type === "decrease" || h.change_type === "increase") && h.products && hasActiveOffer(h.products),
      ).length,
      inconsistent_offer: prods.filter(isInconsistent).length,
      locked_base_price: prods.filter((p) => p.lock_base_price === true).length,
    } as Record<TabKey, number>;
  }, [history.data, offers.data]);

  const editTab = (changeType: string) =>
    changeType === "promotion_started" || changeType === "promotion_ended" || changeType.includes("offer")
      ? "price"
      : "price";

  const loading = history.isLoading || offers.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Monitoramento de Preços e Ofertas</h1>
        <p className="text-sm text-muted-foreground">
          Histórico real de alterações de preço (Trier, manual, importação, campanha) e situação das ofertas.
          Redução de preço <strong>não</strong> significa oferta comercial. Promoções manuais são protegidas;
          o preço normal continua sincronizando, salvo travas explícitas.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">
              {t.label} <span className="ml-1 opacity-60">{counts[t.key] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center border rounded-lg">
          Nenhum registro nesta aba. O histórico é gravado a partir da próxima alteração real de preço.
        </p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left p-2">Produto</th>
                <th className="text-left p-2">Cód. Trier</th>
                <th className="text-right p-2">Anterior</th>
                <th className="text-right p-2">Atual</th>
                <th className="text-right p-2">Dif. R$</th>
                <th className="text-right p-2">Dif. %</th>
                <th className="text-left p-2">Data</th>
                <th className="text-left p-2">Origem</th>
                <th className="text-right p-2">Estoque</th>
                <th className="text-left p-2">Oferta</th>
                <th className="text-left p-2">Coleção</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => {
                const p = r.products || r.product;
                const oldP = Number(r.old_price ?? 0);
                const newP = Number(r.new_price ?? 0);
                const diff = newP - oldP;
                const pct = oldP > 0 ? (diff / oldP) * 100 : 0;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {p?.image_url && <img src={p.image_url} alt={p?.name || ""} className="h-8 w-8 rounded object-contain bg-white border" loading="lazy" />}
                        <span className="line-clamp-2 max-w-[240px]">{p?.name || "Produto removido"}</span>
                      </div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{p?.trier_product_id || "—"}</td>
                    <td className="p-2 text-right">{money(oldP)}</td>
                    <td className="p-2 text-right font-semibold">{money(newP)}</td>
                    <td className={`p-2 text-right ${diff < 0 ? "text-emerald-600" : diff > 0 ? "text-destructive" : ""}`}>{money(diff)}</td>
                    <td className={`p-2 text-right ${diff < 0 ? "text-emerald-600" : diff > 0 ? "text-destructive" : ""}`}>{pct.toFixed(1)}%</td>
                    <td className="p-2 text-xs">{r.changed_at ? new Date(r.changed_at).toLocaleString("pt-BR") : "—"}</td>
                    <td className="p-2 text-xs">{r.source ? SOURCE_LABEL[r.source] || r.source : "—"}</td>
                    <td className="p-2 text-right">{p?.stock ?? "—"}</td>
                    <td className="p-2 text-xs">
                      {p && isInconsistent(p) ? (
                        <Badge variant="destructive">Inconsistente</Badge>
                      ) : p && hasActiveOffer(p) ? (
                        <Badge variant="secondary">Ativa {discountPercentage(p).toFixed(0)}%</Badge>
                      ) : p?.promotion_end && new Date(p.promotion_end).getTime() < Date.now() ? (
                        <Badge variant="outline">Expirada</Badge>
                      ) : (
                        <span className="text-muted-foreground">Sem oferta</span>
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{(p?.shelves || []).join(", ") || "—"}</td>
                    <td className="p-2 text-right">
                      {p?.id && (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/admin/produtos?edit=${p.id}&tab=${editTab(r.change_type || "")}&from=monitor-precos`}>
                            Editar produto
                          </Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
