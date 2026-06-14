import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
      no_barcode: await countWith((q) => q.or("barcode.is.null,barcode.eq.")),
      no_barcode_stock_pos: await countWith((q) => q.or("barcode.is.null,barcode.eq.").gt("stock", 0)),
      no_barcode_stock_zero: await countWith((q) => q.or("barcode.is.null,barcode.eq.").lte("stock", 0)),
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
              { label: "Sem código de barras", value: t.no_barcode, warn: t.no_barcode > 500 },
              { label: "Sem EAN + stock>0", value: t.no_barcode_stock_pos, warn: t.no_barcode_stock_pos > 100 },
              { label: "Sem EAN + stock<=0", value: t.no_barcode_stock_zero },
            ]} />
          )}
          {t && t.stock_pos_inactive > 50 && (
            <div className="mt-3 p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-sm">
              <strong>Atenção:</strong> existem {t.stock_pos_inactive} produtos com estoque positivo marcados como inativos. Verifique a regra de ativação da sincronização.
            </div>
          )}
          {t && t.no_barcode_stock_pos > 0 && (
            <div className="mt-3 p-3 rounded-lg border border-amber-500/40 bg-amber-50/50 text-sm">
              <strong>Prioridade:</strong> {t.no_barcode_stock_pos} produtos sem EAN têm estoque positivo e estão vendendo. Se não tiverem EAN cadastrado na Trier, o checkout pode ter problemas com leitura de código de barras.
            </div>
          )}
        </CardContent>
      </Card>

      <NoBarcodeCard totals={totals.data} />


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

function NoBarcodeCard({ totals }: { totals: any }) {
  const t = totals;
  if (!t) return null;
  const pct = t.total ? Math.round((t.no_barcode / t.total) * 100) : 0;
  return (
    <Card>
      <CardHeader><CardTitle>Sem código de barras (EAN)</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Total sem EAN</div>
            <div className="text-2xl font-bold tabular-nums">{t.no_barcode}</div>
            <div className="text-xs text-muted-foreground mt-1">{pct}% do catálogo</div>
          </div>
          <div className="rounded-lg border border-amber-500/40 bg-amber-50/50 p-3">
            <div className="text-xs text-muted-foreground">Sem EAN + stock &gt; 0</div>
            <div className="text-2xl font-bold tabular-nums text-amber-700">{t.no_barcode_stock_pos}</div>
            <div className="text-xs text-muted-foreground mt-1">prioridade para correção</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Sem EAN + stock ≤ 0</div>
            <div className="text-2xl font-bold tabular-nums">{t.no_barcode_stock_zero}</div>
            <div className="text-xs text-muted-foreground mt-1">sem estoque, menos urgente</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Com EAN</div>
            <div className="text-2xl font-bold tabular-nums">{t.total - t.no_barcode}</div>
            <div className="text-xs text-muted-foreground mt-1">{100 - pct}% do catálogo</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <ExportNoBarcodeButton onlyStockPositive priority />
          <ExportNoBarcodeButton />
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const { data, error } = await supabase.functions.invoke("trier", { body: { action: "sync-barcodes", trigger: "manual" } });
              if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
              else toast({ title: "Sincronização de EAN iniciada", description: "Vai puxar da Trier apenas os códigos de barras. Verifique em Integrações › Trier." });
            }}
          >
            Resincronizar EANs da Trier
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          <strong>Como resolver:</strong> exporte a lista (CSV) → cadastre o <code>codigoBarras</code> no produto dentro da Trier → clique em <em>Resincronizar EANs da Trier</em>. Enquanto a Trier não tiver o EAN cadastrado, nenhuma sincronização vai conseguir preencher o campo no site (a origem manda vazio).
        </div>
      </CardContent>
    </Card>
  );
}

function ExportNoBarcodeButton({ onlyStockPositive = false, priority = false }: { onlyStockPositive?: boolean; priority?: boolean }) {
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        let q = supabase
          .from("products")
          .select("trier_product_id,sku,name,stock,price,category_id,active")
          .or("barcode.is.null,barcode.eq.")
          .order("stock", { ascending: false })
          .range(from, from + pageSize - 1);
        if (onlyStockPositive) q = q.gt("stock", 0);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const header = ["trier_product_id", "sku", "name", "stock", "price", "active"];
      const csv = [
        header.join(","),
        ...all.map((r) =>
          [r.trier_product_id ?? "", r.sku ?? "", `"${String(r.name ?? "").replace(/"/g, '""')}"`, r.stock ?? 0, r.price ?? 0, r.active ? "1" : "0"].join(","),
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = onlyStockPositive ? "produtos-sem-ean-com-estoque.csv" : "produtos-sem-ean-todos.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exportados ${all.length} produtos`, description: a.download });
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button size="sm" variant={priority ? "default" : "outline"} onClick={handle} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
      {onlyStockPositive ? "Exportar prioritários (stock > 0)" : "Exportar todos sem EAN"}
    </Button>
  );
}

function VariantsDiagnosticsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["diag_variants"],
    queryFn: async () => {
      const { data: parents } = await supabase
        .from("products")
        .select("id,name,has_variants,active,variation_type")
        .eq("has_variants", true);
      const ids = (parents || []).map((p: any) => p.id);
      if (!ids.length) return { parents: [], variants: [] as any[] };
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id,parent_product_id,variation_value,price,promo_price,barcode,trier_product_id,stock,active");
      return { parents: parents || [], variants: variants || [] };
    },
  });

  const rows = (data?.parents || []).map((p: any) => {
    const vs = (data!.variants || []).filter((v: any) => v.parent_product_id === p.id);
    const active = vs.filter((v: any) => v.active);
    const issues: string[] = [];
    if (!p.active) issues.push("pai inativo");
    if (active.length === 0) issues.push("sem variações ativas");
    if (active.length === 1) issues.push("apenas 1 variação");
    const noPrice = active.filter((v: any) => !v.price || Number(v.price) <= 0).length;
    const noBarcode = active.filter((v: any) => !v.barcode).length;
    const noTrier = active.filter((v: any) => !v.trier_product_id).length;
    const noStock = active.filter((v: any) => (v.stock ?? 0) <= 0).length;
    if (noPrice) issues.push(`${noPrice} sem preço`);
    if (noBarcode) issues.push(`${noBarcode} sem EAN`);
    if (noTrier) issues.push(`${noTrier} sem cód. Trier`);
    if (noStock === active.length && active.length) issues.push("todas sem estoque");
    return { p, count: active.length, total: vs.length, issues };
  });

  const incomplete = rows.filter((r) => r.issues.length > 0);

  return (
    <Card>
      <CardHeader><CardTitle>Variações de produtos</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
          <>
            <div className="text-sm text-muted-foreground mb-3">
              {rows.length} produto(s) pai com variações. {incomplete.length} com pendências.
            </div>
            {incomplete.length === 0 ? (
              <div className="text-sm text-emerald-600 font-semibold">Tudo certo — todas as variações estão completas.</div>
            ) : (
              <div className="space-y-2">
                {incomplete.map((r) => (
                  <div key={r.p.id} className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <div className="font-semibold">{r.p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.count} ativa(s) de {r.total} · tipo: {r.p.variation_type || "—"}
                    </div>
                    <ul className="mt-1 ml-4 list-disc text-destructive">
                      {r.issues.map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

