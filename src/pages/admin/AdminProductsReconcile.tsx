import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, ArrowLeft, Loader2, RefreshCw, Wand2, CheckCircle2, Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Issue =
  | "no_trier_id"
  | "no_barcode"
  | "no_stock_quantity"
  | "no_trier_stock_quantity"
  | "zero_stock"
  | "no_laboratory"
  | "no_group"
  | "no_category_name"
  | "never_synced";

const ISSUE_LABEL: Record<Issue, string> = {
  no_trier_id: "Sem código Trier",
  no_barcode: "Sem código de barras",
  no_stock_quantity: "Sem stock_quantity",
  no_trier_stock_quantity: "Sem trier_stock_quantity",
  zero_stock: "Estoque zerado/nulo",
  no_laboratory: "Sem laboratório",
  no_group: "Sem grupo (group_code/name)",
  no_category_name: "Sem nome de categoria",
  never_synced: "Nunca sincronizado",
};

type Counts = Record<Issue, number> & { total: number };

const isNumericSku = (s: string | null | undefined) =>
  !!s && /^\d{3,12}$/.test(String(s).trim());

export default function AdminProductsReconcile() {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [issue, setIssue] = useState<Issue>("no_trier_id");
  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  // SKU → trier_product_id
  const [skuPreview, setSkuPreview] = useState<any[] | null>(null);
  const [skuLoading, setSkuLoading] = useState(false);
  const [skuApplying, setSkuApplying] = useState(false);

  // Completar dados pela Trier
  const [completing, setCompleting] = useState(false);

  useEffect(() => { refreshCounts(); }, []);
  useEffect(() => { loadIssueRows(issue); }, [issue]);

  async function completeFromTrier() {
    if (!confirm("Vamos sincronizar pela Trier no modo SEGURO (safe_operational): atualiza estoque, preço, código de barras e dados técnicos. Não toca em imagem, descrição, SEO ou categoria comercial. Continuar?")) return;
    setCompleting(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("trier", {
        body: { action: "sync-products", mode: "safe_operational", trigger: "reconcile" },
      });
      if (error) throw error;
      toast.success(data?.message || "Sincronização iniciada em background. Acompanhe em Admin → Trier → Logs.");
    } catch (e: any) {
      toast.error("Falha ao iniciar: " + (e?.message || e));
    } finally {
      setCompleting(false);
    }
  }

  async function refreshCounts() {
    setLoading(true);
    try {
      const c = async (q: any) => {
        const { count } = await q;
        return count || 0;
      };
      const base = () => (supabase as any).from("products").select("id", { count: "exact", head: true });
      const [
        total,
        noTrier, noBarcode, noStockQ, noTrierStockQ, zeroStock,
        noLab, noGroupCode, noGroupName, noCatName, neverSynced,
      ] = await Promise.all([
        c(base()),
        c(base().or("trier_product_id.is.null,trier_product_id.eq.")),
        c(base().or("barcode.is.null,barcode.eq.")),
        c(base().is("stock_quantity", null)),
        c(base().is("trier_stock_quantity", null)),
        c(base().or("stock_quantity.is.null,stock_quantity.eq.0")),
        c(base().or("laboratory.is.null,laboratory.eq.")),
        c(base().or("group_code.is.null,group_code.eq.")),
        c(base().or("group_name.is.null,group_name.eq.")),
        c(base().or("category_name.is.null,category_name.eq.")),
        c(base().is("last_trier_sync_at", null)),
      ]);
      setCounts({
        total,
        no_trier_id: noTrier,
        no_barcode: noBarcode,
        no_stock_quantity: noStockQ,
        no_trier_stock_quantity: noTrierStockQ,
        zero_stock: zeroStock,
        no_laboratory: noLab,
        no_group: Math.max(noGroupCode, noGroupName),
        no_category_name: noCatName,
        never_synced: neverSynced,
      });
    } catch (e: any) {
      toast.error("Erro ao contar: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyIssueFilter(q: any, key: Issue) {
    switch (key) {
      case "no_trier_id": return q.or("trier_product_id.is.null,trier_product_id.eq.");
      case "no_barcode": return q.or("barcode.is.null,barcode.eq.");
      case "no_stock_quantity": return q.is("stock_quantity", null);
      case "no_trier_stock_quantity": return q.is("trier_stock_quantity", null);
      case "zero_stock": return q.or("stock_quantity.is.null,stock_quantity.eq.0");
      case "no_laboratory": return q.or("laboratory.is.null,laboratory.eq.");
      case "no_group": return q.or("group_code.is.null,group_code.eq.");
      case "no_category_name": return q.or("category_name.is.null,category_name.eq.");
      case "never_synced": return q.is("last_trier_sync_at", null);
    }
  }

  async function loadIssueRows(key: Issue) {
    setLoadingRows(true);
    try {
      let q = (supabase as any)
        .from("products")
        .select("id,name,sku,trier_product_id,barcode,stock_quantity,trier_stock_quantity,laboratory,group_code,group_name,category_name,source,manual_disabled,active,last_trier_sync_at")
        .order("created_at", { ascending: false })
        .limit(200);
      q = applyIssueFilter(q, key);
      const { data, error } = await q;
      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      toast.error("Erro ao listar: " + e.message);
    } finally {
      setLoadingRows(false);
    }
  }

  // ---------- SKU → trier_product_id ----------
  async function previewSkuMigration() {
    setSkuLoading(true);
    setSkuPreview(null);
    try {
      // 1) candidatos: trier_product_id vazio, sku preenchido
      const { data: candidates, error } = await (supabase as any)
        .from("products")
        .select("id,name,sku,trier_product_id,source,barcode")
        .or("trier_product_id.is.null,trier_product_id.eq.")
        .not("sku", "is", null)
        .neq("sku", "")
        .limit(2000);
      if (error) throw error;

      const numerics = (candidates || []).filter((p: any) => isNumericSku(p.sku));
      if (!numerics.length) {
        setSkuPreview([]);
        toast.info("Nenhum produto candidato encontrado.");
        return;
      }

      // 2) checar conflitos: já existe outro produto com esse trier_product_id?
      const skus = Array.from(new Set(numerics.map((p: any) => String(p.sku).trim())));
      const conflicts = new Set<string>();
      for (let i = 0; i < skus.length; i += 200) {
        const chunk = skus.slice(i, i + 200);
        const { data: existing } = await (supabase as any)
          .from("products").select("trier_product_id").in("trier_product_id", chunk);
        (existing || []).forEach((r: any) => r.trier_product_id && conflicts.add(String(r.trier_product_id)));
      }

      const preview = numerics.map((p: any) => ({
        ...p,
        new_trier_id: String(p.sku).trim(),
        conflict: conflicts.has(String(p.sku).trim()),
      }));
      setSkuPreview(preview);
      const applicable = preview.filter((p: any) => !p.conflict).length;
      toast.success(`Prévia: ${applicable} aplicáveis · ${preview.length - applicable} com conflito`);
    } catch (e: any) {
      toast.error("Erro na prévia: " + e.message);
    } finally {
      setSkuLoading(false);
    }
  }

  const applicableSku = useMemo(
    () => (skuPreview || []).filter((p: any) => !p.conflict),
    [skuPreview]
  );

  async function applySkuMigration() {
    if (!applicableSku.length) return;
    if (!confirm(`Aplicar trier_product_id em ${applicableSku.length} produtos? Esta ação não toca em outros campos.`)) return;
    setSkuApplying(true);
    try {
      let ok = 0, err = 0;
      for (const p of applicableSku) {
        const { error } = await (supabase as any)
          .from("products")
          .update({ trier_product_id: p.new_trier_id })
          .eq("id", p.id);
        if (error) err++; else ok++;
      }
      toast.success(`Concluído: ${ok} atualizados, ${err} com erro`);
      setSkuPreview(null);
      refreshCounts();
      loadIssueRows(issue);
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setSkuApplying(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/admin/produtos" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar para Produtos
          </Link>
          <h1 className="text-2xl font-bold mt-2">Reconciliar produtos</h1>
          <p className="text-sm text-muted-foreground">
            Aproveite os produtos já cadastrados e corrija dados faltantes. Nada aqui exclui produtos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshCounts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar contagens
          </Button>
          <Button size="sm" onClick={completeFromTrier} disabled={completing}>
            {completing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
            Completar dados pela Trier
          </Button>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Modo seguro</AlertTitle>
        <AlertDescription>
          Esta tela <b>não cria nem exclui</b> produtos. Ela só corrige campos faltantes em produtos já cadastrados,
          com prévia obrigatória antes de aplicar.
        </AlertDescription>
      </Alert>

      {/* Contagens */}
      <Card>
        <CardHeader><CardTitle className="text-base">Problemas detectados</CardTitle></CardHeader>
        <CardContent>
          {loading || !counts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Contando...
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Total de produtos" value={counts.total} tone="muted" />
              {(Object.keys(ISSUE_LABEL) as Issue[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setIssue(k)}
                  className={`text-left border rounded-md p-3 hover:border-primary transition ${issue === k ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="text-xs text-muted-foreground">{ISSUE_LABEL[k]}</div>
                  <div className="text-xl font-bold">{counts[k]}</div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Listagem do problema selecionado */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">
            Produtos com: <span className="text-primary">{ISSUE_LABEL[issue]}</span>
          </CardTitle>
          <Select value={issue} onValueChange={(v) => setIssue(v as Issue)}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ISSUE_LABEL) as Issue[]).map((k) => (
                <SelectItem key={k} value={k}>{ISSUE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-auto max-h-[420px]">
          {loadingRows ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Nenhum produto neste estado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Cód. Trier</TableHead>
                  <TableHead>EAN</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[260px] truncate" title={r.name}>{r.name}</TableCell>
                    <TableCell className="text-xs">{r.sku || "—"}</TableCell>
                    <TableCell className="text-xs">{r.trier_product_id || "—"}</TableCell>
                    <TableCell className="text-xs">{r.barcode || "—"}</TableCell>
                    <TableCell className="text-xs">{r.stock_quantity ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.source || "—"}</TableCell>
                    <TableCell className="text-xs">{r.last_trier_sync_at ? new Date(r.last_trier_sync_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rows.length === 200 && (
            <div className="text-xs text-muted-foreground mt-2">Mostrando os 200 mais recentes.</div>
          )}
        </CardContent>
      </Card>

      {/* SKU → trier_product_id */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usar SKU como código Trier (quando trier_product_id estiver vazio)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Aplica somente se: <b>trier_product_id vazio</b> + <b>SKU preenchido</b> + <b>SKU numérico (3–12 dígitos)</b> +
            <b> nenhum outro produto</b> já usar esse código Trier. Sempre com prévia.
          </p>
          <div className="flex gap-2">
            <Button onClick={previewSkuMigration} disabled={skuLoading}>
              {skuLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Gerar prévia
            </Button>
            {skuPreview && skuPreview.length > 0 && (
              <Button onClick={applySkuMigration} disabled={skuApplying || applicableSku.length === 0} variant="default">
                {skuApplying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Aplicar em {applicableSku.length} produtos
              </Button>
            )}
          </div>

          {skuPreview && skuPreview.length > 0 && (
            <div className="border rounded-md overflow-auto max-h-[360px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>SKU atual</TableHead>
                    <TableHead>→ trier_product_id</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuPreview.slice(0, 500).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[260px] truncate" title={p.name}>{p.name}</TableCell>
                      <TableCell className="text-xs">{p.sku}</TableCell>
                      <TableCell className="text-xs font-semibold">{p.new_trier_id}</TableCell>
                      <TableCell className="text-xs">{p.barcode || "—"}</TableCell>
                      <TableCell className="text-xs">{p.source || "—"}</TableCell>
                      <TableCell>
                        {p.conflict ? (
                          <Badge variant="destructive">Conflito</Badge>
                        ) : (
                          <Badge variant="secondary">Aplicar</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {skuPreview.length > 500 && (
                <div className="text-xs text-muted-foreground p-2">Mostrando 500 de {skuPreview.length}.</div>
              )}
            </div>
          )}
          {skuPreview && skuPreview.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhum candidato encontrado.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "muted" }) {
  return (
    <div className={`border rounded-md p-3 ${tone === "muted" ? "bg-muted/40" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
