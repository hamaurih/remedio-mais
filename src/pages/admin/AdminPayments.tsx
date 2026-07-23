import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

export default function AdminPayments() {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<any[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("payment_settings" as any).select("*").eq("id", 1).maybeSingle();
      setS(data || {
        id: 1, gateway: "cielo", environment: "production",
        pix_enabled: true, credit_card_enabled: true, boleto_enabled: false,
        installments_max: 6, installments_no_interest_max: 6,
      });
      setLoading(false);
      loadErrors();
    })();
  }, []);

  const loadErrors = async () => {
    setLoadingErrors(true);
    const { data } = await supabase
      .from("payment_errors" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setErrors(data || []);
    setLoadingErrors(false);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("payment_settings" as any).upsert(s);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Configurações salvas");
  };

  if (loading || !s) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Pagamentos · Cielo</h1>
        <p className="text-sm text-muted-foreground">
          Checkout transparente (Cielo API 3.0). Pix e cartão são processados dentro do site — sem redirecionamento.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          Credenciais da Cielo ficam armazenadas em <strong>Secrets</strong> (nunca no banco):
          <code className="block mt-1">CIELO_MERCHANT_ID</code>
          <code className="block">CIELO_MERCHANT_KEY</code>
          Adicione/edite em Configurações → Secrets.
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Gateway</Label>
            <Select value={s.gateway || "cielo"} onValueChange={(v) => setS({ ...s, gateway: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cielo">Cielo (API 3.0)</SelectItem>
                <SelectItem value="mercado_pago">Mercado Pago (legado)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select value={s.environment} onValueChange={(v) => setS({ ...s, environment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (teste)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Toggle label="Aceitar Pix" value={s.pix_enabled} onChange={(v) => setS({ ...s, pix_enabled: v })} />
        <Toggle label="Aceitar Cartão de crédito" value={s.credit_card_enabled} onChange={(v) => setS({ ...s, credit_card_enabled: v })} />
        <Toggle label="Aceitar Boleto (não disponível nesta fase)" value={s.boleto_enabled} onChange={(v) => setS({ ...s, boleto_enabled: v })} disabled />

        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-2">
            <Label>Máx. parcelas sem juros</Label>
            <Input
              type="number" min={1} max={12}
              value={s.installments_no_interest_max ?? 6}
              onChange={(e) => setS({ ...s, installments_no_interest_max: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">
              Faixas: R$40→2x · R$70→3x · R$150→4x · R$200→5x · R$300→6x
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card text-sm space-y-2">
        <h2 className="font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Webhook Cielo</h2>
        <p className="text-muted-foreground text-xs">Configure este endpoint no painel Cielo (Notificação de Alteração de Status):</p>
        <code className="block bg-secondary p-2 rounded text-xs break-all">
          {import.meta.env.VITE_SUPABASE_URL}/functions/v1/cielo-webhook
        </code>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Últimos erros de pagamento</h2>
          <Button size="sm" variant="outline" onClick={loadErrors} disabled={loadingErrors}>
            {loadingErrors ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {errors.length === 0 && <p className="text-xs text-muted-foreground">Nenhum erro registrado.</p>}
        <div className="space-y-2">
          {errors.map((e) => (
            <details key={e.id} className="border rounded-md p-3 text-xs">
              <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("pt-BR")}
                </span>
                <span className="font-bold text-destructive">{e.error_code || "ERR"}</span>
                <span className="text-muted-foreground">· {e.stage}</span>
                {e.http_status && <span className="text-muted-foreground">· HTTP {e.http_status}</span>}
                <span className="ml-auto truncate max-w-[40%]">{e.message}</span>
              </summary>
              <div className="mt-2 space-y-1 text-[11px]">
                {e.order_id && <div><strong>Pedido:</strong> {e.order_id}</div>}
                <div><strong>Mensagem:</strong> {e.message}</div>
                {e.payload_summary && (
                  <div>
                    <strong>Payload:</strong>
                    <pre className="bg-secondary p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(e.payload_summary, null, 2)}</pre>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Label className={disabled ? "text-muted-foreground" : ""}>{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full border rounded-md px-3 py-2 text-sm bg-background" />;
}
