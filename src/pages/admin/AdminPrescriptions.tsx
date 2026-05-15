import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download } from "lucide-react";

const STATUSES = ["recebida", "em_analise", "aprovada", "recusada", "finalizada"];

export default function AdminPrescriptions() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin_presc"],
    queryFn: async () => (await supabase.from("prescriptions").select("*").order("created_at", { ascending: false })).data || [],
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("prescriptions").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["admin_presc"] }); }
  };

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("prescriptions").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-extrabold mb-6">Receitas recebidas</h1>
      <div className="bg-card border rounded-xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr><th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Telefone</th><th className="p-3">Observações</th><th className="p-3">Status</th><th></th></tr></thead>
          <tbody>
            {data?.map((p: any) => (
              <tr key={p.id} className="border-t align-top">
                <td className="p-3 text-xs">{new Date(p.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-medium">{p.customer_name}</td>
                <td className="p-3">{p.customer_phone}</td>
                <td className="p-3 text-xs max-w-[260px]">{p.notes}</td>
                <td className="p-3">
                  <Select value={p.status} onValueChange={(v) => updateStatus(p.id, v)}>
                    <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-right">
                  {p.file_url && <Button size="sm" variant="outline" onClick={() => download(p.file_url)}><Download className="h-4 w-4 mr-1" /> Arquivo</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
