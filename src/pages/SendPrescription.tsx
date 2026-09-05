import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { updateCartPrescription } from "@/lib/store";
import { toast } from "sonner";
import { z } from "zod";
import { FileText, ShieldCheck } from "lucide-react";
import { Seo } from "@/components/Seo";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  notes: z.string().trim().max(500).optional(),
});

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function SendPrescription() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const productId = searchParams.get("product_id");
  const requestedReturn = searchParams.get("return_to") || "/carrinho";
  const returnTo = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/carrinho";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || user) return;
    const next = `/enviar-receita${window.location.search}`;
    nav(`/auth?next=${encodeURIComponent(next)}`, { replace: true });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    (supabase as any).from("profiles").select("full_name,phone").eq("id", user.id).maybeSingle().then(({ data }: any) => {
      if (!data) return;
      setName((current) => current || data.full_name || "");
      setPhone((current) => current || data.phone || "");
    });
  }, [user?.id]);

  const bindToProduct = async (createdAfter: string) => {
    if (!productId) return null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await (supabase as any).rpc("bind_latest_prescription_to_product", {
        _product_id: productId,
        _created_after: createdAfter,
      });
      if (!error && Array.isArray(data) && data[0]?.id) return data[0];
      lastError = error;
      await sleep(250 * (attempt + 1));
    }
    throw new Error(lastError?.message || "Não foi possível vincular a receita ao medicamento do carrinho.");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Entre na sua conta para enviar a receita.");
      return;
    }

    const parsed = schema.safeParse({ name, phone, notes });
    if (!parsed.success) { toast.error("Preencha os campos corretamente"); return; }
    if (!file) { toast.error("Selecione a foto ou PDF da receita."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo até 10 MB"); return; }

    setSubmitting(true);
    const createdAfter = new Date(Date.now() - 3000).toISOString();
    try {
      const fd = new FormData();
      fd.append("name", parsed.data.name);
      fd.append("phone", parsed.data.phone);
      if (parsed.data.notes) fd.append("notes", parsed.data.notes);
      if (productId) fd.append("product_ids", JSON.stringify([productId]));
      fd.append("file", file);

      const { data, error } = await supabase.functions.invoke("submit-prescription", { body: fd });
      if (error || (data && (data as any).error)) throw new Error((data as any)?.error || error?.message);

      if (productId) {
        const submitted = (data as any)?.prescription;
        const linked = submitted?.id && submitted?.product_id === productId
          ? submitted
          : await bindToProduct(createdAfter);

        updateCartPrescription(productId, {
          id: linked.id,
          status: linked.status || "recebida",
          approved_at: linked.approved_at || null,
        });
        toast.success("Receita recebida. O medicamento ficará no carrinho aguardando aprovação.");
        nav(returnTo, { replace: true });
        return;
      }

      toast.success("Receita recebida para análise!");
      setName(""); setPhone(""); setNotes(""); setFile(null);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar. Tente novamente.", { duration: 7000 });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Layout><div className="container py-16 text-center">Carregando...</div></Layout>;

  return (
    <Layout>
      <Seo title="Envie sua receita" description="Envie a foto da sua receita médica para análise farmacêutica." path="/enviar-receita" noindex={!!productId} />
      <div className="container py-10 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-accent text-accent-foreground rounded-full p-2"><FileText className="h-5 w-5" /></div>
          <h1 className="text-2xl md:text-3xl font-extrabold">{productId ? "Enviar receita para liberar o medicamento" : "Envie sua receita"}</h1>
        </div>
        <p className="text-muted-foreground mb-4 text-sm">
          {productId
            ? "Após o envio, o medicamento continuará no seu carrinho como “aguardando análise”. Os outros produtos permanecem liberados para compra."
            : <>Status inicial: <strong>Recebida para análise</strong>. A venda depende da conferência da farmácia.</>}
        </p>

        {productId && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 text-sm text-amber-950">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <div><strong>O envio da receita não conclui a venda.</strong> O item só será liberado no carrinho após aprovação da equipe farmacêutica.</div>
          </div>
        )}

        <form onSubmit={submit} className="bg-card border rounded-xl p-6 space-y-4 shadow-card">
          <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></div>
          <div className="space-y-2"><Label>Telefone / WhatsApp</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="(83) 99999-9999" required /></div>
          <div className="space-y-2"><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Informações adicionais para a equipe farmacêutica" /></div>
          <div className="space-y-2">
            <Label>Imagem ou PDF da receita *</Label>
            <Input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
            <p className="text-[11px] text-muted-foreground">Formatos aceitos: JPG, PNG ou PDF, até 10 MB.</p>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={submitting || !user}>{submitting ? "Enviando..." : "Enviar receita para análise"}</Button>
          <p className="text-xs text-muted-foreground">Para medicamentos sujeitos a receita, a compra só é liberada após análise e conferência pela farmácia.</p>
        </form>
      </div>
    </Layout>
  );
}