import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { clearCart, formatBRL } from "@/lib/store";
import { Copy, Check, Loader2, QrCode, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type PixData = {
  qr_code: string;
  qr_code_base64: string;
  ticket_url?: string;
  expires_at: string;
  total: number;
};

export default function PixPayment() {
  const { orderId } = useParams<{ orderId: string }>();
  const nav = useNavigate();
  const [pix, setPix] = useState<PixData | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef<number | null>(null);

  // Carrega dados do Pix: sessionStorage (rápido) com fallback no banco,
  // para o QR não sumir em recarregamento/retorno do app do banco.
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    const raw = sessionStorage.getItem(`pix:${orderId}`);
    if (raw) {
      try {
        setPix(JSON.parse(raw) as PixData);
        return;
      } catch { /* cai no fallback */ }
    }
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("pix_qr_code, pix_qr_code_base64, pix_expires_at, total")
        .eq("id", orderId)
        .maybeSingle();
      if (!active) return;
      if (data?.pix_qr_code && data?.pix_qr_code_base64) {
        const parsed: PixData = {
          qr_code: data.pix_qr_code as string,
          qr_code_base64: data.pix_qr_code_base64 as string,
          expires_at: (data.pix_expires_at as string) || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          total: Number(data.total ?? 0),
        };
        sessionStorage.setItem(`pix:${orderId}`, JSON.stringify(parsed));
        setPix(parsed);
      } else {
        toast.error("Não encontramos o Pix deste pedido. Veja em Meus pedidos ou refaça a compra.");
        nav("/minha-conta", { replace: true });
      }
    })();
    return () => { active = false; };
  }, [orderId, nav]);

  // Polling do status do pedido (consulta DB + força sync com Mercado Pago)
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let tick = 0;
    const check = async () => {
      tick++;
      // A cada 2 ciclos (~8s) força uma checagem ativa no Mercado Pago,
      // assim não dependemos só do webhook para atualizar o pedido.
      if (tick % 2 === 0) {
        try { await supabase.functions.invoke("check-cielo-status", { body: { order_id: orderId } }); } catch { /* ignore */ }
      }
      const { data } = await supabase
        .from("orders")
        .select("payment_status, status")
        .eq("id", orderId)
        .maybeSingle();
      if (!active || !data) return;
      setStatus(data.payment_status || "pending");
      if (data.payment_status === "approved") {
        sessionStorage.removeItem(`pix:${orderId}`);
        clearCart();
        setTimeout(() => nav(`/pedido/sucesso?order=${orderId}`, { replace: true }), 1500);
      }
    };
    check();
    pollRef.current = window.setInterval(check, 4000);
    return () => {
      active = false;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [orderId, nav]);

  // Contador
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (!pix) return null;
    const ms = new Date(pix.expires_at).getTime() - now;
    if (ms <= 0) return "Expirado";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [pix, now]);

  const expired = remaining === "Expirado";

  const copyCode = async () => {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.qr_code);
      setCopied(true);
      toast.success("Código Pix copiado!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o código manualmente.");
    }
  };

  if (!pix) {
    return <Layout><div className="container py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div></Layout>;
  }

  if (status === "approved") {
    return (
      <Layout>
        <div className="container py-16 max-w-md text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">Pagamento aprovado!</h1>
          <p className="text-muted-foreground mb-4">Seu pedido já está sendo preparado pela nossa equipe. 🎉</p>
          <p className="text-xs text-muted-foreground">Redirecionando para o acompanhamento do pedido…</p>
        </div>
      </Layout>
    );
  }

  if (status === "rejected" || status === "cancelled") {
    return (
      <Layout>
        <div className="container py-16 max-w-md text-center">
          <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">Pagamento não concluído</h1>
          <p className="text-muted-foreground mb-6">O Pix foi cancelado ou recusado. Você pode tentar novamente.</p>
          <Button onClick={() => nav("/carrinho")}>Voltar ao carrinho</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-8 max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-2 flex items-center gap-2">
          <QrCode className="h-7 w-7 text-primary" /> Pague com Pix
        </h1>
        <p className="text-muted-foreground mb-6">
          Abra o app do seu banco, escolha pagar com Pix e escaneie o QR Code ou cole o código abaixo.
        </p>

        <div className="bg-card border rounded-xl p-6 shadow-card">
          <div className={`flex items-center gap-2 text-sm mb-4 ${expired ? "text-destructive" : "text-muted-foreground"}`}>
            <Clock className="h-4 w-4" />
            <span>
              {expired
                ? "Tempo esgotado — gere um novo pedido."
                : <>Expira em <strong className="text-foreground">{remaining}</strong></>}
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div className="bg-white p-4 rounded-lg border flex items-center justify-center">
              <img
                src={`data:image/png;base64,${pix.qr_code_base64}`}
                alt="QR Code Pix"
                className="w-full max-w-[260px] aspect-square"
              />
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Valor</div>
              <div className="text-3xl font-extrabold text-primary mb-4">{formatBRL(pix.total)}</div>

              <div className="text-sm font-bold mb-2">Pix Copia e Cola</div>
              <div className="relative">
                <textarea
                  readOnly
                  value={pix.qr_code}
                  className="w-full text-xs bg-secondary/40 border rounded-lg p-3 h-24 font-mono resize-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <Button
                onClick={copyCode}
                className="w-full mt-3 bg-primary hover:bg-primary-dark"
                disabled={expired}
              >
                {copied
                  ? <><Check className="h-4 w-4 mr-2" /> Copiado!</>
                  : <><Copy className="h-4 w-4 mr-2" /> Copiar código Pix</>}
              </Button>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aguardando confirmação do pagamento…
          </div>
        </div>

        <div className="text-center mt-6 space-x-4">
          <button onClick={() => nav("/minha-conta")} className="text-xs text-muted-foreground hover:underline">
            Ver meus pedidos
          </button>
          <button onClick={() => nav("/")} className="text-xs text-muted-foreground hover:underline">
            Voltar à loja
          </button>
        </div>
      </div>
    </Layout>
  );
}
