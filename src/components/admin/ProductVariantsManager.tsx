import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, ArrowUp, ArrowDown, Upload, CheckCircle2, AlertTriangle, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { EntityPicker, type PickedEntity } from "./EntityPicker";

type Variant = {
  id?: string;
  parent_product_id: string;
  trier_product_id?: string | null;
  barcode?: string | null;
  variation_type: string;
  variation_value: string;
  name?: string | null;
  price: number | null;
  promo_price: number | null;
  stock: number;
  image_url?: string | null;
  active: boolean;
  position: number;
  _file?: File | null;
};

const TYPES = ["tamanho", "volume", "sabor", "quantidade", "apresentação", "cor"];

export function ProductVariantsManager({ productId, onChangeSummary }: { productId: string; onChangeSummary?: (info: { count: number; hasAnyStock: boolean }) => void }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [parent, setParent] = useState<{ name?: string; has_variants?: boolean; active?: boolean } | null>(null);
  const [deactivateOriginal, setDeactivateOriginal] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: p }] = await Promise.all([
      supabase.from("product_variants").select("*").eq("parent_product_id", productId).order("position", { ascending: true }),
      supabase.from("products").select("name,has_variants,active").eq("id", productId).maybeSingle(),
    ]);
    setRows((data || []) as Variant[]);
    setParent((p as any) || null);
    setLoading(false);
    onChangeSummary?.({
      count: (data || []).length,
      hasAnyStock: (data || []).some((v: any) => (v.stock ?? 0) > 0 && v.active),
    });
  };

  useEffect(() => { if (productId) load(); /* eslint-disable-next-line */ }, [productId]);

  const importFromProduct = async (picked: PickedEntity | null) => {
    if (!picked) return;
    if (picked.id === productId) { toast.error("Este é o produto pai. Escolha outro produto."); return; }
    const { data: full } = await supabase
      .from("products")
      .select("name,price,promo_price,stock,trier_product_id,barcode,image_url")
      .eq("id", picked.id)
      .maybeSingle();
    const f: any = full || picked.raw || {};
    if (rows.some((r: any) => r._source_product_id === picked.id || (f.trier_product_id && r.trier_product_id === f.trier_product_id))) {
      toast.error("Este produto já foi importado como variação.");
      return;
    }
    const valueGuess = (f.name || "").split(/\s+/).slice(-1)[0] || "Novo";
    setRows((rs) => [
      ...rs,
      {
        parent_product_id: productId,
        trier_product_id: f.trier_product_id || null,
        barcode: f.barcode || null,
        variation_type: rs[0]?.variation_type || "tamanho",
        variation_value: valueGuess,
        name: f.name || null,
        price: f.price ?? null,
        promo_price: f.promo_price ?? null,
        stock: f.stock ?? 0,
        image_url: f.image_url || null,
        active: true,
        position: rs.length,
        _source_product_id: picked.id,
      } as any,
    ]);
    toast.success(`"${f.name}" adicionado como variação. Ajuste o valor (P, M, G...) e salve.`);
  };

  const add = () => {
    setRows((rs) => [
      ...rs,
      {
        parent_product_id: productId,
        variation_type: rs[0]?.variation_type || "tamanho",
        variation_value: "",
        price: null,
        promo_price: null,
        stock: 0,
        active: true,
        position: rs.length,
      },
    ]);
  };

  const update = (idx: number, patch: Partial<Variant>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const move = (idx: number, dir: -1 | 1) => {
    setRows((rs) => {
      const next = [...rs];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return rs;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((r, i) => ({ ...r, position: i }));
    });
  };

  const remove = async (idx: number) => {
    const row = rows[idx];
    if (row.id) {
      if (!confirm("Excluir variação definitivamente?")) return;
      const { error } = await supabase.from("product_variants").delete().eq("id", row.id);
      if (error) { toast.error(error.message); return; }
    }
    setRows((rs) => rs.filter((_, i) => i !== idx));
  };

  const uploadImage = async (file: File) => {
    const path = `variants/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error } = await supabase.storage.from("products").upload(path, file);
    if (error) throw error;
    return supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
  };

  const saveAll = async () => {
    setLoading(true);
    try {
      for (const r of rows) {
        if (!r.variation_value.trim()) continue;
        let image_url = r.image_url || null;
        if (r._file) image_url = await uploadImage(r._file);
        const payload: any = {
          parent_product_id: productId,
          trier_product_id: r.trier_product_id || null,
          barcode: r.barcode || null,
          variation_type: r.variation_type || "tamanho",
          variation_value: r.variation_value.trim(),
          name: r.name || null,
          price: r.price === null || r.price === undefined || (r.price as any) === "" ? null : Number(r.price),
          promo_price: r.promo_price === null || r.promo_price === undefined || (r.promo_price as any) === "" ? null : Number(r.promo_price),
          stock: Number(r.stock || 0),
          image_url,
          active: !!r.active,
          position: r.position,
        };
        if (r.id) {
          await supabase.from("product_variants").update(payload).eq("id", r.id);
        } else {
          await supabase.from("product_variants").insert(payload);
        }
      }
      // Deactivate source products that were imported (so they don't show as duplicates on the site)
      if (deactivateOriginal) {
        const sourceIds = (rows as any[]).map((r) => r._source_product_id).filter(Boolean);
        if (sourceIds.length) {
          await supabase.from("products").update({ active: false }).in("id", sourceIds);
        }
      }
      // Mark parent as has_variants when there is at least one active variant
      const hasAny = rows.some((r) => r.variation_value.trim() && r.active);
      await supabase.from("products").update({
        has_variants: hasAny,
        variation_type: hasAny ? rows[0]?.variation_type || "tamanho" : null,
      }).eq("id", productId);

      toast.success("Variações salvas");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar variações");
    } finally {
      setLoading(false);
    }
  };

  if (!productId) {
    return <div className="text-sm text-muted-foreground p-4">Salve o produto primeiro para gerenciar variações.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold">Variações do produto</div>
          <div className="text-xs text-muted-foreground">Use variações quando o produto tem vários tamanhos, volumes, sabores etc. Cada variação tem estoque, preço e código próprios.</div>
        </div>
        <Button type="button" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Nova variação</Button>
      </div>

      {/* Status / conexão com o site */}
      {(() => {
        const activeCount = rows.filter((r) => r.active && (r.variation_value || "").trim()).length;
        const connected = !!parent?.has_variants && activeCount > 0 && !!parent?.active;
        return (
          <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${connected ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
            {connected ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" /> : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />}
            <div className="flex-1">
              {connected ? (
                <div><strong>Conectado ao site.</strong> O produto aparece com seletor de {rows[0]?.variation_type || "variação"} ({activeCount} {activeCount === 1 ? "opção ativa" : "opções ativas"}).</div>
              ) : (
                <div>
                  <strong>Ainda não está aparecendo no site.</strong>{" "}
                  {!parent?.active && "O produto pai está inativo. "}
                  {activeCount === 0 && "Adicione e ative ao menos uma variação. "}
                  Depois clique em <em>Salvar variações</em>.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Importar produto existente como variação */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Importar produto existente como variação</div>
        </div>
        <div className="text-xs text-muted-foreground">
          Busque um produto pelo nome (ex.: "Fralda Pampers G"). Os dados (preço, estoque, código Trier, EAN, imagem) são copiados para uma nova variação. Por padrão o produto original fica inativo para não duplicar no site.
        </div>
        <EntityPicker kind="product" onPick={importFromProduct} placeholder="Buscar produto por nome, SKU ou EAN..." />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={deactivateOriginal} onChange={(e) => setDeactivateOriginal(e.target.checked)} />
          Desativar o produto original ao salvar (recomendado)
        </label>
      </div>

      {rows.length === 0 && (
        <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
          Sem variações cadastradas. Use a busca acima ou clique em <strong>Nova variação</strong>.
        </div>
      )}


      <div className="space-y-3">
        {rows.map((r, idx) => (
          <div key={r.id || `new-${idx}`} className="border rounded-lg p-3 grid grid-cols-12 gap-2 items-start bg-card">
            <div className="col-span-12 md:col-span-2 space-y-1">
              <Label className="text-[11px]">Tipo</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={r.variation_type}
                onChange={(e) => update(idx, { variation_type: e.target.value })}
              >
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-6 md:col-span-2 space-y-1">
              <Label className="text-[11px]">Valor *</Label>
              <Input value={r.variation_value} onChange={(e) => update(idx, { variation_value: e.target.value })} placeholder="P, M, G, 200ml..." />
            </div>
            <div className="col-span-6 md:col-span-2 space-y-1">
              <Label className="text-[11px]">Preço (R$)</Label>
              <Input type="number" step="0.01" value={r.price ?? ""} onChange={(e) => update(idx, { price: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="col-span-6 md:col-span-2 space-y-1">
              <Label className="text-[11px]">Promo (R$)</Label>
              <Input type="number" step="0.01" value={r.promo_price ?? ""} onChange={(e) => update(idx, { promo_price: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="col-span-6 md:col-span-1 space-y-1">
              <Label className="text-[11px]">Estoque</Label>
              <Input type="number" value={r.stock} onChange={(e) => update(idx, { stock: Number(e.target.value || 0) })} />
            </div>
            <div className="col-span-12 md:col-span-3 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Cód. Trier</Label>
                <Input value={r.trier_product_id || ""} onChange={(e) => update(idx, { trier_product_id: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">EAN</Label>
                <Input value={r.barcode || ""} onChange={(e) => update(idx, { barcode: e.target.value })} />
              </div>
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1">
              <Label className="text-[11px]">Imagem (opcional)</Label>
              <div className="flex items-center gap-2">
                {r.image_url && <img src={r.image_url} alt="" className="h-10 w-10 object-contain border rounded" />}
                <label className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer">
                  <Upload className="h-3 w-3" />
                  <span>Enviar</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => update(idx, { _file: e.target.files?.[0] || null })} />
                </label>
                {r._file && <span className="text-[10px] text-muted-foreground">{r._file.name}</span>}
              </div>
            </div>

            <div className="col-span-8 md:col-span-6 flex items-center gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Switch checked={r.active} onCheckedChange={(v) => update(idx, { active: v })} />
                <span className="text-xs">Ativa</span>
              </div>
              <span className="text-[11px] text-muted-foreground">Posição: {idx + 1}</span>
            </div>

            <div className="col-span-4 md:col-span-3 flex justify-end gap-1 pt-1">
              <Button type="button" size="icon" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === rows.length - 1}><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => remove(idx)}><Trash2 className="h-4 w-4 text-primary" /></Button>
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="flex justify-end pt-2 border-t">
          <Button type="button" onClick={saveAll} disabled={loading}>{loading ? "Salvando..." : "Salvar variações"}</Button>
        </div>
      )}
    </div>
  );
}
