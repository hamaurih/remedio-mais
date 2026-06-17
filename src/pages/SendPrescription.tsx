import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { FileText } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  notes: z.string().trim().max(500).optional(),
});

export default function SendPrescription() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, phone, notes });
    if (!parsed.success) { toast.error("Preencha os campos corretamente"); return; }
    if (file && file.size > 10 * 1024 * 1024) { toast.error("Arquivo até 10 MB"); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", parsed.data.name);
      fd.append("phone", parsed.data.phone);
      if (parsed.data.notes) fd.append("notes", parsed.data.notes);
      if (file) fd.append("file", file);

      const { data, error } = await supabase.functions.invoke("submit-prescription", { body: fd });
      if (error || (data && (data as any).error)) throw new Error((data as any)?.error || error?.message);

      toast.success("Receita recebida para análise!");
      setName(""); setPhone(""); setNotes(""); setFile(null);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Layout>
      <div className="container py-10 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-accent text-accent-foreground rounded-full p-2"><FileText className="h-5 w-5" /></div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Envie sua receita</h1>
        </div>
        <p className="text-muted-foreground mb-6 text-sm">Status inicial: <strong>Recebida para análise</strong>. A venda depende da conferência da farmácia.</p>

        <form onSubmit={submit} className="bg-card border rounded-xl p-6 space-y-4 shadow-card">
          <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></div>
          <div className="space-y-2"><Label>Telefone / WhatsApp</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="(83) 99999-9999" required /></div>
          <div className="space-y-2"><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ex: medicamentos desejados, urgência, etc." /></div>
          <div className="space-y-2">
            <Label>Imagem ou PDF da receita</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>{submitting ? "Enviando..." : "Enviar receita"}</Button>
          <p className="text-xs text-muted-foreground">Para medicamentos controlados, a venda só é liberada após análise e conferência da receita pelo farmacêutico.</p>
        </form>
      </div>
    </Layout>
  );
}
