import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/store";
import { toast } from "sonner";
import { AlertTriangle, Edit, X, Plus } from "lucide-react";
import { EntityPicker } from "@/components/admin/EntityPicker";

export default function AdminOffers() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin_offers"],
    queryFn: async () => (await supabase.from("products")
      .select("*").or("on_sale.eq.true,promo_price.not.is.null,shelves.cs.{ofertas-da-semana}").order("updated_at", { ascending: false })).data || [],
  });

  const now = new Date();
  const filtered = useMemo(() => {
    return (data || []).filter((p: any) => {
      const start = p.promotion_start ? new Date(p.promotion_start) : null;
      const end = p.promotion_end ? new Date(p.promotion_end) : null;
      const expired = end && end < now;
      const future = start && start > now;
      if (filter === "active" && (expired || future)) return false;
      if (filter === "future" && !future) return false;
      if (filter === "expired" && !expired) return false;
      return true;
    });
  }, [data, filter]);

  const removeFromOffer = async (p: any) => {
    if (!confirm(`Remover "${p.name}" das ofertas?`)) return;
    const shelves = (p.shelves || []).filter((s: string) => s !== "ofertas-da-semana");
    await supabase.from("products").update({ on_sale: false, promo_price: null, promotion_start: null, promotion_end: null, shelves, lock_promotion: false, promotion_source: "none", lock_manual_price: false }).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["admin_offers"] });
    toast.success("Removido das ofertas");
  };

  const saveEdit = async () => {
    const shelves = [...new Set([...(editing.shelves || []), "ofertas-da-semana"])];
    const { error } = await supabase.from("products").update({
      promo_price: editing.promo_price ? Number(editing.promo_price) : null,
      promotion_start: editing.promotion_start || null,
      promotion_end: editing.promotion_end || null,
      product_badge: editing.product_badge || null,
      on_sale: true,
      shelves,
      // Protege APENAS a promoção. O preço normal continua sendo atualizado
      // pelo sistema da farmácia, salvo trava explícita do admin.
      lock_promotion: true,
      promotion_source: "manual",
      lock_base_price: !!editing.lock_base_price,
      lock_manual_price: false,
    }).eq("id", editing.id);
    if (error) toast.error(error.message);
    else { toast.success("Oferta salva — promoção protegida, preço normal continua sincronizando"); qc.invalidateQueries({ queryKey: ["admin_offers"] }); setEditing(null); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">Ofertas da Semana</h1>
          <p className="text-sm text-muted-foreground">Produtos exibidos na prateleira "Ofertas da Semana" da home.</p>
          <p className="text-xs text-primary mt-1">🔒 Ao salvar, apenas a PROMOÇÃO fica protegida contra a sincronização do Trier. O preço normal continua sendo atualizado automaticamente (salvo se você travar o preço normal na edição).</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Adicionar produto</Button>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="future">Futuras</SelectItem>
              <SelectItem value="expired">Expiradas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr>
            <th className="p-3">Produto</th><th className="p-3">Preço</th><th className="p-3">Promo</th>
            <th className="p-3">Validade</th><th className="p-3">Estoque</th><th className="p-3">Alertas</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((p: any) => {
              const alerts: string[] = [];
              if (!p.promo_price) alerts.push("Sem preço promocional");
              if (p.promotion_end && new Date(p.promotion_end) < now) alerts.push("Oferta expirada");
              if (p.stock <= 0) alerts.push("Sem estoque");
              if (p.promo_price != null && p.price != null && Number(p.promo_price) >= Number(p.price)) alerts.push("Promoção inconsistente (promo ≥ preço normal)");
              if (p.lock_base_price) alerts.push("Preço normal travado");
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-2 flex items-center gap-2">
                    {p.image_url && <img src={p.image_url} className="w-8 h-8 object-contain border rounded" />}
                    <span className="font-medium">{p.name}</span>
                  </td>
                  <td className="p-3 line-through text-muted-foreground">{formatBRL(p.price)}</td>
                  <td className="p-3 text-primary font-bold">{p.promo_price ? formatBRL(p.promo_price) : "—"}</td>
                  <td className="p-3 text-xs">{p.promotion_end ? new Date(p.promotion_end).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="p-3">{p.stock}</td>
                  <td className="p-3">
                    {alerts.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {alerts.map((a) => <span key={a} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded flex items-center gap-1 w-fit"><AlertTriangle className="h-3 w-3" />{a}</span>)}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...p })}><Edit className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => removeFromOffer(p)}><X className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma oferta neste filtro.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar oferta — {editing?.name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Preço promocional</Label><Input type="number" step="0.01" value={editing.promo_price ?? ""} onChange={(e) => setEditing({ ...editing, promo_price: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Início</Label><Input type="datetime-local" value={editing.promotion_start?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, promotion_start: e.target.value })} /></div>
                <div className="space-y-1"><Label>Fim</Label><Input type="datetime-local" value={editing.promotion_end?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, promotion_end: e.target.value })} /></div>
              </div>
              <label className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-secondary/40">
                <input type="checkbox" className="mt-0.5" checked={!!editing.lock_base_price} onChange={(e) => setEditing({ ...editing, lock_base_price: e.target.checked })} />
                <span>
                  <span className="font-medium">Travar também o preço normal</span>
                  <span className="block text-xs text-muted-foreground">Só marque se este preço base for definido manualmente. Desmarcado (recomendado), o sistema da farmácia continua atualizando o preço normal.</span>
                </span>
              </label>
              <div className="space-y-1"><Label>Selo</Label><Input value={editing.product_badge || ""} onChange={(e) => setEditing({ ...editing, product_badge: e.target.value })} placeholder="oferta, leve-mais..." /></div>
              <Button className="w-full" onClick={saveEdit}>Salvar oferta</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar produto às Ofertas da Semana</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Busque um produto. Ele será marcado em "Ofertas da Semana" e você poderá ajustar preço promocional e datas em seguida.</p>
          <EntityPicker
            kind="product"
            onPick={async (ent) => {
              if (!ent) return;
              const { data: p } = await supabase.from("products").select("*").eq("id", ent.id).maybeSingle();
              if (!p) { toast.error("Produto não encontrado"); return; }
              const shelves = [...new Set([...(p.shelves || []), "ofertas-da-semana"])];
              const on_sale = p.promo_price != null && Number(p.promo_price) < Number(p.price);
              await supabase.from("products").update({ shelves, on_sale: on_sale || p.on_sale, lock_promotion: true, promotion_source: "manual", lock_manual_price: false }).eq("id", p.id);
              qc.invalidateQueries({ queryKey: ["admin_offers"] });
              toast.success("Produto adicionado às ofertas");
              setAddOpen(false);
              setEditing({ ...p, shelves });
            }}
            placeholder="Buscar produto por nome, SKU..."
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
