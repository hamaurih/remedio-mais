import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export default function AdminPayments() {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("payment_settings" as any).select("*").eq("id", 1).maybeSingle();
      setS(data || { id: 1, gateway: "mercado_pago", environment: "sandbox", pix_enabled: true, credit_card_enabled: true, boleto_enabled: false, modo_integracao: "checkout_redirect" });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("payment_settings" as any).upsert(s);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Salvo");
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-mercado-pago-status", { body: { order_id: "00000000-0000-0000-0000-000000000000" } });
      // Esperamos um 404 "Pedido não encontrado" — confirma que o token está OK no backend.
      const reachable = (error as any)?.context?.status === 404 || data?.error === "Pedido não encontrado";
      const status = reachable ? "ok" : "fail";
      await supabase.from("payment_settings" as any).update({ last_connection_test_at: new Date().toISOString(), last_connection_status: status }).eq("id", 1);
      setS((p: any) => ({ ...p, last_connection_test_at: new Date().toISOString(), last_connection_status: status }));
      reachable ? toast.success("Conexão OK") : toast.error("Configure o MERCADO_PAGO_ACCESS_TOKEN nos Secrets");
    } catch {
      toast.error("Falha ao testar");
    } finally { setTesting(false); }
  };

  if (loading || !s) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Pagamentos</h1>
        <p className="text-sm text-muted-foreground">Configuração do Mercado Pago (Checkout Pro / redirect).</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          Os tokens do Mercado Pago ficam armazenados em <strong>Secrets</strong> (nunca no banco):
          <code className="block mt-1">MERCADO_PAGO_ACCESS_TOKEN</code>
          <code className="block">MERCADO_PAGO_PUBLIC_KEY</code>
          <code className="block">MERCADO_PAGO_WEBHOOK_SECRET</code>
          Adicione/edite em Configurações → Secrets.
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card space-y-4">
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

        <Toggle label="Aceitar Pix" value={s.pix_enabled} onChange={(v) => setS({ ...s, pix_enabled: v })} />
        <Toggle label="Aceitar Cartão de crédito" value={s.credit_card_enabled} onChange={(v) => setS({ ...s, credit_card_enabled: v })} />
        <Toggle label="Aceitar Boleto (não disponível nesta fase)" value={s.boleto_enabled} onChange={(v) => setS({ ...s, boleto_enabled: v })} disabled />

        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          <Button onClick={testConnection} variant="outline" disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            Testar conexão
          </Button>
        </div>

        {s.last_connection_test_at && (
          <div className="text-xs text-muted-foreground">
            Último teste: {new Date(s.last_connection_test_at).toLocaleString("pt-BR")} · status: <strong>{s.last_connection_status}</strong>
          </div>
        )}
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-card text-sm space-y-2">
        <h2 className="font-bold">Webhook</h2>
        <p className="text-muted-foreground text-xs">Configure este endpoint no painel do Mercado Pago (Webhooks → Notificações):</p>
        <code className="block bg-secondary p-2 rounded text-xs break-all">
          {import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercado-pago-webhook
        </code>
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
