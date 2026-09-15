import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle2,
  Clock3,
  Cloud,
  Database,
  Download,
  FileCheck2,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

type BackupSettings = {
  enabled: boolean;
  timezone: string;
  daily_time: string;
  retention_daily: number;
  retention_weekly: number;
  retention_monthly: number;
  external_enabled: boolean;
  external_provider: string | null;
  external_folder_label: string | null;
  last_success_at: string | null;
  last_verified_at: string | null;
};

type BackupRun = {
  id: string;
  kind: "manual" | "automatic";
  status: "queued" | "running" | "completed" | "partial" | "failed";
  started_at: string | null;
  finished_at: string | null;
  retention_class: "daily" | "weekly" | "monthly";
  retention_until: string | null;
  tables_total: number;
  tables_done: number;
  db_artifacts: number;
  media_artifacts: number;
  total_bytes: number;
  external_status: string;
  manifest_path: string | null;
  verified_at: string | null;
  last_progress_at: string | null;
  error_message: string | null;
  created_at: string;
};

type BackupTask = {
  task_type: "database" | "auth" | "media";
  status: "pending" | "running" | "completed" | "failed";
};

type BackupArtifact = {
  id: string;
  run_id: string;
  artifact_type: "database" | "auth" | "media" | "manifest";
  source_name: string;
  storage_path: string;
  bytes: number;
  sha256: string;
  offsite_status: string;
  integrity_verified: boolean;
  integrity_error: string | null;
  created_at: string;
};

