import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, MessageCircle, Eye, CheckCircle2 } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/store";

const STATUSES = ["recebida", "em_analise", "aprovada", "recusada", "finalizada"];
const LABEL: Record<string, string> = {
  recebida: "Recebida",
  em_analise: "Em análise",
  aprovada: "Aprovada",
  recusada: "Recusada",
  finalizada: "Finalizada",
};

export default function AdminPrescriptions() {
  const qc = useQueryClient();
  const [view, setView] = useState<any>(null);
  const [internalNote, setInternalNote] = useState("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin_presc"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("prescriptions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return rows || [];
    },
  });

  const reviewPrescription = async (id: string, status: string, note?: string | null) => {
    const { data: result, error } = await (supabase as any).rpc("seller_review_prescription", {
      _prescription_id: id,
      _status: status,
      _internal_notes: note ?? null,
    });
    if (error) throw error;
    return result;
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      setSaving(true);
      await reviewPrescription(id, status);
      toast.success(status === "aprovada" ? "Receita aprovada" : "Status atualizado");
      if (view?.id === id) setView((current: any) => current ? { ...current, status } : current);
      await qc.invalidateQueries({ queryKey: ["admin_presc"] });
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível atualizar a receita");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (p: any) => {
    setView(p);
    setInternalNote(p.internal_notes || "");
    setSignedUrl(null);
    if (p.file_url) {
      const { data: signed, error } = await supabase.storage
        .from("prescriptions")
        .createSignedUrl(p.file_url, 300);
      if (error) {
        toast.error("Não foi possível abrir o arquivo da receita");
      } else if (signed) {
        setSignedUrl(signed.signedUrl);
      }
    }
  };

  const saveNote = async () => {
    if (!view) return;
    try {
      setSaving(true);
      await reviewPrescription(view.id, view.status, internalNote);
      setView((current: any) => current ? { ...current, internal_notes: internalNote } : current);
      toast.success("Anotação salva");
      await qc.invalidateQueries({ queryKey: ["admin_presc"] });
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar a anotação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Receitas recebidas</h1>
          <p className="text-sm text-muted-foreground mt-1">Analise a receita e altere o status para liberar ou recusar a compra.</p>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Telefone</th>
              <th className="p-3">Observação</th>
              <th className="p-3">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((p: any) => (
              <tr key={p.id} className={`border-t align-top ${p.status === "recebida" ? "bg-amber-50/60" : ""}`}>
                <td className="p-3 text-xs">{new Date(p.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-medium">{p.customer_name}</td>
                <td className="p-3">{p.customer_phone}</td>
                <td className="p-3 text-xs max-w-[260px] truncate">{p.notes || "—"}</td>
                <td className="p-3">
                  <Select value={p.status} onValueChange={(value) => void updateStatus(p.id, value)} disabled={saving}>
                    <SelectTrigger className="h-8 w-[145px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => <SelectItem key={status} value={status}>{LABEL[status]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => void openDetail(p)}>
                    <Eye className="h-4 w-4 mr-1" /> Ver
                  </Button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhuma receita.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!view} onOpenChange={(next) => !next && setView(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Receita — {view?.customer_name}</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div><strong>Telefone:</strong> {view.customer_phone}</div>
                <div><strong>Status:</strong> {LABEL[view.status] || view.status}</div>
              </div>
              <div><strong>Observação do cliente:</strong> {view.notes || "—"}</div>

              {signedUrl && (
                <div className="border rounded p-2">
                  {/\.(jpg|jpeg|png|webp)$/i.test(view.file_url || "") ? (
                    <img src={signedUrl} alt="Receita" className="max-h-80 mx-auto" />
                  ) : (
                    <iframe src={signedUrl} className="w-full h-80" title="Receita" />
                  )}
                  <Button size="sm" variant="outline" className="mt-2" asChild>
                    <a href={signedUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" /> Abrir arquivo</a>
                  </Button>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  className="w-full"
                  disabled={saving || view.status === "aprovada"}
                  onClick={() => void updateStatus(view.id, "aprovada")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Aprovar receita
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={saving || view.status === "em_analise"}
                  onClick={() => void updateStatus(view.id, "em_analise")}
                >
                  Marcar em análise
                </Button>
              </div>

              <div className="space-y-1">
                <label className="font-medium">Anotação interna</label>
                <Textarea rows={3} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
                <Button size="sm" onClick={() => void saveNote()} disabled={saving}>Salvar anotação</Button>
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
