import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Stat = { label: string; value: number | string; warn?: boolean };

function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className={`rounded-lg border p-3 ${s.warn ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
          <div className="text-xs text-muted-foreground">{s.label}</div>
          <div className="text-2xl font-bold tabular-nums">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

async function countWith(filter: (q: any) => any): Promise<number> {
  let q = supabase.from("products").select("*", { count: "exact", head: true });
  q = filter(q);
  const { count, error } = await q;
  if (error) return -1;
  return count ?? 0;
}

export default function AdminHomeDiagnostics() {
  const totals = useQuery({
    queryKey: ["diag_totals"],
    queryFn: async () => ({
      total: await countWith((q) => q),
      active_true: await countWith((q) => q.eq("active", true)),
      active_false: await countWith((q) => q.eq("active", false)),
      stock_pos: await countWith((q) => q.gt("stock", 0)),
      stock_zero: await countWith((q) => q.lte("stock", 0)),
      stock_null: await countWith((q) => q.is("stock", null)),
      price_pos: await countWith((q) => q.gt("price", 0)),
      with_image: await countWith((q) => q.not("image_url", "is", null)),
      on_sale: await countWith((q) => q.eq("on_sale", true)),
      with_promo: await countWith((q) => q.not("promo_price", "is", null)),
      shelf_offers: await countWith((q) => q.contains("shelves", ["ofertas-da-semana"])),
      shelf_bestsellers: await countWith((q) => q.contains("shelves", ["mais-vendidos"])),
      home_eligible: await countWith((q) => q.eq("active", true).gt("stock", 0).gt("price", 0)),
      stock_pos_inactive: await countWith((q) => q.gt("stock", 0).eq("active", false)),
    }),
  });

  const shelvesDiag = useQuery({
    queryKey: ["diag_shelves"],
    queryFn: async () => {
      const base = (q: any) => q.eq("active", true).gt("stock", 0).gt("price", 0);
      const r = {
        offers_tagged: await countWith((q) => base(q).contains("shelves", ["ofertas-da-semana"])),
        offers_on_sale: await countWith((q) => base(q).eq("on_sale", true)),
        bestsellers_tagged: await countWith((q) => base(q).contains("shelves", ["mais-vendidos"])),
        bestsellers_featured: await countWith((q) => base(q).eq("featured", true)),
        meds_tagged: await countWith((q) => base(q).contains("shelves", ["medicamentos-populares"])),
        hygiene_tagged: await countWith((q) => base(q).contains("shelves", ["higiene-e-beleza"])),
        babies_tagged: await countWith((q) => base(q).contains("shelves", ["mamaes-e-bebes"])),
        vitamins_tagged: await countWith((q) => base(q).contains("shelves", ["vitaminas-e-suplementos"])),
        firstaid_tagged: await countWith((q) => base(q).contains("shelves", ["primeiros-socorros"])),
      };
      return r;
    },
  });

  const t = totals.data;
  const s = shelvesDiag.data;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-extrabold">Diagnóstico da Home</h1>
        <p className="text-sm text-muted-foreground">Inspeciona o que cada prateleira encontra. Se uma prateleira ficar vazia no público, o site usa fallback automático.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Inventário de produtos</CardTitle></CardHeader>
        <CardContent>
          {!t ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
            <StatGrid stats={[
              { label: "Total no banco", value: t.total },
              { label: "Active=true", value: t.active_true },
              { label: "Active=false", value: t.active_false, warn: t.active_false > t.active_true },
              { label: "Stock > 0", value: t.stock_pos },
              { label: "Stock <= 0", value: t.stock_zero },
              { label: "Stock null", value: t.stock_null, warn: t.stock_null > 0 },
              { label: "Price > 0", value: t.price_pos },
              { label: "Com imagem", value: t.with_image, warn: t.with_image < t.active_true / 2 },
              { label: "On sale", value: t.on_sale },
              { label: "Promo_price preenchido", value: t.with_promo },
              { label: "Shelves: ofertas-da-semana", value: t.shelf_offers },
              { label: "Shelves: mais-vendidos", value: t.shelf_bestsellers },
              { label: "Elegível para home (active+stock+price)", value: t.home_eligible, warn: t.home_eligible === 0 },
              { label: "Stock>0 mas inativos", value: t.stock_pos_inactive, warn: t.stock_pos_inactive > 50 },
            ]} />
          )}
          {t && t.stock_pos_inactive > 50 && (
            <div className="mt-3 p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-sm">
              <strong>Atenção:</strong> existem {t.stock_pos_inactive} produtos com estoque positivo marcados como inativos. Verifique a regra de ativação da sincronização.
            </div>
          )}
        </CardContent>
      </Card>

      <VariantsDiagnosticsCard />


      <Card>
        <CardHeader><CardTitle>{"Por prateleira (filtros públicos: active + stock>0 + price>0)"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!s ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
            <div className="space-y-3 text-sm">
              <ShelfRow name="Ofertas da Semana" rows={[
                ["shelves contém 'ofertas-da-semana'", s.offers_tagged],
                ["on_sale=true (fallback 1)", s.offers_on_sale],
              ]} note="Fallbacks aplicados em sequência: shelf tag → on_sale → promo_price<price → recém atualizados." />
              <ShelfRow name="Mais Vendidos" rows={[
                ["shelves contém 'mais-vendidos'", s.bestsellers_tagged],
                ["featured=true (fallback 1)", s.bestsellers_featured],
              ]} note="Fallbacks: shelf tag → featured → recém atualizados." />
              <ShelfRow name="Medicamentos Populares" rows={[["shelves contém 'medicamentos-populares'", s.meds_tagged]]} note="Fallback: categoria 'medicamentos'." />
              <ShelfRow name="Higiene e Beleza" rows={[["shelves contém 'higiene-e-beleza'", s.hygiene_tagged]]} note="Fallback: categoria 'higiene-pessoal'." />
              <ShelfRow name="Mamães e Bebês" rows={[["shelves contém 'mamaes-e-bebes'", s.babies_tagged]]} note="Fallback: categoria 'mamaes-e-bebes'." />
              <ShelfRow name="Vitaminas e Suplementos" rows={[["shelves contém 'vitaminas-e-suplementos'", s.vitamins_tagged]]} note="Fallback: categoria 'vitaminas'." />
              <ShelfRow name="Primeiros Socorros" rows={[["shelves contém 'primeiros-socorros'", s.firstaid_tagged]]} note="Fallback: categoria 'primeiros-socorros'." />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShelfRow({ name, rows, note }: { name: string; rows: [string, number][]; note?: string }) {
  const empty = rows.every(([, v]) => v === 0);
  return (
    <div className={`rounded-lg border p-3 ${empty ? "border-destructive/40 bg-destructive/5" : ""}`}>
      <div className="font-bold">{name} {empty && <span className="text-xs text-destructive ml-2">vazia — usará fallback</span>}</div>
      <ul className="mt-1 ml-4 list-disc text-muted-foreground">
        {rows.map(([k, v]) => (<li key={k}><span className="text-foreground font-mono">{v}</span> — {k}</li>))}
      </ul>
      {note && <div className="text-xs text-muted-foreground mt-1">{note}</div>}
    </div>
  );
}
