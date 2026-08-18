import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, MessageCircle, Eye } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/store";

const STATUSES = ["recebida", "em_analise", "aprovada", "recusada", "finalizada"];
const LABEL: Record<string, string> = { recebida: "Recebida", em_analise: "Em análise", aprovada: "Aprovada", recusada: "Recusada", finalizada: "Finalizada" };

export default function AdminPrescriptions() {
  const qc = useQueryClient();
  const [view, setView] = useState<any>(null);
  const [internalNote, setInternalNote] = useState("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["admin_presc"],
    queryFn: async () => (await supabase.from("prescriptions").select("*").order("created_at", { ascending: false })).data || [],
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin_prescriptions_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "prescriptions" }, () => {
        qc.invalidateQueries({ queryKey: ["admin_presc"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "prescriptions" }, () => {
        qc.invalidateQueries({ queryKey: ["admin_presc"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("prescriptions").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["admin_presc"] }); }
  };

  const openDetail = async (p: any) => {
    setView(p); setInternalNote(p.internal_notes || ""); setSignedUrl(null);
    if (p.file_url) {
      const { data: s } = await supabase.storage.from("prescriptions").createSignedUrl(p.file_url, 300);
      if (s) setSignedUrl(s.signedUrl);
    }
  };

  const saveNote = async () => {
    const { error } = await supabase.from("prescriptions").update({ internal_notes: internalNote }).eq("id", view.id);
    if (error) toast.error(error.message); else { toast.success("Anotação salva"); qc.invalidateQueries({ queryKey: ["admin_presc"] }); }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-extrabold mb-6">Receitas recebidas</h1>
      <div className="bg-card border rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr>
            <th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Telefone</th>
            <th className="p-3">Observação</th><th className="p-3">Status</th><th></th>
          </tr></thead>
          <tbody>
            {data?.map((p: any) => (
              <tr key={p.id} className="border-t align-top">
                <td className="p-3 text-xs">{new Date(p.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-medium">{p.customer_name}</td>
                <td className="p-3">{p.customer_phone}</td>
                <td className="p-3 text-xs max-w-[260px] truncate">{p.notes}</td>
                <td className="p-3">
                  <Select value={p.status} onValueChange={(v) => updateStatus(p.id, v)}>
                    <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{LABEL[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => openDetail(p)}><Eye className="h-4 w-4 mr-1" />Ver</Button></td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhuma receita.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Receita — {view?.customer_name}</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-3 text-sm">
              <div><strong>Telefone:</strong> {view.customer_phone}</div>
              <div><strong>Observação do cliente:</strong> {view.notes || "—"}</div>
              {signedUrl && (
                <div className="border rounded p-2">
                  {/\.(jpg|jpeg|png|webp)$/i.test(view.file_url) ? (
                    <img src={signedUrl} alt="Receita" className="max-h-80 mx-auto" />
                  ) : (
                    <iframe src={signedUrl} className="w-full h-80" />
                  )}
                  <Button size="sm" variant="outline" className="mt-2" asChild>
                    <a href={signedUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" /> Baixar arquivo</a>
                  </Button>
                </div>
              )}
              <div className="space-y-1">
                <label className="font-medium">Anotação interna</label>
                <Textarea rows={3} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
                <Button size="sm" onClick={saveNote}>Salvar anotação</Button>
              </div>
              <Button className="w-full bg-whatsapp hover:bg-whatsapp/90 text-white" asChild>
                <a href={buildWhatsAppLink(view.customer_phone, `Olá ${view.customer_name}, sobre sua receita enviada à Atacadão dos Medicamentos...`)} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4 mr-2" /> Falar no WhatsApp
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
