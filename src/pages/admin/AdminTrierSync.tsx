import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function AdminTrierSync() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: logs } = useQuery({
    queryKey: ["trier_logs"],
    queryFn: async () =>
      (await supabase.from("trier_sync_logs").select("*").order("started_at", { ascending: false }).limit(30)).data || [],
    refetchInterval: syncing ? 2000 : false,
  });

  const runSync = async () => {
    setSyncing(true);
    toast.info("Iniciando sincronização com Trier...");
    try {
      const { data, error } = await supabase.functions.invoke("trier-sync", { body: { trigger: "manual" } });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Sincronizado: ${data.created} criados, ${data.updated} atualizados, ${data.skipped} ignorados`);
      } else {
        toast.error(data?.error || "Erro na sincronização");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
      qc.invalidateQueries({ queryKey: ["trier_logs"] });
      qc.invalidateQueries({ queryKey: ["admin_products"] });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold">Integração Trier</h1>
          <p className="text-sm text-muted-foreground">Sincroniza produtos do ERP Trier com a loja</p>
        </div>
        <Button onClick={runSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar agora"}
        </Button>
      </div>

      <div className="bg-card border rounded-xl p-4">
        <h2 className="font-bold mb-2">Como funciona</h2>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
          <li>Importa apenas produtos com <code>integracaoEcommerce=true</code> e <code>ativo=true</code></li>
          <li>Sincronização automática agendada via cron (configurável)</li>
          <li>Produtos existentes (mesmo <code>trier_product_id</code>) são atualizados; novos são criados</li>
          <li>Preço promocional é definido quando <code>valorVendaEcommerce</code> &lt; <code>valorVenda</code></li>
        </ul>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="p-3 border-b font-bold">Histórico de sincronizações</div>
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="p-3">Status</th><th className="p-3">Gatilho</th><th className="p-3">Início</th>
              <th className="p-3">Buscados</th><th className="p-3">Criados</th><th className="p-3">Atualizados</th>
              <th className="p-3">Ignorados</th><th className="p-3">Erro</th>
            </tr>
          </thead>
          <tbody>
            {(logs || []).map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="p-3">
                  {l.status === "success" && <span className="text-whatsapp flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> OK</span>}
                  {l.status === "error" && <span className="text-primary flex items-center gap-1"><XCircle className="h-4 w-4" /> Erro</span>}
                  {l.status === "running" && <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-4 w-4 animate-pulse" /> Rodando</span>}
                </td>
                <td className="p-3">{l.trigger}</td>
                <td className="p-3 text-xs">{new Date(l.started_at).toLocaleString("pt-BR")}</td>
                <td className="p-3">{l.items_fetched ?? 0}</td>
                <td className="p-3 text-whatsapp font-semibold">{l.items_created ?? 0}</td>
                <td className="p-3">{l.items_updated ?? 0}</td>
                <td className="p-3 text-muted-foreground">{l.items_skipped ?? 0}</td>
                <td className="p-3 text-xs text-primary max-w-[300px] truncate" title={l.error_message}>{l.error_message || "—"}</td>
              </tr>
            ))}
            {(logs || []).length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma sincronização ainda. Clique em "Sincronizar agora".</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
