import { createClient } from "npm:@supabase/supabase-js@2";
import { zipSync } from "npm:fflate@0.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BACKUP_BUCKET = "system-backups";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const enc = new TextEncoder();

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = new Set([
    "https://atacadaodosmedicamentos.com.br",
    "https://www.atacadaodosmedicamentos.com.br",
    "http://localhost:5173",
    "http://localhost:8080",
  ]);
  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://www.atacadaodosmedicamentos.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backup-internal",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function gzip(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function isAdminToken(token: string) {
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;
  const { data: role } = await admin.from("user_roles").select("role")
    .eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return role ? user : null;
}
async function authorize(req: Request) {
  const internal = req.headers.get("x-backup-internal") || "";
  if (internal) {
    const { data } = await admin.rpc("backup_validate_internal_token", { _token: internal });
    if (data === true) return { type: "internal" as const, user: null };
  }
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const user = await isAdminToken(bearer);
  if (user) return { type: "admin" as const, user };
  return null;
}
async function settings() {
  const { data, error } = await admin.from("backup_settings").select("*").eq("id", true).single();
  if (error) throw error;
  return data as any;
}

async function internalConfig(key: string) {
  const { data, error } = await admin.rpc("backup_internal_config_value", { _key: key });
  if (error) throw error;
  return String(data || "");
}

async function dispatchPendingOffsite(limit = 5) {
  const cfg = await settings();
  if (!cfg.external_enabled) return { dispatched: 0 };
  const webhook = await internalConfig("make_webhook_url");
  if (!webhook) return { dispatched: 0 };

  const { data: rows, error } = await admin.from("backup_artifacts")
    .select("id,run_id,artifact_type,source_name,storage_path,bytes,sha256")
    .eq("offsite_status", "pending")
    .order("created_at")
    .limit(Math.max(1, Math.min(limit, 10)));
  if (error) throw error;

  let dispatched = 0;
  for (const art of rows || []) {
    try {
      const { data: signed, error: signError } = await admin.storage
        .from(BACKUP_BUCKET).createSignedUrl(art.storage_path, 3600);
      if (signError || !signed?.signedUrl) throw signError || new Error("signed_url_failed");

      const rawToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const tokenHash = await sha256(enc.encode(rawToken));
      const driveName = `${art.run_id}__${art.artifact_type}__${String(art.source_name).replace(/[^a-zA-Z0-9._-]+/g, "_")}__${art.storage_path.split("/").pop()}`;

      await admin.from("backup_artifacts").update({
        offsite_status: "uploading",
        offsite_callback_hash: tokenHash,
      }).eq("id", art.id);

      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifact_id: art.id,
          run_id: art.run_id,
          artifact_type: art.artifact_type,
          source_name: art.source_name,
          file_name: driveName,
          signed_url: signed.signedUrl,
          callback_url: `${SUPABASE_URL}/functions/v1/system-backup`,
          callback_token: rawToken,
          sha256: art.sha256,
          bytes: art.bytes,
        }),
      });
      if (!response.ok) throw new Error(`make_webhook_${response.status}`);
      dispatched++;
      await refreshRunExternal(art.run_id);
    } catch (e) {
      await admin.from("backup_artifacts").update({
        offsite_status: "pending",
        offsite_callback_hash: null,
      }).eq("id", art.id);
      console.error("offsite dispatch failed", e instanceof Error ? e.message : String(e));
    }
  }
  return { dispatched };
}

