import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type MapsStatus = {
  configured?: boolean;
  stored_configured?: boolean;
  source?: "store_vault" | "environment" | "none";
  updated_at?: string | null;
};

type TestResult = {
  ok?: boolean;
  status?: string;
  geocoding_ok?: boolean;
  routes_ok?: boolean;
  geocoding_status?: string;
  routes_status?: string;
};

export function GoogleMapsCredentialPanel({ storeSettingsId = 1 }: { storeSettingsId?: number }) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<MapsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<TestResult | null>(null);

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-google-maps-credentials", {
      body: { store_settings_id: storeSettingsId, ...body },
    });
    if (error) throw new Error((data as any)?.error || error.message || "Falha na integração Google Maps");
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await invoke({ action: "status" });
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [storeSettingsId]);

  const saveKey = async () => {
    const key = apiKey.trim();
    if (!key) {
      toast.error("Cole a chave de servidor do Google Maps.");
      return;
    }
    setSaving(true);
    try {
      const data = await invoke({ action: "save", server_api_key: key });
      setStatus(data);
      setApiKey("");
      setLastTest(null);
      toast.success("Chave Google Maps salva com segurança.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar a chave.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const data = await invoke({ action: "test" });
      setLastTest(data);
      if (data?.ok) {
        toast.success("Google Maps conectado: Geocoding e Routes funcionando.");
      } else {
        toast.error(`Google Maps ainda não está pronto. Geocoding: ${data?.geocoding_status || "falhou"} · Routes: ${data?.routes_status || "falhou"}`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Falha ao testar Google Maps.");
    } finally {
      setTesting(false);
    }
  };

  const configured = !!status?.configured;
  const storedHere = !!status?.stored_configured;

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <KeyRound className="h-4 w-4" /> Google Maps — chave privada da loja
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Cada operação pode usar a própria chave para geocodificação e cálculo de rota/frete.
          </p>
        </div>
        <div className={`text-xs font-semibold ${configured ? "text-emerald-600" : "text-amber-600"}`}>
          {loadingStatus ? "Verificando…" : configured ? "Configurada" : "Não configurada"}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Google Maps Server API Key</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={configured ? "Chave já configurada — cole outra apenas para substituir" : "Cole aqui a chave de servidor"}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Habilite Geocoding API e Routes API no Google Cloud. Esta chave é usada somente no servidor.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={saveKey} disabled={saving || !apiKey.trim()}>
          {saving ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Salvando…</> : "Salvar chave"}
        </Button>
        <Button size="sm" variant="outline" onClick={testConnection} disabled={testing || !configured}>
          {testing ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Testando…</> : "Testar Google Maps"}
        </Button>
      </div>

      <div className="rounded-md border bg-background px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>A chave é guardada criptografada no Supabase Vault e nunca volta para o navegador.</span>
        </div>
        {storedHere && status?.updated_at && (
          <div className="text-muted-foreground">
            Chave desta loja atualizada em {new Date(status.updated_at).toLocaleString("pt-BR")}.
          </div>
        )}
        {status?.source === "environment" && !storedHere && (
          <div className="text-muted-foreground">
            Há uma chave global de fallback ativa. Ao salvar aqui, esta loja passa a usar a própria chave.
          </div>
        )}
        {lastTest?.ok && (
          <div className="flex items-center gap-2 text-emerald-600 font-medium">
            <CheckCircle2 className="h-4 w-4" /> Geocoding e Routes validados.
          </div>
        )}
        {lastTest && !lastTest.ok && (
          <div className="text-destructive">
            Geocoding: {lastTest.geocoding_status || "falhou"} · Routes: {lastTest.routes_status || "falhou"}
          </div>
        )}
      </div>
    </div>
  );
}
