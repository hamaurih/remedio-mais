import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { CheckCircle2, FileText, Loader2, ShoppingCart, Volume2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { attachPrescriptionToCart, isPrescriptionCartItem } from "@/lib/store";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  notes: z.string().trim().max(500).optional(),
});

function playReceiptSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    gain.connect(ctx.destination);
    [659.25, 783.99].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(ctx.currentTime + index * 0.18);
      oscillator.stop(ctx.currentTime + 0.35 + index * 0.18);
    });
    window.setTimeout(() => void ctx.close(), 1000);
  } catch {
    // Som é um reforço visual; falhas do navegador não interrompem o envio.
  }
}

export default function SendPrescription() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const cart = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const pendingProducts = useMemo(() => {
    const target = searchParams.get("product");
    const pending = cart.filter((item) =>
      isPrescriptionCartItem(item) && item.prescription_status !== "aprovada"
    );
    if (!target) return pending;
    return [...pending].sort((a, b) =>
      (a.product_id || a.id) === target ? -1 : (b.product_id || b.id) === target ? 1 : 0
    );
  }, [cart, searchParams]);

  const productIds = useMemo(
    () => Array.from(new Set(pendingProducts.map((item) => item.product_id || item.id))),
    [pendingProducts],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, phone, notes });
    if (!parsed.success) { toast.error("Preencha os campos corretamente"); return; }
    if (!file) { toast.error("Anexe a imagem ou o PDF da receita."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo até 10 MB"); return; }
    if (productIds.length > 0 && !user) {
      nav(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", parsed.data.name);
      fd.append("phone", parsed.data.phone);
      if (parsed.data.notes) fd.append("notes", parsed.data.notes);
      fd.append("file", file);
      fd.append("product_ids", JSON.stringify(productIds));

      const { data, error } = await supabase.functions.invoke("submit-prescription", { body: fd });
      if (error || (data && (data as any).error)) throw new Error((data as any)?.error || error?.message);

      const prescription = (data as any)?.prescription;
      if (prescription?.id && productIds.length) {
        attachPrescriptionToCart(productIds, prescription.id, prescription.status || "recebida");
      }

      playReceiptSound();
      setSuccessOpen(true);
      setName(""); setPhone(""); setNotes(""); setFile(null);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Layout><div className="container py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div></Layout>;
  }

  return (
    <Layout>
      <Seo title="Envie sua receita" description="Envie a foto da sua receita médica para análise farmacêutica." path="/enviar-receita" />
      <div className="container py-10 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-accent text-accent-foreground rounded-full p-2"><FileText className="h-5 w-5" /></div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Envie sua receita</h1>
        </div>
        <p className="text-muted-foreground mb-6 text-sm">
          Os medicamentos ficam guardados no carrinho enquanto a equipe farmacêutica analisa a receita.
        </p>

        {pendingProducts.length > 0 && (
          <div className="mb-5 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-center gap-2 font-extrabold">
              <ShoppingCart className="h-5 w-5" /> Produtos vinculados à receita
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {pendingProducts.map((item) => (
                <li key={item.id}>• {item.quantity}x {item.name}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              Uma única receita será vinculada a estes itens. Produtos sem exigência de receita continuam disponíveis para compra imediata.
            </p>
          </div>
        )}

        {pendingProducts.length > 0 && !user && (
          <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            Faça login antes de enviar para que a aprovação seja vinculada ao seu carrinho.
            <Button asChild variant="outline" size="sm" className="ml-3">
              <Link to={`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Entrar</Link>
            </Button>
          </div>
        )}

        <form onSubmit={submit} className="bg-card border rounded-xl p-6 space-y-4 shadow-card">
          <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></div>
          <div className="space-y-2"><Label>Telefone / WhatsApp</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="(83) 99999-9999" required /></div>
          <div className="space-y-2"><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ex.: posologia ou observação importante para o farmacêutico." /></div>
          <div className="space-y-2">
            <Label>Imagem ou PDF da receita</Label>
            <Input type="file" accept="image/*,application/pdf" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={submitting || (pendingProducts.length > 0 && !user)}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : "Enviar receita para análise"}
          </Button>
          <p className="text-xs text-muted-foreground">A venda do medicamento sujeito a receita só será liberada após análise farmacêutica.</p>
        </form>
      </div>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-md border-2 border-emerald-500 text-center">
          <DialogHeader className="items-center">
            <div className="relative mb-2">
              <span className="absolute inset-0 rounded-full bg-emerald-300 animate-ping opacity-60" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-12 w-12 text-emerald-700" />
              </span>
            </div>
            <DialogTitle className="text-2xl font-extrabold text-emerald-800">Receita recebida para análise!</DialogTitle>
            <DialogDescription className="text-base">
              <span className="inline-flex items-center gap-2 font-semibold text-foreground">
                <Volume2 className="h-4 w-4" /> Nossa equipe foi avisada.
              </span>
              <br />
              Os medicamentos permanecem no carrinho como <strong>aguardando aprovação</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 mt-3">
            <Button onClick={() => nav("/carrinho")}>Ver meu carrinho</Button>
            <Button variant="outline" onClick={() => nav("/")}>Continuar comprando</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
