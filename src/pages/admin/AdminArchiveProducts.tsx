import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Archive, Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Preview = {
  total: number;
  never_sold: number;
  old_sale: number;
  cutoff: string;
  months_without_sale: number;
  sample: Array<{ id: string; name: string; last_sale_at: string | null }>;
};

export default function AdminArchiveProducts() {
  const [months, setMonths] = useState(6);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastApplied, setLastApplied] = useState<{ archived: number; cutoff: string } | null>(null);

  const runPreview = async () => {
    setLoadingPreview(true);
    setPreview(null);
    const { data, error } = await supabase.rpc("admin_archive_preview", {
      _months_without_sale: months,
    });
    setLoadingPreview(false);
    if (error) {
      toast({ title: "Erro no preview", description: error.message, variant: "destructive" });
      return;
    }
    setPreview(data as unknown as Preview);
  };

  const runApply = async () => {
    setApplying(true);
    const { data, error } = await supabase.rpc("admin_archive_apply", {
      _months_without_sale: months,
      _limit: null,
    });
    setApplying(false);
    if (error) {
      toast({ title: "Erro ao arquivar", description: error.message, variant: "destructive" });
      return;
    }
    const result = data as unknown as { archived: number; cutoff: string };
    setLastApplied(result);
    toast({
      title: "Arquivamento concluído",
      description: `${result.archived.toLocaleString("pt-BR")} produtos arquivados.`,
    });
    setPreview(null);
  };

  return (
    <div className="container py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Archive className="h-6 w-6" /> Arquivar produtos antigos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Remove do fluxo ativo os produtos <strong>inativos</strong> + <strong>sem estoque</strong> +{" "}
          <strong>sem venda</strong> no período escolhido. Eles ficam no banco (para preservar histórico
          de pedidos), mas o Trier para de sincronizar e não aparecem em nenhuma lista padrão.
        </p>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label htmlFor="months">Sem venda há quantos meses?</Label>
            <Input
              id="months"
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 6))}
              className="w-32 mt-1"
            />
          </div>
          <Button onClick={runPreview} disabled={loadingPreview} className="gap-2">
            {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Gerar relatório
          </Button>
        </div>
      </Card>

      {preview && (
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Total a arquivar" value={preview.total} tone="rose" big />
            <Stat label="Nunca vendidos" value={preview.never_sold} tone="slate" />
            <Stat label="Vendas antigas" value={preview.old_sale} tone="amber" />
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Corte: sem venda desde{" "}
            <strong>{new Date(preview.cutoff).toLocaleDateString("pt-BR")}</strong> ({preview.months_without_sale}{" "}
            meses).
          </p>

          {preview.total === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              Nenhum produto se encaixa nos critérios. Nada a arquivar.
            </div>
          ) : (
            <>
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Isso é <strong>reversível</strong>: você pode desarquivar produtos individualmente
                  depois. O histórico de pedidos que os referencia continua intacto.
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="gap-2" disabled={applying}>
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                    Arquivar {preview.total.toLocaleString("pt-BR")} produtos
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar arquivamento</AlertDialogTitle>
                    <AlertDialogDescription>
                      Você vai arquivar <strong>{preview.total.toLocaleString("pt-BR")}</strong> produtos.
                      Eles saem de todas as listas, buscas e sincronizações do Trier. É reversível
                      individualmente. Deseja continuar?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={runApply}>Sim, arquivar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {preview.sample?.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-sm mb-2">Amostra (primeiros 50):</h3>
              <div className="border rounded-lg max-h-80 overflow-y-auto text-sm">
                <div className="overflow-x-auto -mx-2 px-2"><table className="w-full">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left p-2">Produto</th>
                      <th className="text-left p-2 w-40">Última venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{p.name}</td>
                        <td className="p-2 text-muted-foreground">
                          {p.last_sale_at ? new Date(p.last_sale_at).toLocaleDateString("pt-BR") : "Nunca"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </div>
          )}
        </Card>
      )}

      {lastApplied && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <p className="text-sm text-emerald-900">
            ✅ Último arquivamento: <strong>{lastApplied.archived.toLocaleString("pt-BR")}</strong>{" "}
            produtos arquivados.
          </p>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: number;
  tone: "rose" | "slate" | "amber";
  big?: boolean;
}) {
  const toneCls =
    tone === "rose"
      ? "bg-rose-50 border-rose-200 text-rose-900"
      : tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-slate-50 border-slate-200 text-slate-900";
  return (
    <div className={`rounded-lg border p-4 ${toneCls}`}>
      <div className={`font-bold ${big ? "text-3xl" : "text-2xl"}`}>{value.toLocaleString("pt-BR")}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}
