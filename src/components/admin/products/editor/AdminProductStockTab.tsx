import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = {
  editing: any;
  setEditing: Dispatch<SetStateAction<any>>;
};

export function AdminProductStockTab({ editing, setEditing }: Props) {
  return (
    <div className="space-y-3 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Quantidade em estoque</Label><Input type="number" value={editing.stock} onChange={(e) => setEditing((prev: any) => ({ ...prev, stock: e.target.value }))} /></div>
        <div className="space-y-1"><Label>Estoque mínimo (alerta)</Label><Input type="number" value={editing.minimum_stock} onChange={(e) => setEditing((prev: any) => ({ ...prev, minimum_stock: e.target.value }))} /></div>
        <div className="flex items-center gap-2"><Switch checked={!!editing.active} onCheckedChange={(v) => setEditing((prev: any) => ({ ...prev, active: v }))} /><Label>Produto disponível (ativo)</Label></div>
      </div>

      {Number(editing.stock) <= Number(editing.minimum_stock || 0) && (
        <div className="bg-primary/10 text-primary text-sm p-2 rounded flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Estoque baixo!</div>
      )}

      <TrierStockSyncButton
        productId={editing.id}
        barcode={editing.barcode}
        onUpdated={(newStock) => setEditing((prev: any) => ({ ...prev, stock: newStock }))}
      />
    </div>
  );
}

function TrierStockSyncButton({ productId, barcode, onUpdated }: { productId: string; barcode: string; onUpdated: (newStock: number) => void }) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const run = async () => {
    if (!productId) {
      toast.error("Salve o produto antes de sincronizar.");
      return;
    }
    if (!barcode) {
      toast.error("Cadastre o código de barras antes de sincronizar com o Trier.");
      return;
    }

    setLoading(true);
    setInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke("trier", {
        body: { action: "sync-stock-single", product_id: productId },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.error || "Falha ao sincronizar estoque");
        setInfo(data?.error || "Falha");
        return;
      }
      onUpdated(Number(data.stock_after ?? 0));
      toast.success(`Estoque atualizado: ${data.stock_before ?? "?"} → ${data.stock_after ?? 0}`);
      setInfo(`Trier código ${data.trier_id || "?"} · estoque loja ${data.trier_stock_quantity ?? "—"} · site ${data.stock_after}`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao chamar Trier");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-secondary/40 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <div className="font-semibold">Atualizar estoque pelo Trier</div>
          <div className="text-xs text-muted-foreground">Consulta o Trier pelo código de barras ({barcode || "sem EAN"}) e grava o estoque agora, sem esperar a sincronização automática.</div>
        </div>
        <Button type="button" size="sm" onClick={run} disabled={loading || !productId || !barcode}>
          {loading ? "Consultando Trier..." : "Atualizar estoque do Trier agora"}
        </Button>
      </div>
      {info && <div className="text-xs text-muted-foreground">{info}</div>}
    </div>
  );
}