export default function AdminBackups() {
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: ["backup-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("backup_settings")
        .select("*")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data as BackupSettings;
    },
    refetchInterval: 30_000,
  });

  const runs = useQuery({
    queryKey: ["backup-runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("backup_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data || []) as BackupRun[];
    },
    refetchInterval: (query) => {
      const rows = query.state.data as BackupRun[] | undefined;
      return rows?.some((r) => r.status === "running" || r.status === "queued") ? 5_000 : 20_000;
    },
  });

  const latest = runs.data?.[0] || null;

  const tasks = useQuery({
    queryKey: ["backup-tasks", latest?.id],
    enabled: !!latest?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("backup_tasks")
        .select("task_type,status")
        .eq("run_id", latest!.id);
      if (error) throw error;
      return (data || []) as BackupTask[];
    },
    refetchInterval: latest?.status === "running" ? 5_000 : 30_000,
  });

  const artifacts = useQuery({
    queryKey: ["backup-artifacts", latest?.id],
    enabled: !!latest?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("backup_artifacts")
        .select("id,run_id,artifact_type,source_name,storage_path,bytes,sha256,offsite_status,integrity_verified,integrity_error,created_at")
        .eq("run_id", latest!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BackupArtifact[];
    },
    refetchInterval: latest?.status === "running" ? 5_000 : 30_000,
  });

  const manifests = useQuery({
    queryKey: ["backup-manifests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("backup_artifacts")
        .select("id,run_id,storage_path,integrity_verified,created_at")
        .eq("artifact_type", "manifest")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data || []) as Array<{ id: string; run_id: string; storage_path: string; integrity_verified: boolean; created_at: string }>;
    },
    refetchInterval: 30_000,
  });

  const startBackup = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("system-backup", {
        body: { action: "start-manual" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "backup_failed");
      return data;
    },
    onSuccess: (data) => {
      if (data?.already_running) toast.info("Já existe um backup em andamento.");
      else toast.success("Backup iniciado. Você pode acompanhar o progresso nesta tela.");
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["backup-runs"] }),
        qc.invalidateQueries({ queryKey: ["backup-tasks"] }),
        qc.invalidateQueries({ queryKey: ["backup-artifacts"] }),
      ]);
    },
    onError: () => toast.error("Não foi possível iniciar o backup agora."),
  });

  const taskStats = useMemo(() => {
    const rows = tasks.data || [];
    const total = rows.length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const running = rows.filter((r) => r.status === "running").length;
    return {
      total,
      completed,
      failed,
      running,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [tasks.data]);

  const artifactStats = useMemo(() => {
    const rows = artifacts.data || [];
    const verified = rows.filter((a) => a.integrity_verified).length;
    const integrityErrors = rows.filter((a) => !!a.integrity_error).length;
    const bytes = rows.reduce((sum, a) => sum + Number(a.bytes || 0), 0);
    const media = rows.filter((a) => a.artifact_type === "media").length;
    const db = rows.filter((a) => a.artifact_type === "database" || a.artifact_type === "auth").length;
    const external = rows.filter((a) => a.offsite_status === "uploaded").length;
    return { total: rows.length, verified, integrityErrors, bytes, media, db, external };
  }, [artifacts.data]);

  const latestManifest = latest
    ? manifests.data?.find((m) => m.run_id === latest.id)
    : undefined;

  async function downloadArtifact(artifactId: string) {
    try {
      const { data, error } = await supabase.functions.invoke("system-backup", {
        body: { action: "artifact-url", artifact_id: artifactId },
      });
      if (error || !data?.url) throw error || new Error("url_missing");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Não foi possível gerar o link seguro para download.");
    }
  }

  const automaticActive = settings.data?.enabled !== false;
  const externalConfigured = !!settings.data?.external_folder_label;
  const externalActive = settings.data?.external_enabled === true;
  const isRunning = latest?.status === "running" || latest?.status === "queued";

  return (
    <div className="min-h-full bg-muted/20">
      <div className="max-w-[1500px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <section className="rounded-3xl border bg-card shadow-sm p-6 md:p-8">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
                  <HardDriveDownload className="h-5 w-5" />
                </div>
                <Badge variant={automaticActive ? "default" : "secondary"}>
                  {automaticActive ? "Backup automático ativo" : "Backup automático pausado"}
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Backup e recuperação</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
                Proteção do banco de dados, cadastros, pedidos, configurações e arquivos do Storage com histórico, retenção e verificação de integridade SHA-256.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="lg"
                onClick={() => startBackup.mutate()}
                disabled={startBackup.isPending || isRunning}
              >
                {startBackup.isPending || isRunning
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Archive className="h-4 w-4 mr-2" />}
                {isRunning ? "Backup em andamento" : "Criar backup agora"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  void Promise.all([
                    qc.invalidateQueries({ queryKey: ["backup-settings"] }),
                    qc.invalidateQueries({ queryKey: ["backup-runs"] }),
                    qc.invalidateQueries({ queryKey: ["backup-tasks"] }),
                    qc.invalidateQueries({ queryKey: ["backup-artifacts"] }),
                    qc.invalidateQueries({ queryKey: ["backup-manifests"] }),
                  ]);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            title="Último backup concluído"
            value={settings.data?.last_success_at ? formatDateTime(settings.data.last_success_at) : "Primeiro backup em execução"}
            subtitle="Backup completo do sistema"
            icon={Database}
            good={!!settings.data?.last_success_at}
          />
          <StatusCard
            title="Última verificação"
            value={settings.data?.last_verified_at ? formatDateTime(settings.data.last_verified_at) : "Verificação em andamento"}
            subtitle="SHA-256 conferido após gravação"
            icon={ShieldCheck}
            good={!!settings.data?.last_verified_at}
          />
          <StatusCard
            title="Agendamento"
            value="Todos os dias • 02:30"
            subtitle="Horário de Campina Grande / Fortaleza"
            icon={Clock3}
            good={automaticActive}
          />
          <StatusCard
            title="Cópia externa"
            value={externalActive ? "Google Drive ativo" : externalConfigured ? "Google Drive aguardando autorização" : "Não configurada"}
            subtitle={settings.data?.external_folder_label || "Destino externo ainda não definido"}
            icon={Cloud}
            good={externalActive}
            warning={externalConfigured && !externalActive}
          />
        </div>

        {latest && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {isRunning ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <FileCheck2 className="h-5 w-5 text-primary" />}
                    Backup mais recente
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {latest.kind === "manual" ? "Iniciado manualmente" : "Backup automático"} • {formatDateTime(latest.started_at || latest.created_at)}
                  </p>
                </div>
                <RunStatus status={latest.status} verified={!!latest.verified_at} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium">Processamento</span>
                  <span className="text-muted-foreground">{taskStats.completed}/{taskStats.total || "—"} tarefas</span>
                </div>
                <Progress value={latest.status === "completed" ? 100 : taskStats.percent} className="h-2.5" />
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>Em execução: {taskStats.running}</span>
                  <span>Falhas definitivas: {taskStats.failed}</span>
                  <span>Artefatos: {artifactStats.total}</span>
                  <span>Tamanho gerado: {formatBytes(Math.max(Number(latest.total_bytes || 0), artifactStats.bytes))}</span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <MiniStat label="Banco/Auth" value={String(artifactStats.db)} />
                <MiniStat label="Pacotes de mídia" value={String(artifactStats.media)} />
                <MiniStat label="Integridade verificada" value={`${artifactStats.verified}/${artifactStats.total}`} />
                <MiniStat label="Cópias externas" value={String(artifactStats.external)} />
              </div>

              {artifactStats.integrityErrors > 0 && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
                  <TriangleAlert className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <div className="font-semibold text-sm">Falha de integridade detectada</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {artifactStats.integrityErrors} arquivo(s) não passaram na verificação. O backup não deve ser considerado confiável até o reteste.
                    </div>
                  </div>
                </div>
              )}

              {latest.status === "completed" && latest.verified_at && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <div className="font-semibold text-sm">Backup concluído e verificado</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Manifesto e arquivos passaram pela verificação de integridade.
                      </div>
                    </div>
                  </div>
                  {latestManifest && (
                    <Button variant="outline" size="sm" onClick={() => void downloadArtifact(latestManifest.id)}>
                      <Download className="h-4 w-4 mr-2" /> Baixar manifesto
                    </Button>
                  )}
                </div>
              )}

              {latest.error_message && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                  <strong>Atenção:</strong> {latest.error_message}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-2xl xl:col-span-2">
            <CardHeader>
              <CardTitle>Histórico de backups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs">
                    <tr>
                      <th className="p-3">Data</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Integridade</th>
                      <th className="p-3">Tamanho</th>
                      <th className="p-3">Retenção</th>
                      <th className="p-3 text-right">Manifesto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(runs.data || []).map((run) => {
                      const manifest = manifests.data?.find((m) => m.run_id === run.id);
                      return (
                        <tr key={run.id} className="border-t hover:bg-muted/20">
                          <td className="p-3 whitespace-nowrap">{formatDateTime(run.started_at || run.created_at)}</td>
                          <td className="p-3">{run.kind === "manual" ? "Manual" : "Automático"}</td>
                          <td className="p-3"><RunStatus status={run.status} compact /></td>
                          <td className="p-3">
                            {run.verified_at
                              ? <Badge variant="secondary"><ShieldCheck className="h-3 w-3 mr-1" /> Verificado</Badge>
                              : run.status === "completed"
                                ? <Badge variant="outline">Verificando</Badge>
                                : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3 whitespace-nowrap">{formatBytes(Number(run.total_bytes || 0))}</td>
                          <td className="p-3 whitespace-nowrap">{retentionLabel(run.retention_class)}</td>
                          <td className="p-3 text-right">
                            {manifest ? (
                              <Button variant="ghost" size="sm" onClick={() => void downloadArtifact(manifest.id)}>
                                <Download className="h-4 w-4 mr-1.5" /> Baixar
                              </Button>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {!runs.isLoading && (runs.data || []).length === 0 && (
                      <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">Nenhum backup executado ainda.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader><CardTitle>Política de retenção</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <RetentionRow label="Diários" value={settings.data?.retention_daily ?? 7} />
                <RetentionRow label="Semanais" value={settings.data?.retention_weekly ?? 4} />
                <RetentionRow label="Mensais" value={settings.data?.retention_monthly ?? 12} />
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  Backups expirados são removidos automaticamente do armazenamento interno conforme a política definida.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader><CardTitle>Recuperação protegida</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A restauração não é executada com um clique direto na produção. Primeiro deve ser escolhido um backup verificado, criado um ponto de segurança atual e validada a recuperação antes de substituir dados.
                </p>
                <div className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  As senhas dos usuários não são exportadas em texto ou hash pelo backup complementar do ERP. A recuperação integral do Auth depende também dos mecanismos gerenciados do Supabase.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, value, subtitle, icon: Icon, good = false, warning = false }: {
  title: string; value: string; subtitle: string; icon: any; good?: boolean; warning?: boolean;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={`h-10 w-10 rounded-xl grid place-items-center ${good ? "bg-primary/10 text-primary" : warning ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>
            <Icon className="h-5 w-5" />
          </div>
          {good && <CheckCircle2 className="h-4 w-4 text-primary" />}
          {warning && <TriangleAlert className="h-4 w-4 text-amber-600" />}
        </div>
        <div className="text-xs font-semibold text-muted-foreground mt-4">{title}</div>
        <div className="font-extrabold mt-1 leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-muted/15 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-black mt-1">{value}</div></div>;
}

function RetentionRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">{label}</span><Badge variant="secondary">{value}</Badge></div>;
}

function RunStatus({ status, verified = false, compact = false }: { status: BackupRun["status"]; verified?: boolean; compact?: boolean }) {
  if (status === "running" || status === "queued") {
    return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {compact ? "Executando" : "Backup em andamento"}</Badge>;
  }
  if (status === "completed") {
    return <Badge>{verified && !compact ? <ShieldCheck className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />} Concluído</Badge>;
  }
  if (status === "partial") return <Badge variant="outline" className="border-amber-500 text-amber-700"><TriangleAlert className="h-3 w-3 mr-1" /> Parcial</Badge>;
  return <Badge variant="destructive"><TriangleAlert className="h-3 w-3 mr-1" /> Falhou</Badge>;
}

function retentionLabel(value: BackupRun["retention_class"]) {
  if (value === "monthly") return "Mensal";
  if (value === "weekly") return "Semanal";
  return "Diário";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / Math.pow(1024, index);
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}