async function handleOffsiteCallback(body: any) {
  const artifactId = String(body?.artifact_id || "");
  const token = String(body?.callback_token || "");
  if (!artifactId || !token) return { ok: false, status: 400, error: "invalid_callback" };

  const { data: art, error } = await admin.from("backup_artifacts")
    .select("id,run_id,offsite_callback_hash").eq("id", artifactId).maybeSingle();
  if (error || !art?.offsite_callback_hash) return { ok: false, status: 404, error: "callback_not_found" };

  const actual = await sha256(enc.encode(token));
  if (actual !== art.offsite_callback_hash) return { ok: false, status: 403, error: "invalid_callback_token" };

  const success = body?.success === true;
  await admin.from("backup_artifacts").update({
    offsite_status: success ? "uploaded" : "failed",
    drive_file_id: success ? String(body?.drive_file_id || "") || null : null,
    drive_url: success ? String(body?.drive_url || "") || null : null,
    offsite_at: success ? new Date().toISOString() : null,
    offsite_callback_hash: null,
  }).eq("id", artifactId);
  await refreshRunExternal(art.run_id);
  return { ok: true, status: 200 };
}

async function sendWebhookTest() {
  const webhook = await internalConfig("make_webhook_url");
  if (!webhook) throw new Error("make_webhook_missing");
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      artifact_id: "00000000-0000-0000-0000-000000000001",
      run_id: "00000000-0000-0000-0000-000000000002",
      artifact_type: "database",
      source_name: "sample",
      file_name: "sample.json.gz",
      signed_url: "https://example.com/sample.json.gz",
      callback_url: `${SUPABASE_URL}/functions/v1/system-backup`,
      callback_token: "sample-token",
      sha256: "sample-sha",
      bytes: 123,
    }),
  });
  return { status: response.status, ok: response.ok };
}
function pad(n: number) { return String(n).padStart(8, "0"); }
function retentionClass(now: Date) {
  if (now.getUTCDate() === 1) return "monthly";
  if (now.getUTCDay() === 0) return "weekly";
  return "daily";
}
function retentionUntil(now: Date, cls: string, cfg: any) {
  const d = new Date(now);
  if (cls === "monthly") d.setUTCMonth(d.getUTCMonth() + Number(cfg.retention_monthly || 12));
  else if (cls === "weekly") d.setUTCDate(d.getUTCDate() + 7 * Number(cfg.retention_weekly || 4));
  else d.setUTCDate(d.getUTCDate() + Number(cfg.retention_daily || 7) + 1);
  return d.toISOString();
}
async function artifactOffsiteStatus() {
  const cfg = await settings();
  return cfg.external_enabled ? "pending" : "skipped";
}
async function uploadArtifact(input: {
  runId: string;
  artifactType: "database" | "auth" | "media" | "manifest";
  sourceName: string;
  chunkNo: number;
  path: string;
  bytes: Uint8Array;
  contentType: string;
  rowCount?: number;
  objectCount?: number;
}) {
  const hash = await sha256(input.bytes);
  const { error: uploadError } = await admin.storage.from(BACKUP_BUCKET)
    .upload(input.path, input.bytes, {
      contentType: input.contentType,
      upsert: true,
      cacheControl: "0",
    });
  if (uploadError) throw uploadError;

  const offsite = await artifactOffsiteStatus();
  const { data, error } = await admin.from("backup_artifacts").upsert({
    run_id: input.runId,
    artifact_type: input.artifactType,
    source_name: input.sourceName,
    chunk_no: input.chunkNo,
    storage_path: input.path,
    row_count: input.rowCount ?? null,
    object_count: input.objectCount ?? null,
    bytes: input.bytes.byteLength,
    sha256: hash,
    offsite_status: offsite,
    integrity_verified: false,
    integrity_verified_at: null,
    integrity_error: null,
  }, { onConflict: "storage_path" }).select().single();
  if (error) throw error;
  return data as any;
}
async function verifyPendingArtifacts(limit = 3) {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  const { data: pending, error } = await admin.from("backup_artifacts")
    .select("id,run_id,storage_path,sha256")
    .eq("integrity_verified", false)
    .is("integrity_error", null)
    .order("created_at")
    .limit(safeLimit);
  if (error) throw error;

  let verified = 0;
  let failed = 0;
  const touchedRuns = new Set<string>();

  for (const art of pending || []) {
    touchedRuns.add(String(art.run_id));
    try {
      const { data: blob, error: downloadError } = await admin.storage.from(BACKUP_BUCKET).download(art.storage_path);
      if (downloadError || !blob) throw downloadError || new Error("artifact_download_failed");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const actual = await sha256(bytes);
      if (actual !== art.sha256) {
        failed++;
        await admin.from("backup_artifacts").update({
          integrity_verified: false,
          integrity_error: `sha256_mismatch expected=${art.sha256} actual=${actual}`,
        }).eq("id", art.id);
        continue;
      }
      verified++;
      await admin.from("backup_artifacts").update({
        integrity_verified: true,
        integrity_verified_at: new Date().toISOString(),
        integrity_error: null,
      }).eq("id", art.id);
    } catch (e) {
      failed++;
      await admin.from("backup_artifacts").update({
        integrity_verified: false,
        integrity_error: e instanceof Error ? e.message : String(e),
      }).eq("id", art.id);
    }
  }

  const { data: completedRuns } = await admin.from("backup_runs")
    .select("id,status,verified_at")
    .eq("status", "completed")
    .is("verified_at", null)
    .order("finished_at")
    .limit(10);

  for (const run of completedRuns || []) {
    const { count: total } = await admin.from("backup_artifacts")
      .select("id", { count: "exact", head: true }).eq("run_id", run.id);
    const { count: unverified } = await admin.from("backup_artifacts")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .eq("integrity_verified", false);
    const { count: integrityErrors } = await admin.from("backup_artifacts")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .not("integrity_error", "is", null);

    if ((total || 0) > 0 && (unverified || 0) === 0 && (integrityErrors || 0) === 0) {
      const at = new Date().toISOString();
      await admin.from("backup_runs").update({ verified_at: at }).eq("id", run.id);
      await admin.from("backup_settings").update({ last_verified_at: at, updated_at: at }).eq("id", true);
    }
  }

  return { integrity_checked: (pending || []).length, integrity_verified: verified, integrity_failed: failed };
}

