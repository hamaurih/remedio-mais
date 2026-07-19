import { useTenant } from "@/hooks/useTenant";
import { selectTenantRows, tenantQueryKey } from "@/lib/tenantQuery";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, AlertCircle, Loader2, RefreshCw } from "lucide-react";

export default function AdminPayments() {
  const { activeOrganization, activeStore } = useTenant();
  const tenantScope = {
    organizationId: activeOrganization?.id ?? null,
    storeId: activeStore?.id ?? null,
  };
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errors, setErrors] = useState<any[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await selectTenantRows("payment_settings", tenantScope, "*").maybeSingle();
      setS(data || {
        organization_id: tenantScope.organizationId,
        store_id: tenantScope.storeId,
        gateway: "mercado_pago",
        environment: "sandbox",
        pix_enabled: true,
        credit_card_enabled: true,
        boleto_enabled: false,
        modo_integracao: "checkout_redirect",
      });
      setLoading(false);
      loadErrors();
    })();
  }, [tenantScope.organizationId, tenantScope.storeId]);

  const loadErrors = async () => {
    setLoadingErrors(true);
    const { data } = await selectTenantRows("payment_errors", tenantScope, "*")
      .order("created_at", { ascending: false })
      .limit(30);
    setErrors(data || []);
    setLoadingErrors(false);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("payment_settings" as any).upsert(
      {
        ...s,
        organization_id: tenantScope.organizationId,
        store_id: tenantScope.storeId,
      },
      { onConflict: "organization_id,store_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Salvo");
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      // Chama a Edge Function de checkout com um body propositalmente vazio.
      // Resposta esperada: 400 CART_EMPTY se token + auth OK; 500 ENV_MISSING se faltar config.
      const { data, error } = await supabase.functions.invoke("create-mercado-pago-checkout", {
        body: {
          items: [],
          payment_method: "pix",
          delivery_type: "pickup",
          customer: { name: "", email: "", phone: "" },
          return_origin: window.location.origin,
          organization_id: tenantScope.organizationId,
          store_id: tenantScope.storeId,
        },
      });

      let parsed: any = data;
      if (error) {
        try {
          const resp: Response | undefined = (error as any)?.context;
          if (resp?.text) {
            const text = await resp.text();
            try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }
          }
        } catch { /* ignore */ }
      }

      const code = parsed?.error_code;
      let status: "ok" | "fail" = "fail";
      let msg = parsed?.error || "Falha desconhecida";

      if (code === "ENV_MISSING") {
        msg = `Configuração ausente: ${parsed?.details?.missing?.join(", ") || "verifique secrets"}`;
      } else if (code === "AUTH_MISSING" || code === "AUTH_INVALID") {
        msg = "Faça login no site para testar (a função requer sessão).";
      } else if (code === "CART_EMPTY") {
        // Sucesso: passou de env check + auth + parse — conexão OK
        status = "ok";
        msg = `Conexão OK (ambiente: ${s.environment})`;
      } else if (parsed?.success) {
        status = "ok";
        msg = "Conexão OK";
      }

      await supabase.from("payment_settings" as any).update({
        last_connection_test_at: new Date().toISOString(),
        last_connection_status: status,
      })
        .eq("organization_id", tenantScope.organizationId)
        .eq("store_id", tenantScope.storeId);
      setS((p: any) => ({ ...p, last_connection_test_at: new Date().toISOString(), last_connection_status: status }));

      if (status === "ok") toast.success(msg);
      else toast.error(msg, { duration: 8000 });
      loadErrors();
    } catch (e: any) {
      toast.error(`Falha ao testar: ${e?.message ?? e}`);
    } finally { setTesting(false); }
  };

  if (loading || !s) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-3xl space-y-6">
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
            Testar Mercado Pago
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

      <div className="bg-card border rounded-xl p-5 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Últimos erros de pagamento</h2>
          <Button size="sm" variant="outline" onClick={loadErrors} disabled={loadingErrors}>
            {loadingErrors ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {errors.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum erro registrado.</p>
        )}
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
                {e.user_email && <div><strong>Usuário:</strong> {e.user_email}</div>}
                {e.order_id && <div><strong>Pedido:</strong> {e.order_id}</div>}
                <div><strong>Mensagem:</strong> {e.message}</div>
                {e.mp_error && (
                  <div>
                    <strong>Erro Mercado Pago:</strong>
                    <pre className="bg-secondary p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(e.mp_error, null, 2)}</pre>
                  </div>
                )}
                {e.supabase_error && (
                  <div>
                    <strong>Erro Supabase:</strong>
                    <pre className="bg-secondary p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(e.supabase_error, null, 2)}</pre>
                  </div>
                )}
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
