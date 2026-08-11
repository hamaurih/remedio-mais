import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, Activity, KeyRound, Loader2, Send, ShieldCheck } from "lucide-react";
import { getMetaConfig, isPixelLoaded } from "@/lib/metaEvents";

type Settings = {
  meta_enabled: boolean;
  meta_pixel_id: string | null;
  meta_test_event_code: string | null;
  meta_capi_enabled: boolean;
  meta_consent_required: boolean;
  updated_at?: string;
};

type StatusInfo = {
  token_configured: boolean;
  pixel_configured: boolean;
  meta_enabled: boolean;
  capi_enabled: boolean;
  test_event_code_configured: boolean;
};

type EventLog = {
  id: string;
  event_name: string;
  event_id: string;
  source: string;
  status: string;
  http_status: number | null;
  response_masked: string | null;
  test_mode: boolean;
  value: number | null;
  created_at: string;
  sent_at: string | null;
  order_id: string | null;
};

export default function AdminMetaAds() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [lastTest, setLastTest] = useState<Record<string, unknown> | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["marketing-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("marketing_settings")
        .select("meta_enabled, meta_pixel_id, meta_test_event_code, meta_capi_enabled, meta_consent_required, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as Settings | null;
    },
  });

  const { data: status } = useQuery({
    queryKey: ["meta-capi-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-conversions-api", { body: { action: "status" } });
      if (error) throw error;
      return data as StatusInfo;
    },
    refetchInterval: 60_000,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["meta-event-logs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_event_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as EventLog[];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const last24h = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const counts: Record<string, number> = {};
    for (const l of logs) {
      if (new Date(l.created_at).getTime() < since) continue;
      counts[l.event_name] = (counts[l.event_name] || 0) + 1;
    }
    return counts;
  }, [logs]);

  const lastBrowser = logs.find((l) => l.source === "browser");
  const lastServer = logs.find((l) => l.source === "server");
  const recentErrors = logs.filter((l) => l.status === "error").slice(0, 5);

  const save = async () => {
    if (!form) return;
    const pixel = (form.meta_pixel_id || "").trim();
    if (form.meta_enabled && !/^\d{10,20}$/.test(pixel)) {
      toast.error("Informe um Pixel/Dataset ID válido (apenas números).");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("marketing_settings").update({
      meta_enabled: form.meta_enabled,
      meta_pixel_id: pixel || null,
      meta_test_event_code: (form.meta_test_event_code || "").trim() || null,
      meta_capi_enabled: form.meta_capi_enabled,
      meta_consent_required: form.meta_consent_required,
    }).eq("id", 1);
    setSaving(false);
    if (error) { toast.error(`Não foi possível salvar: ${error.message}`); return; }
    toast.success("Configuração Meta salva. Recarregue o site para aplicar o Pixel.");
    qc.invalidateQueries({ queryKey: ["marketing-settings"] });
    qc.invalidateQueries({ queryKey: ["meta-capi-status"] });
  };

  const runTest = async (kind: "pixel" | "PageView" | "ViewContent" | "Purchase") => {
    setTesting(kind);
    try {
      if (kind === "pixel") {
        const cfg = getMetaConfig();
        const ok = isPixelLoaded();
        setLastTest({
          teste: "Pixel no navegador",
          pixel_id: cfg.pixel_id || "(não configurado)",
          ativo_no_navegador: ok,
          timestamp: new Date().toISOString(),
        });
        ok ? toast.success("Pixel carregado neste navegador.") : toast.error("Pixel não está ativo neste navegador.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("meta-conversions-api", {
        body: { action: "test", event_name: kind },
      });
      if (error) throw error;
      setLastTest({ teste: `CAPI ${kind}`, ...(data as Record<string, unknown>) });
      (data as any)?.ok ? toast.success(`Evento ${kind} enviado à Meta.`) : toast.error(`Meta respondeu HTTP ${(data as any)?.http_status ?? "?"}.`);
      qc.invalidateQueries({ queryKey: ["meta-event-logs"] });
    } catch (e) {
      toast.error((e as Error).message || "Falha no teste.");
    } finally {
      setTesting(null);
    }
  };

  if (isLoading || !form) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold">Meta Ads — Pixel + Conversions API</h1>
        <p className="text-sm text-muted-foreground">
          Mensuração e otimização de campanhas. O access token da CAPI fica somente em secret do backend.
        </p>
      </div>

      {!status?.token_configured && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>META_CAPI_ACCESS_TOKEN não configurado</AlertTitle>
          <AlertDescription>
            Cadastre o token em Configurações do Projeto → Secrets com o nome <strong>META_CAPI_ACCESS_TOKEN</strong>.
            Sem ele, o Pixel do navegador funciona, mas a Conversions API não envia eventos.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>Preencha com os dados reais do seu Events Manager.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="meta_enabled">Integração Meta ativa</Label>
              <p className="text-xs text-muted-foreground">Desligado, nada é carregado nem enviado.</p>
            </div>
            <Switch id="meta_enabled" checked={form.meta_enabled}
              onCheckedChange={(v) => setForm({ ...form, meta_enabled: v })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pixel">Pixel / Dataset ID</Label>
            <Input id="pixel" inputMode="numeric" placeholder="ex.: 1234567890123456"
              value={form.meta_pixel_id ?? ""}
              onChange={(e) => setForm({ ...form, meta_pixel_id: e.target.value.replace(/\D/g, "") })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="test">Código de evento de teste (opcional)</Label>
            <Input id="test" placeholder="TEST12345"
              value={form.meta_test_event_code ?? ""}
              onChange={(e) => setForm({ ...form, meta_test_event_code: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              Preenchido, todos os eventos da CAPI aparecem em Test Events e não contam como conversão real.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="capi">Conversions API ativa</Label>
              <p className="text-xs text-muted-foreground">Envio server-side com deduplicação por event_id.</p>
            </div>
            <Switch id="capi" checked={form.meta_capi_enabled}
              onCheckedChange={(v) => setForm({ ...form, meta_capi_enabled: v })} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="consent">Exigir consentimento de marketing</Label>
              <p className="text-xs text-muted-foreground">
                Ligado, o Pixel só carrega após consentimento registrado no navegador.
              </p>
            </div>
            <Switch id="consent" checked={form.meta_consent_required}
              onCheckedChange={(v) => setForm({ ...form, meta_consent_required: v })} />
          </div>

          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar configuração
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Diagnóstico</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Diag label="Pixel/Dataset configurado" value={status?.pixel_configured ? (form.meta_pixel_id ?? "-") : "não"} ok={!!status?.pixel_configured} />
          <Diag label="Pixel ativo neste navegador" value={isPixelLoaded() ? "ativo" : "inativo"} ok={isPixelLoaded()} />
          <Diag label="Conversions API" value={status?.capi_enabled ? "ativa" : "inativa"} ok={!!status?.capi_enabled} />
          <Diag label="Token configurado" value={status?.token_configured ? "sim" : "não"} ok={!!status?.token_configured} icon={<KeyRound className="h-3.5 w-3.5" />} />
          <Diag label="Modo de teste" value={status?.test_event_code_configured ? "Test Events" : "produção"} ok />
          <Diag label="Último evento (navegador)" value={lastBrowser ? `${lastBrowser.event_name} · ${fmt(lastBrowser.created_at)}` : "nenhum"} ok={!!lastBrowser} />
          <Diag label="Último evento (servidor)" value={lastServer ? `${lastServer.event_name} · ${fmt(lastServer.created_at)}` : "nenhum"} ok={!!lastServer} />
          <Diag label="Eventos nas últimas 24h" value={Object.entries(last24h).map(([k, v]) => `${k}: ${v}`).join(" · ") || "nenhum"} ok={Object.keys(last24h).length > 0} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Testes</CardTitle>
          <CardDescription>
            O Purchase de teste usa valor fictício (R$ 1,99) e é marcado como <code>admin_test</code> — nenhum pedido real é alterado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => runTest("pixel")} disabled={!!testing}>
              {testing === "pixel" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Testar Pixel
            </Button>
            <Button variant="outline" onClick={() => runTest("PageView")} disabled={!!testing}>
              {testing === "PageView" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Testar Conversions API (PageView)
            </Button>
            <Button variant="outline" onClick={() => runTest("ViewContent")} disabled={!!testing}>
              {testing === "ViewContent" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar ViewContent de teste
            </Button>
            <Button variant="outline" onClick={() => runTest("Purchase")} disabled={!!testing}>
              {testing === "Purchase" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar Purchase de teste
            </Button>
          </div>
          {lastTest && (
            <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">{JSON.stringify(lastTest, null, 2)}</pre>
          )}
          {recentErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erros recentes</AlertTitle>
              <AlertDescription className="space-y-1 text-xs">
                {recentErrors.map((e) => (
                  <div key={e.id}>{e.event_name} · HTTP {e.http_status ?? "-"} · {e.response_masked?.slice(0, 160)}</div>
                ))}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Eventos recentes enviados</CardTitle>
          <CardDescription>Sem token e sem dados pessoais em claro — respostas mascaradas.</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>event_id</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.event_name}</TableCell>
                      <TableCell><Badge variant="secondary">{l.source}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={l.status === "sent" ? "default" : l.status === "error" ? "destructive" : "outline"}>
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{l.http_status ?? "-"}</TableCell>
                      <TableCell>{l.value != null ? `R$ ${Number(l.value).toFixed(2)}` : "-"}</TableCell>
                      <TableCell className="text-xs max-w-[220px] truncate" title={l.event_id}>{l.event_id}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmt(l.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Diag({ label, value, ok, icon }: { label: string; value: string; ok?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className={`text-sm font-semibold mt-1 ${ok ? "text-emerald-600" : "text-muted-foreground"}`}>{value}</div>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}