async function createRun(kind: "manual" | "automatic", requestedBy: string | null) {
  const cfg = await settings();
  if (!cfg.enabled) throw new Error("backup_disabled");

  const { data: active } = await admin.from("backup_runs")
    .select("id,status,created_at").in("status", ["queued", "running"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (active) return { already_running: true, run_id: active.id };

  const now = new Date();
  const cls = retentionClass(now);
  const { data: registry, error: regError } = await admin.from("backup_table_registry")
    .select("table_name,priority").eq("enabled", true).order("priority");
  if (regError) throw regError;

  const { data: run, error: runError } = await admin.from("backup_runs").insert({
    kind,
    status: "running",
    requested_by: requestedBy,
    started_at: now.toISOString(),
    retention_class: cls,
    retention_until: retentionUntil(now, cls, cfg),
    tables_total: registry?.length || 0,
    external_status: cfg.external_enabled ? "pending" : "disabled",
    last_progress_at: now.toISOString(),
  }).select().single();
  if (runError) throw runError;

  const tasks: any[] = (registry || []).map((r: any) => ({
    run_id: run.id,
    task_type: "database",
    source_name: r.table_name,
    offset_no: 0,
    batch_size: 1500,
    priority: Number(r.priority || 50),
  }));
  tasks.push({
    run_id: run.id, task_type: "auth", source_name: "auth.users",
    offset_no: 0, batch_size: 500, priority: 9,
  });
  for (const media of [
    { bucket: "products", size: 150, priority: 30 },
    { bucket: "banners", size: 50, priority: 30 },
    { bucket: "prescriptions", size: 3, priority: 25 },
    { bucket: "store-compliance", size: 20, priority: 25 },
  ]) {
    tasks.push({
      run_id: run.id, task_type: "media", source_name: media.bucket,
      offset_no: 0, batch_size: media.size, priority: media.priority,
    });
  }
  const { error: taskError } = await admin.from("backup_tasks").insert(tasks);
  if (taskError) {
    await admin.from("backup_runs").update({ status: "failed", error_message: taskError.message, finished_at: new Date().toISOString() }).eq("id", run.id);
    throw taskError;
  }
  return { already_running: false, run_id: run.id };
}
async function markTask(task: any, values: Record<string, unknown>) {
  const { error } = await admin.from("backup_tasks").update(values).eq("id", task.id);
  if (error) throw error;
}
async function enqueueNext(task: any) {
  const { error } = await admin.from("backup_tasks").upsert({
    run_id: task.run_id,
    task_type: task.task_type,
    source_name: task.source_name,
    offset_no: Number(task.offset_no) + Number(task.batch_size),
    batch_size: task.batch_size,
    priority: task.priority,
    status: "pending",
  }, { onConflict: "run_id,task_type,source_name,offset_no", ignoreDuplicates: true });
  if (error) throw error;
}
async function processDatabase(task: any) {
  const { data, error } = await admin.rpc("backup_export_table_chunk", {
    _table: task.source_name,
    _offset: Number(task.offset_no),
    _limit: Number(task.batch_size),
  });
  if (error) throw error;
  const payload = data as any;
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const count = Number(payload?.count || rows.length || 0);
  if (count > 0) {
    const raw = enc.encode(JSON.stringify({
      format: "atacadao-table-backup-v1",
      run_id: task.run_id,
      table: task.source_name,
      offset: Number(task.offset_no),
      row_count: count,
      exported_at: new Date().toISOString(),
      rows,
    }));
    const compressed = await gzip(raw);
    await uploadArtifact({
      runId: task.run_id,
      artifactType: "database",
      sourceName: task.source_name,
      chunkNo: Math.floor(Number(task.offset_no) / Number(task.batch_size)),
      path: `runs/${task.run_id}/database/${task.source_name}/${pad(Number(task.offset_no))}.json.gz`,
      bytes: compressed,
      contentType: "application/gzip",
      rowCount: count,
    });
  }
  if (count === Number(task.batch_size)) await enqueueNext(task);
}
async function processAuth(task: any) {
  const page = Math.floor(Number(task.offset_no) / Number(task.batch_size)) + 1;
  const perPage = Math.min(Number(task.batch_size), 1000);
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
  if (error) throw error;
  const users = (data?.users || []).map((u: any) => ({
    id: u.id,
    email: u.email || null,
    phone: u.phone || null,
    created_at: u.created_at,
    updated_at: u.updated_at,
    email_confirmed_at: u.email_confirmed_at || null,
    phone_confirmed_at: u.phone_confirmed_at || null,
    last_sign_in_at: u.last_sign_in_at || null,
    banned_until: u.banned_until || null,
    deleted_at: u.deleted_at || null,
    user_metadata: u.user_metadata || {},
    app_metadata: u.app_metadata || {},
  }));
  if (users.length > 0) {
    const raw = enc.encode(JSON.stringify({
      format: "atacadao-auth-backup-v1",
      run_id: task.run_id,
      password_hashes_included: false,
      note: "Credenciais não são exportadas; recuperação integral do Auth depende também do backup gerenciado do Supabase.",
      offset: Number(task.offset_no),
      user_count: users.length,
      exported_at: new Date().toISOString(),
      users,
    }));
    const compressed = await gzip(raw);
    await uploadArtifact({
      runId: task.run_id,
      artifactType: "auth",
      sourceName: "auth.users",
      chunkNo: page - 1,
      path: `runs/${task.run_id}/auth/users/${pad(Number(task.offset_no))}.json.gz`,
      bytes: compressed,
      contentType: "application/gzip",
      rowCount: users.length,
    });
  }
  if (users.length === perPage) await enqueueNext(task);
}
async function processMedia(task: any) {
  const { data, error } = await admin.rpc("backup_list_storage_objects", {
    _bucket: task.source_name,
    _offset: Number(task.offset_no),
    _limit: Number(task.batch_size),
  });
  if (error) throw error;
  const info = data as any;
  const objects = Array.isArray(info?.objects) ? info.objects : [];
  if (objects.length > 0) {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < objects.length; i += 10) {
      const group = objects.slice(i, i + 10);
      const downloaded = await Promise.all(group.map(async (obj: any) => {
        const { data: blob, error: dlError } = await admin.storage.from(task.source_name).download(obj.name);
        if (dlError || !blob) throw dlError || new Error(`missing_media:${obj.name}`);
        return { name: obj.name, bytes: new Uint8Array(await blob.arrayBuffer()) };
      }));
      for (const item of downloaded) files[item.name] = item.bytes;
    }
    const zipped = zipSync(files, { level: 0 });
    await uploadArtifact({
      runId: task.run_id,
      artifactType: "media",
      sourceName: task.source_name,
      chunkNo: Math.floor(Number(task.offset_no) / Number(task.batch_size)),
      path: `runs/${task.run_id}/media/${task.source_name}/${pad(Number(task.offset_no))}.zip`,
      bytes: zipped,
      contentType: "application/zip",
      objectCount: objects.length,
    });
  }
  if (objects.length === Number(task.batch_size)) await enqueueNext(task);
}
async function taskFailure(task: any, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (Number(task.attempts || 0) < 3) {
    await markTask(task, { status: "pending", error_message: message, started_at: null });
  } else {
    await markTask(task, { status: "failed", error_message: message, completed_at: new Date().toISOString() });
  }
}
async function createManifest(run: any, finalStatus: string) {
  const { data: artifacts } = await admin.from("backup_artifacts")
    .select("id,artifact_type,source_name,chunk_no,storage_path,row_count,object_count,bytes,sha256,offsite_status,created_at")
    .eq("run_id", run.id).order("created_at");
  const { data: tasks } = await admin.from("backup_tasks")
    .select("task_type,source_name,offset_no,batch_size,status,attempts,error_message")
    .eq("run_id", run.id).order("id");
  const manifest = {
    format: "atacadao-backup-manifest-v1",
    project_ref: "jzltdocmvvdlyaukwzix",
    run_id: run.id,
    kind: run.kind,
    status: finalStatus,
    started_at: run.started_at,
    finished_at: new Date().toISOString(),
    retention_class: run.retention_class,
    retention_until: run.retention_until,
    auth_note: "O snapshot complementar de auth não contém hashes de senha. O backup gerenciado do Supabase continua necessário para restauração integral de Auth.",
    artifacts: artifacts || [],
    tasks: tasks || [],
  };
  const bytes = enc.encode(JSON.stringify(manifest, null, 2));
  return await uploadArtifact({
    runId: run.id,
    artifactType: "manifest",
    sourceName: "manifest",
    chunkNo: 0,
    path: `runs/${run.id}/manifest.json`,
    bytes,
    contentType: "application/json",
  });
}
async function refreshRunExternal(runId: string) {
  const { data: rows } = await admin.from("backup_artifacts").select("offsite_status").eq("run_id", runId);
  if (!rows?.length) return;
  const statuses = rows.map((x: any) => x.offsite_status);
  let status = "pending";
  if (statuses.every((x: string) => x === "uploaded" || x === "skipped")) status = statuses.some((x: string) => x === "uploaded") ? "completed" : "disabled";
  else if (statuses.some((x: string) => x === "failed") && !statuses.some((x: string) => x === "pending" || x === "uploading")) status = "partial";
  else if (statuses.some((x: string) => x === "uploading")) status = "syncing";
  await admin.from("backup_runs").update({ external_status: status }).eq("id", runId);
}
async function finalizeRuns() {
  const { data: runs } = await admin.from("backup_runs").select("*").eq("status", "running").order("created_at");
  for (const run of runs || []) {
    const { data: tasks } = await admin.from("backup_tasks").select("status,task_type").eq("run_id", run.id);
    const all = tasks || [];
    if (all.some((t: any) => t.status === "pending" || t.status === "running")) continue;
    const failed = all.filter((t: any) => t.status === "failed").length;
    const finalStatus = failed > 0 ? "partial" : "completed";
    let manifest: any = null;
    try { manifest = await createManifest(run, finalStatus); } catch (e) {
      console.error("manifest creation failed", e instanceof Error ? e.message : String(e));
    }
    const { data: arts } = await admin.from("backup_artifacts")
      .select("artifact_type,bytes").eq("run_id", run.id);
    const bytes = (arts || []).reduce((sum: number, a: any) => sum + Number(a.bytes || 0), 0);
    const dbArtifacts = (arts || []).filter((a: any) => a.artifact_type === "database" || a.artifact_type === "auth").length;
    const mediaArtifacts = (arts || []).filter((a: any) => a.artifact_type === "media").length;
    const dbDone = new Set(all.filter((t: any) => t.task_type === "database" && t.status === "completed").map((t: any) => t.source_name)).size;
    const finished = new Date().toISOString();
    await admin.from("backup_runs").update({
      status: finalStatus,
      finished_at: finished,
      tables_done: dbDone,
      db_artifacts: dbArtifacts,
      media_artifacts: mediaArtifacts,
      total_bytes: bytes,
      manifest_path: manifest?.storage_path || null,
      verified_at: null,
      last_progress_at: finished,
      error_message: failed ? `${failed} tarefa(s) falharam após 3 tentativas` : null,
    }).eq("id", run.id);
    if (failed === 0 && manifest) {
      await admin.from("backup_settings").update({
        last_success_at: finished,
        updated_at: finished,
      }).eq("id", true);
    }
    await refreshRunExternal(run.id);
  }
}
async function work() {
  const { data: tasks, error } = await admin.rpc("backup_claim_tasks", { _limit: 3 });
  if (error) throw error;
  const list = tasks || [];
  for (const task of list as any[]) {
    try {
      if (task.task_type === "database") await processDatabase(task);
      else if (task.task_type === "auth") await processAuth(task);
      else if (task.task_type === "media") await processMedia(task);
      await markTask(task, { status: "completed", completed_at: new Date().toISOString(), error_message: null });
      await admin.from("backup_runs").update({ last_progress_at: new Date().toISOString() }).eq("id", task.run_id);
    } catch (e) {
      console.error("backup task failed", { task_id: task.id, source: task.source_name, error: e instanceof Error ? e.message : String(e) });
      await taskFailure(task, e);
    }
  }
  await finalizeRuns();
  const integrity = await verifyPendingArtifacts(2);
  const offsite = await dispatchPendingOffsite(5);
  return { processed: list.length, ...integrity, ...offsite };
}
async function cleanup() {
  const now = new Date().toISOString();
  await admin.from("backup_artifacts").update({ offsite_status: "pending" })
    .eq("offsite_status", "uploading").lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  const { data: expired } = await admin.from("backup_runs")
    .select("id").lt("retention_until", now).in("status", ["completed", "partial", "failed"]).limit(20);
  let deletedRuns = 0;
  for (const run of expired || []) {
    const { data: arts } = await admin.from("backup_artifacts").select("storage_path").eq("run_id", run.id);
    const paths = (arts || []).map((a: any) => a.storage_path).filter(Boolean);
    for (let i = 0; i < paths.length; i += 100) {
      if (paths.slice(i, i + 100).length) await admin.storage.from(BACKUP_BUCKET).remove(paths.slice(i, i + 100));
    }
    await admin.from("backup_runs").delete().eq("id", run.id);
    deletedRuns++;
  }
  return { deleted_runs: deletedRuns };
}
async function nextOffsite(limit = 25) {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const { data: rows, error } = await admin.from("backup_artifacts")
    .select("id,run_id,artifact_type,source_name,storage_path,bytes,sha256,created_at")
    .eq("offsite_status", "pending").order("created_at").limit(safeLimit);
  if (error) throw error;
  const result: any[] = [];
  for (const art of rows || []) {
    const { data, error: signError } = await admin.storage.from(BACKUP_BUCKET).createSignedUrl(art.storage_path, 3600);
    if (signError || !data?.signedUrl) continue;
    result.push({
      id: art.id,
      run_id: art.run_id,
      artifact_type: art.artifact_type,
      source_name: art.source_name,
      file_name: art.storage_path.split("/").pop(),
      storage_path: art.storage_path,
      bytes: art.bytes,
      sha256: art.sha256,
      signed_url: data.signedUrl,
    });
  }
  if (result.length) {
    await admin.from("backup_artifacts").update({ offsite_status: "uploading" }).in("id", result.map((x) => x.id));
    for (const runId of [...new Set(result.map((x) => x.run_id))]) await refreshRunExternal(runId);
  }
  return result;
}
async function markOffsite(body: any) {
  const id = String(body?.artifact_id || "");
  const success = body?.success === true;
  const { data: art } = await admin.from("backup_artifacts").select("id,run_id").eq("id", id).maybeSingle();
  if (!art) throw new Error("artifact_not_found");
  await admin.from("backup_artifacts").update({
    offsite_status: success ? "uploaded" : "failed",
    drive_file_id: success ? String(body?.drive_file_id || "") || null : null,
    drive_url: success ? String(body?.drive_url || "") || null : null,
    offsite_at: success ? new Date().toISOString() : null,
  }).eq("id", id);
  await refreshRunExternal(art.run_id);
  return { ok: true };
}
async function artifactUrl(artifactId: string) {
  const { data: art, error } = await admin.from("backup_artifacts").select("id,storage_path").eq("id", artifactId).single();
  if (error) throw error;
  const { data, error: signError } = await admin.storage.from(BACKUP_BUCKET).createSignedUrl(art.storage_path, 900);
  if (signError) throw signError;
  return { url: data.signedUrl };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "offsite-callback") {
      const result = await handleOffsiteCallback(body);
      return json(req, result.ok ? { ok: true } : { error: result.error }, result.status);
    }

    const auth = await authorize(req);
    if (!auth) return json(req, { error: "unauthorized" }, 401);

    if (action === "start-manual") {
      if (auth.type !== "admin") return json(req, { error: "forbidden" }, 403);
      return json(req, { ok: true, ...(await createRun("manual", auth.user!.id)) });
    }
    if (action === "start-automatic") {
      if (auth.type !== "internal") return json(req, { error: "forbidden" }, 403);
      return json(req, { ok: true, ...(await createRun("automatic", null)) });
    }
    if (action === "worker") {
      return json(req, { ok: true, ...(await work()) });
    }
    if (action === "cleanup") {
      return json(req, { ok: true, ...(await cleanup()) });
    }
    if (action === "dispatch-test") {
      if (auth.type !== "internal") return json(req, { error: "forbidden" }, 403);
      return json(req, { ok: true, ...(await sendWebhookTest()) });
    }
    if (action === "dispatch-offsite") {
      if (auth.type !== "internal") return json(req, { error: "forbidden" }, 403);
      return json(req, { ok: true, ...(await dispatchPendingOffsite(Number(body?.limit || 5))) });
    }
    if (action === "next-offsite") {
      if (auth.type !== "internal") return json(req, { error: "forbidden" }, 403);
      return json(req, { ok: true, artifacts: await nextOffsite(Number(body?.limit || 25)) });
    }
    if (action === "mark-offsite") {
      if (auth.type !== "internal") return json(req, { error: "forbidden" }, 403);
      return json(req, await markOffsite(body));
    }
    if (action === "artifact-url") {
      if (auth.type !== "admin") return json(req, { error: "forbidden" }, 403);
      return json(req, { ok: true, ...(await artifactUrl(String(body?.artifact_id || ""))) });
    }
    return json(req, { error: "invalid_action" }, 400);
  } catch (e) {
    console.error("system-backup error", e instanceof Error ? e.message : String(e));
    return json(req, { error: e instanceof Error ? e.message : "backup_error" }, 500);
  }
});
