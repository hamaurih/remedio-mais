import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

export default function AdminPayments() {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<any[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [merchantId, setMerchantId] = useState("");
  const [merchantKey, setMerchantKey] = useState("");
  const [credStatus, setCredStatus] = useState<any>(null);
  const [savingCreds, setSavingCreds] = useState(false);
  const [testingCreds, setTestingCreds] = useState(false);

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
      loadCredentialStatus();
    })();
  }, []);

  const loadCredentialStatus = async () => {
    const { data, error } = await supabase.functions.invoke("manage-cielo-credentials", { body: { action: "status" } });
    if (!error) setCredStatus(data);
  };

  const saveCredentials = async () => {
    if (!merchantId.trim() && !merchantKey.trim()) {
      toast.error("Informe pelo menos uma credencial para atualizar.");
      return;
    }
    setSavingCreds(true);
    const { data, error } = await supabase.functions.invoke("manage-cielo-credentials", {
      body: { action: "save", merchant_id: merchantId.trim(), merchant_key: merchantKey.trim() },
    });
    setSavingCreds(false);
    if (error || !data?.ok) {
      toast.error("Não foi possível salvar as credenciais da Cielo.");
      return;
    }
    setMerchantId("");
    setMerchantKey("");
    setCredStatus(data);
    toast.success("Credenciais armazenadas com segurança.");
  };

  const testCredentials = async () => {
    setTestingCreds(true);
    const { data, error } = await supabase.functions.invoke("manage-cielo-credentials", { body: { action: "test" } });
    setTestingCreds(false);
    if (error || !data?.ok) {
      toast.error(data?.status === "invalid_credentials" ? "A Cielo recusou as credenciais." : "Não foi possível validar a conexão com a Cielo.");
      return;
    }
    toast.success(`Conexão Cielo validada em ${data.environment === "sandbox" ? "Sandbox" : "Produção"}.`);
    const { data: settings } = await supabase.from("payment_settings" as any).select("*").eq("id", 1).maybeSingle();
    if (settings) setS(settings);
  };

  const loadErrors = async () => {
    setLoadingErrors(true);
    const { data } = await supabase.from("payment_errors" as any).select("*").order("created_at", { ascending: false }).limit(30);
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

  const fullyConfigured = !!credStatus?.merchant_id_configured && !!credStatus?.merchant_key_configured;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Pagamentos · Cielo</h1>
        <p className="text-sm text-muted-foreground">Checkout transparente (Cielo API 3.0). Pix e cartão são processados dentro do site — sem redirecionamento.</p>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold flex items-center gap-2"><KeyRound className="h-4 w-4" /> Credenciais Cielo</h2>
            <p className="text-xs text-muted-foreground mt-1">Área segura e exclusiva do administrador. As credenciais são enviadas por HTTPS e gravadas criptografadas no Supabase Vault. Depois de salvas, o sistema nunca exibe os valores novamente.</p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${fullyConfigured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {fullyConfigured ? "Configurada" : "Pendente"}
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Merchant ID</Label>
            <Input type="password" autoComplete="off" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder={credStatus?.merchant_id_configured ? "Já configurado — digite só para trocar" : "Cole o Merchant ID"} />
            <CredentialState ok={!!credStatus?.merchant_id_configured} />
          </div>
          <div className="space-y-2">
            <Label>Merchant Key</Label>
            <Input type="password" autoComplete="new-password" value={merchantKey} onChange={(e) => setMerchantKey(e.target.value)} placeholder={credStatus?.merchant_key_configured ? "Já configurada — digite só para trocar" : "Cole a Merchant Key"} />
            <CredentialState ok={!!credStatus?.merchant_key_configured} />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span>Não envie essas credenciais por WhatsApp, e-mail, GitHub ou chat. Cole-as somente aqui. Elas não são salvas no navegador nem retornam pela API depois do envio.</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveCredentials} disabled={savingCreds}>{savingCreds ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar credenciais"}</Button>
          <Button variant="outline" onClick={testCredentials} disabled={testingCreds || !fullyConfigured}>{testingCreds ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testando...</> : "Testar conexão Cielo"}</Button>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Gateway</Label>
            <Select value={s.gateway || "cielo"} onValueChange={(v) => setS({ ...s, gateway: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="cielo">Cielo (API 3.0)</SelectItem><SelectItem value="mercado_pago">Mercado Pago (legado)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select value={s.environment} onValueChange={(v) => setS({ ...s, environment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sandbox">Sandbox (teste)</SelectItem><SelectItem value="production">Produção</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <Toggle label="Aceitar Pix" value={s.pix_enabled} onChange={(v) => setS({ ...s, pix_enabled: v })} />
        <Toggle label="Aceitar Cartão de crédito" value={s.credit_card_enabled} onChange={(v) => setS({ ...s, credit_card_enabled: v })} />
        <Toggle label="Aceitar Boleto (não disponível nesta fase)" value={s.boleto_enabled} onChange={(v) => setS({ ...s, boleto_enabled: v })} disabled />
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-2">
            <Label>Máx. parcelas sem juros</Label>
            <Input type="number" min={1} max={12} value={s.installments_no_interest_max ?? 6} onChange={(e) => setS({ ...s, installments_no_interest_max: Number(e.target.value) })} />
            <p className="text-[11px] text-muted-foreground">Faixas: R$40→2x · R$70→3x · R$150→4x · R$200→5x · R$300→6x</p>
          </div>
        </div>
        <div className="flex gap-2 pt-2"><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</Button></div>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card text-sm space-y-2">
        <h2 className="font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Webhook Cielo</h2>
        <p className="text-muted-foreground text-xs">Endpoint de notificação de alteração de status:</p>
        <code className="block bg-secondary p-2 rounded text-xs break-all">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/cielo-webhook</code>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-bold">Últimos erros de pagamento</h2><Button size="sm" variant="outline" onClick={loadErrors} disabled={loadingErrors}>{loadingErrors ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</Button></div>
        {errors.length === 0 && <p className="text-xs text-muted-foreground">Nenhum erro registrado.</p>}
        <div className="space-y-2">{errors.map((e) => <details key={e.id} className="border rounded-md p-3 text-xs"><summary className="cursor-pointer flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</span><span className="font-bold text-destructive">{e.error_code || "ERR"}</span><span className="text-muted-foreground">· {e.stage}</span>{e.http_status && <span className="text-muted-foreground">· HTTP {e.http_status}</span>}<span className="ml-auto truncate max-w-[40%]">{e.message}</span></summary><div className="mt-2 space-y-1 text-[11px]">{e.order_id && <div><strong>Pedido:</strong> {e.order_id}</div>}<div><strong>Mensagem:</strong> {e.message}</div>{e.payload_summary && <div><strong>Payload:</strong><pre className="bg-secondary p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(e.payload_summary, null, 2)}</pre></div>}</div></details>)}</div>
      </div>
    </div>
  );
}

function CredentialState({ ok }: { ok: boolean }) {
  return <p className={`text-[11px] flex items-center gap-1 ${ok ? "text-emerald-700" : "text-amber-700"}`}>{ok ? <><CheckCircle2 className="h-3.5 w-3.5" />Armazenada no Vault</> : "Ainda não configurada"}</p>;
}
function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="flex items-center justify-between"><Label className={disabled ? "text-muted-foreground" : ""}>{label}</Label><Switch checked={value} onCheckedChange={onChange} disabled={disabled} /></div>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className="w-full border rounded-md px-3 py-2 text-sm bg-background" />; }
