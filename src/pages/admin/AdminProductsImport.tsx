import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { XMLParser } from "fast-xml-parser";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ArrowLeft, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type FieldKey =
  | "trier_product_id" | "sku" | "barcode" | "name" | "description"
  | "manufacturer" | "category_name" | "group_name"
  | "price" | "promo_price" | "cost_price"
  | "stock" | "unit" | "active" | "requires_prescription" | "controlled"
  | "image_url" | "ignore";

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "ignore", label: "— Ignorar —" },
  { key: "trier_product_id", label: "Código Trier" },
  { key: "sku", label: "Código interno (SKU)" },
  { key: "barcode", label: "Código de barras / EAN" },
  { key: "name", label: "Nome do produto" },
  { key: "description", label: "Descrição" },
  { key: "manufacturer", label: "Laboratório / Fabricante" },
  { key: "category_name", label: "Categoria" },
  { key: "group_name", label: "Grupo" },
  { key: "price", label: "Preço de venda" },
  { key: "promo_price", label: "Preço promocional" },
  { key: "cost_price", label: "Preço de custo" },
  { key: "stock", label: "Estoque" },
  { key: "unit", label: "Unidade" },
  { key: "active", label: "Ativo" },
  { key: "requires_prescription", label: "Exige receita" },
  { key: "controlled", label: "Controlado" },
  { key: "image_url", label: "URL da imagem" },
];

const AUTO_MAP: Record<string, FieldKey> = {
  codigotrier: "trier_product_id", trier: "trier_product_id", codtrier: "trier_product_id",
  sku: "sku", codigointerno: "sku", codigo: "sku", cod: "sku",
  ean: "barcode", barcode: "barcode", codigobarras: "barcode", codigodebarras: "barcode", gtin: "barcode",
  nome: "name", produto: "name", descricaoproduto: "name", name: "name",
  descricao: "description", description: "description", detalhes: "description",
  laboratorio: "manufacturer", fabricante: "manufacturer", marca: "manufacturer", manufacturer: "manufacturer",
  categoria: "category_name", category: "category_name",
  grupo: "group_name", group: "group_name",
  preco: "price", precovenda: "price", price: "price", valor: "price",
  precopromocional: "promo_price", promocional: "promo_price", precopromo: "promo_price", promo: "promo_price",
  precocusto: "cost_price", custo: "cost_price", cost: "cost_price",
  estoque: "stock", stock: "stock", qtd: "stock", quantidade: "stock",
  unidade: "unit", unit: "unit", un: "unit",
  ativo: "active", active: "active", status: "active",
  exigereceita: "requires_prescription", receita: "requires_prescription", prescription: "requires_prescription",
  controlado: "controlled", controlled: "controlled",
  imagem: "image_url", imagemurl: "image_url", image: "image_url", imageurl: "image_url", foto: "image_url",
};

const normalizeKey = (s: string) =>
  s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const parseNumber = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/[^\d,.\-]/g, "");
  if (!s) return null;
  // assume BR format if there's both . and , -> . thousand sep
  const cleaned = s.includes(",") && s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const parseBool = (v: any): boolean | null => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).toLowerCase().trim();
  if (["1", "true", "sim", "s", "yes", "y", "ativo", "ativa"].includes(s)) return true;
  if (["0", "false", "nao", "não", "n", "no", "inativo", "inativa"].includes(s)) return false;
  return null;
};

type Row = Record<string, any>;

type Normalized = {
  trier_product_id?: string;
  sku?: string;
  barcode?: string;
  name?: string;
  description?: string;
  manufacturer?: string;
  category_name?: string;
  group_name?: string;
  price?: number | null;
  promo_price?: number | null;
  cost_price?: number | null;
  stock?: number | null;
  unit?: string;
  active?: boolean | null;
  requires_prescription?: boolean | null;
  controlled?: boolean | null;
  image_url?: string;
};

type Analyzed = {
  row_number: number;
  raw: Row;
  norm: Normalized;
  status: "new" | "existing" | "duplicate" | "divergent" | "error" | "review";
  action: "create" | "update" | "skip" | "review";
  match_type?: "trier_product_id" | "barcode" | "sku" | "name_manuf" | null;
  matched?: any;
  error?: string;
  reasons: string[];
};

const STATUS_LABEL: Record<Analyzed["status"], string> = {
  new: "Novo", existing: "Existente", duplicate: "Possível duplicado",
  divergent: "Divergente", error: "Erro", review: "Revisão manual",
};

const STATUS_COLOR: Record<Analyzed["status"], string> = {
  new: "bg-green-500/15 text-green-700 dark:text-green-400",
  existing: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  duplicate: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  divergent: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  error: "bg-red-500/15 text-red-700 dark:text-red-400",
  review: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

const MAPPING_STORAGE_KEY = "admin_import_column_mapping_v1";

export default function AdminProductsImport() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"csv" | "xlsx" | "xml" | "pdf" | "">("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState<Analyzed[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [opts, setOpts] = useState({
    importNew: true,
    updateExisting: true,
    skipDuplicates: true,
    inactivateIfNoStock: true,
    dontTouchExisting: false,
    updatePrice: true,
    updateStock: true,
    updateCategory: false,
    updateImage: false,
  });

  useEffect(() => { loadHistory(); }, []);
  async function loadHistory() {
    const { data } = await supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(30);
    setHistory(data || []);
  }

  function reset() {
    setFile(null); setFileType(""); setHeaders([]); setRows([]); setMapping({}); setAnalyzed(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickFile(f: File) {
    reset();
    setFile(f);
    const ext = f.name.toLowerCase().split(".").pop() || "";
    const type: any = ["csv", "xlsx", "xml", "pdf"].includes(ext) ? ext : (ext === "xls" ? "xlsx" : "");
    if (!type) { toast.error("Formato não suportado. Use CSV, XLSX ou XML."); return; }
    if (f.size > 15 * 1024 * 1024) { toast.error("Arquivo maior que 15 MB."); return; }
    setFileType(type);

    try {
      if (type === "csv") {
        const text = await f.text();
        const r = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
        loadRows((r.meta.fields || []).map(String), r.data as Row[]);
      } else if (type === "xlsx") {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
        const hs = data[0] ? Object.keys(data[0]).map(String) : [];
        loadRows(hs, data);
      } else if (type === "xml") {
        const text = await f.text();
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        const obj = parser.parse(text);
        const list = findArray(obj);
        if (!list.length) { toast.error("Não consegui localizar uma lista de produtos no XML."); return; }
        const hs = Array.from(new Set(list.flatMap((r) => Object.keys(r))));
        loadRows(hs, list);
      } else if (type === "pdf") {
        toast.warning("Importação por PDF é experimental. Esta versão não cadastra direto — apenas mostra a prévia.");
      }
    } catch (e: any) {
      toast.error("Erro ao ler arquivo: " + e.message);
    }
  }

  function findArray(obj: any): Row[] {
    if (Array.isArray(obj)) return obj.filter((x) => typeof x === "object");
    if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
        if (typeof v === "object") {
          const r = findArray(v); if (r.length) return r;
        }
      }
    }
    return [];
  }

  function loadRows(hs: string[], data: Row[]) {
    setHeaders(hs);
    setRows(data);
    // auto map
    const saved = (() => { try { return JSON.parse(localStorage.getItem(MAPPING_STORAGE_KEY) || "{}"); } catch { return {}; } })();
    const m: Record<string, FieldKey> = {};
    for (const h of hs) {
      if (saved[h]) { m[h] = saved[h]; continue; }
      const nk = normalizeKey(h);
      m[h] = AUTO_MAP[nk] || "ignore";
    }
    setMapping(m);
  }

  function normalizeRow(raw: Row): Normalized {
    const n: Normalized = {};
    for (const h of headers) {
      const f = mapping[h];
      if (!f || f === "ignore") continue;
      const v = raw[h];
      if (v === undefined || v === null || v === "") continue;
      switch (f) {
        case "price": case "promo_price": case "cost_price":
          (n as any)[f] = parseNumber(v); break;
        case "stock":
          n.stock = parseNumber(v); break;
        case "active": case "requires_prescription": case "controlled":
          (n as any)[f] = parseBool(v); break;
        default:
          (n as any)[f] = String(v).trim();
      }
    }
    return n;
  }

  async function analyze() {
    if (!rows.length) { toast.error("Nenhuma linha para analisar."); return; }
    const mappedFields = new Set(Object.values(mapping));
    if (!mappedFields.has("name") && !mappedFields.has("trier_product_id") && !mappedFields.has("barcode") && !mappedFields.has("sku")) {
      toast.error("Mapeie pelo menos: nome OU código (Trier/EAN/SKU)."); return;
    }

    setAnalyzing(true);
    try {
      const normRows = rows.map((r) => normalizeRow(r));

      // Collect lookup keys
      const trierIds = unique(normRows.map((n) => n.trier_product_id).filter(Boolean) as string[]);
      const barcodes = unique(normRows.map((n) => n.barcode).filter(Boolean) as string[]);
      const skus = unique(normRows.map((n) => n.sku).filter(Boolean) as string[]);

      const matches: Record<string, any> = {};
      async function fetchIn(col: string, vals: string[]) {
        for (let i = 0; i < vals.length; i += 200) {
          const chunk = vals.slice(i, i + 200);
          const { data } = await supabase.from("products").select("id,name,trier_product_id,barcode,sku,price,promo_price,stock,active,manufacturer,category_id,image_url").in(col, chunk);
          (data || []).forEach((p) => { matches[`${col}:${(p as any)[col]}`] = p; });
        }
      }
      if (trierIds.length) await fetchIn("trier_product_id", trierIds);
      if (barcodes.length) await fetchIn("barcode", barcodes);
      if (skus.length) await fetchIn("sku", skus);

      const result: Analyzed[] = normRows.map((n, i) => {
        const reasons: string[] = [];
        const a: Analyzed = { row_number: i + 2, raw: rows[i], norm: n, status: "new", action: "create", reasons, match_type: null };

        if (!n.name && !n.trier_product_id && !n.barcode && !n.sku) {
          a.status = "error"; a.action = "skip"; a.error = "Linha sem identificadores"; reasons.push("Sem nome e sem códigos");
          return a;
        }
        if (!n.name && (n.barcode || n.sku || n.trier_product_id)) {
          a.status = "review"; a.action = "review"; reasons.push("Sem nome — exige revisão manual");
        }

        // Match in order
        let matched =
          (n.trier_product_id && matches[`trier_product_id:${n.trier_product_id}`]) ||
          (n.barcode && matches[`barcode:${n.barcode}`]) ||
          (n.sku && matches[`sku:${n.sku}`]);

        const matchKey = n.trier_product_id && matches[`trier_product_id:${n.trier_product_id}`]
          ? "trier_product_id" : n.barcode && matches[`barcode:${n.barcode}`]
          ? "barcode" : n.sku && matches[`sku:${n.sku}`] ? "sku" : null;

        if (matched) {
          a.matched = matched;
          a.match_type = matchKey as any;
          a.status = "existing";
          a.action = opts.dontTouchExisting ? "skip" : (opts.updateExisting ? "update" : "skip");
          reasons.push(`Encontrado por ${matchKey}`);
          // divergence
          if (n.name && matched.name && normalizeKey(n.name).slice(0, 20) !== normalizeKey(matched.name).slice(0, 20)) {
            a.status = "divergent"; reasons.push("Nome diferente do cadastro");
          }
        } else {
          a.status = a.status === "review" ? "review" : "new";
          a.action = a.status === "review" ? "review" : (opts.importNew ? "create" : "skip");
          reasons.push("Não encontrado no banco");
        }

        // Stock / price flags
        if (n.stock != null && n.stock <= 0) reasons.push("Sem estoque");
        if (n.price == null && a.status === "new") reasons.push("Sem preço");
        if (!n.barcode) reasons.push("Sem código de barras");

        return a;
      });

      // Detect possible duplicates inside the file (same barcode / trier / sku / name+manuf)
      const seen: Record<string, number> = {};
      result.forEach((r, idx) => {
        const keys = [
          r.norm.trier_product_id && `t:${r.norm.trier_product_id}`,
          r.norm.barcode && `b:${r.norm.barcode}`,
          r.norm.sku && `s:${r.norm.sku}`,
          r.norm.name && r.norm.manufacturer && `nm:${normalizeKey(r.norm.name)}_${normalizeKey(r.norm.manufacturer)}`,
        ].filter(Boolean) as string[];
        for (const k of keys) {
          if (seen[k] !== undefined && seen[k] !== idx) {
            r.status = "duplicate";
            r.action = opts.skipDuplicates ? "skip" : r.action;
            r.reasons.push("Duplicado dentro do arquivo");
            break;
          }
          seen[k] = idx;
        }
      });

      setAnalyzed(result);
      toast.success(`Análise concluída: ${result.length} linhas`);
    } catch (e: any) {
      toast.error("Falha na análise: " + e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const summary = useMemo(() => {
    if (!analyzed) return null;
    const s = { total: analyzed.length, novos: 0, existentes: 0, duplicados: 0, erros: 0, revisao: 0, divergentes: 0, semEstoque: 0, semPreco: 0, semBarcode: 0 };
    analyzed.forEach((r) => {
      if (r.status === "new") s.novos++;
      if (r.status === "existing") s.existentes++;
      if (r.status === "duplicate") s.duplicados++;
      if (r.status === "error") s.erros++;
      if (r.status === "review") s.revisao++;
      if (r.status === "divergent") s.divergentes++;
      if (r.norm.stock != null && r.norm.stock <= 0) s.semEstoque++;
      if (r.norm.price == null) s.semPreco++;
      if (!r.norm.barcode) s.semBarcode++;
    });
    return s;
  }, [analyzed]);

  const filteredAnalyzed = useMemo(() => {
    if (!analyzed) return [];
    if (statusFilter === "all") return analyzed;
    return analyzed.filter((r) => r.status === statusFilter);
  }, [analyzed, statusFilter]);

  async function confirmImport() {
    if (!analyzed || !user) return;
    if (fileType === "pdf") { toast.error("Importação por PDF não cadastra direto — modo experimental apenas."); return; }
    if (!confirm("Confirmar importação? Esta ação irá criar/atualizar produtos no banco.")) return;

    setConfirming(true);
    try {
      // save mapping for next time
      try { localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mapping)); } catch {}

      const { data: job, error: jobErr } = await supabase.from("import_jobs").insert({
        file_name: file?.name || "manual.csv",
        file_type: fileType,
        status: "running",
        total_rows: analyzed.length,
        options: opts as any,
        column_mapping: mapping as any,
        summary: summary as any,
        created_by: user.id,
      }).select().single();
      if (jobErr) throw jobErr;

      let created = 0, updated = 0, skipped = 0, errors = 0;
      const items: any[] = [];

      // Build category cache for updateCategory
      const catCache: Record<string, string> = {};
      async function ensureCategoryId(name?: string): Promise<string | null> {
        if (!name) return null;
        const key = normalizeKey(name);
        if (catCache[key]) return catCache[key];
        const { data: existing } = await supabase.from("categories").select("id").ilike("name", name).maybeSingle();
        if (existing) { catCache[key] = existing.id; return existing.id; }
        const slug = slugify(name);
        const { data: ins } = await supabase.from("categories").insert({ name, slug }).select("id").maybeSingle();
        if (ins) { catCache[key] = ins.id; return ins.id; }
        return null;
      }

      for (const r of analyzed) {
        const item: any = {
          import_job_id: job.id, row_number: r.row_number,
          raw_data: r.raw, normalized_data: r.norm as any,
          matched_product_id: r.matched?.id || null, match_type: r.match_type || null,
          status: "pending", action: r.action,
        };
        try {
          if (r.action === "skip" || r.action === "review") {
            skipped++; item.status = "skipped"; item.error_message = r.reasons.join("; "); items.push(item); continue;
          }
          if (r.action === "create") {
            if (!opts.importNew) { skipped++; item.status = "skipped"; items.push(item); continue; }
            const noStock = r.norm.stock != null && r.norm.stock <= 0;
            const catId = opts.updateCategory ? await ensureCategoryId(r.norm.category_name) : null;
            const insertPayload: any = {
              name: r.norm.name,
              slug: r.norm.name ? slugify(r.norm.name) + "-" + (r.norm.barcode || r.norm.sku || Math.random().toString(36).slice(2, 6)) : null,
              barcode: r.norm.barcode || null,
              sku: r.norm.sku || null,
              trier_product_id: r.norm.trier_product_id || null,
              description: r.norm.description || null,
              manufacturer: r.norm.manufacturer || null,
              price: r.norm.price ?? 0,
              promo_price: r.norm.promo_price ?? null,
              stock: r.norm.stock ?? 0,
              image_url: r.norm.image_url || null,
              requires_prescription: r.norm.requires_prescription ?? false,
              controlled: r.norm.controlled ?? false,
              active: noStock && opts.inactivateIfNoStock ? false : (r.norm.active ?? true),
              source: "manual_import",
              ...(catId ? { category_id: catId } : {}),
            };
            const { data: ins, error } = await supabase.from("products").insert(insertPayload).select().single();
            if (error) throw error;
            created++; item.status = "created"; item.after_data = ins as any;
          } else if (r.action === "update") {
            const m = r.matched;
            const update: any = {};
            if (opts.updatePrice && r.norm.price != null) update.price = r.norm.price;
            if (opts.updatePrice && r.norm.promo_price != null) update.promo_price = r.norm.promo_price;
            if (opts.updateStock && r.norm.stock != null) update.stock = r.norm.stock;
            if (opts.updateImage && r.norm.image_url) update.image_url = r.norm.image_url;
            if (opts.updateCategory && r.norm.category_name) {
              const cid = await ensureCategoryId(r.norm.category_name);
              if (cid) update.category_id = cid;
            }
            if (opts.inactivateIfNoStock && r.norm.stock != null && r.norm.stock <= 0) update.active = false;
            if (Object.keys(update).length === 0) { skipped++; item.status = "skipped"; item.error_message = "Nada a atualizar"; items.push(item); continue; }
            const { data: upd, error } = await supabase.from("products").update(update).eq("id", m.id).select().single();
            if (error) throw error;
            updated++; item.status = "updated"; item.before_data = m; item.after_data = upd as any;
          }
        } catch (e: any) {
          errors++; item.status = "error"; item.error_message = e.message;
        }
        items.push(item);
      }

      // bulk insert items
      for (let i = 0; i < items.length; i += 200) {
        await supabase.from("import_job_items").insert(items.slice(i, i + 200));
      }

      await supabase.from("import_jobs").update({
        status: errors > 0 ? "completed_with_errors" : "completed",
        created_count: created, updated_count: updated, skipped_count: skipped, error_count: errors,
      }).eq("id", job.id);

      toast.success(`Importação concluída: ${created} criados, ${updated} atualizados, ${skipped} ignorados, ${errors} erros`);
      reset();
      loadHistory();
    } catch (e: any) {
      toast.error("Falha na importação: " + e.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin/produtos" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar para Produtos
          </Link>
          <h1 className="text-2xl font-bold mt-2">Importar produtos</h1>
          <p className="text-sm text-muted-foreground">CSV, XLSX e XML. PDF apenas em modo experimental.</p>
        </div>
      </div>

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Importação</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">1. Arquivo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xml,.pdf" onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])} />
                {file && <Button variant="outline" size="sm" onClick={reset}>Trocar</Button>}
              </div>
              {file && (
                <div className="text-sm text-muted-foreground">
                  <strong>{file.name}</strong> · {fileType.toUpperCase()} · {(file.size / 1024).toFixed(1)} KB · {rows.length} linhas
                </div>
              )}
              {fileType === "pdf" && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Modo experimental</AlertTitle>
                  <AlertDescription>Importação por PDF pode conter erros de leitura. Revise os dados antes de confirmar. Esta versão não cadastra produtos diretamente via PDF.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {headers.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">2. Mapeamento de colunas</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {headers.map((h) => (
                    <div key={h} className="flex items-center gap-2">
                      <Label className="w-1/2 truncate text-sm" title={h}>{h}</Label>
                      <Select value={mapping[h] || "ignore"} onValueChange={(v) => setMapping({ ...mapping, [h]: v as FieldKey })}>
                        <SelectTrigger className="w-1/2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={analyze} disabled={analyzing}>
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Analisar arquivo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {analyzed && summary && (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">3. Resumo da análise</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <Stat label="Total" v={summary.total} />
                    <Stat label="Novos" v={summary.novos} color="text-green-600" />
                    <Stat label="Existentes" v={summary.existentes} color="text-blue-600" />
                    <Stat label="Duplicados" v={summary.duplicados} color="text-yellow-600" />
                    <Stat label="Divergentes" v={summary.divergentes} color="text-orange-600" />
                    <Stat label="Revisão manual" v={summary.revisao} color="text-purple-600" />
                    <Stat label="Erros" v={summary.erros} color="text-red-600" />
                    <Stat label="Sem estoque" v={summary.semEstoque} />
                    <Stat label="Sem preço" v={summary.semPreco} />
                    <Stat label="Sem EAN" v={summary.semBarcode} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">4. Opções de importação</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <Opt l="Importar apenas novos" c={opts.importNew} on={(v) => setOpts({ ...opts, importNew: v })} />
                  <Opt l="Atualizar existentes" c={opts.updateExisting} on={(v) => setOpts({ ...opts, updateExisting: v })} />
                  <Opt l="Ignorar duplicados" c={opts.skipDuplicates} on={(v) => setOpts({ ...opts, skipDuplicates: v })} />
                  <Opt l="Importar sem estoque como inativo" c={opts.inactivateIfNoStock} on={(v) => setOpts({ ...opts, inactivateIfNoStock: v })} />
                  <Opt l="Não alterar produtos já existentes" c={opts.dontTouchExisting} on={(v) => setOpts({ ...opts, dontTouchExisting: v })} />
                  <Opt l="Atualizar preço" c={opts.updatePrice} on={(v) => setOpts({ ...opts, updatePrice: v })} />
                  <Opt l="Atualizar estoque" c={opts.updateStock} on={(v) => setOpts({ ...opts, updateStock: v })} />
                  <Opt l="Atualizar categoria" c={opts.updateCategory} on={(v) => setOpts({ ...opts, updateCategory: v })} />
                  <Opt l="Atualizar imagem" c={opts.updateImage} on={(v) => setOpts({ ...opts, updateImage: v })} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">5. Prévia</CardTitle>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="new">Novos</SelectItem>
                      <SelectItem value="existing">Existentes</SelectItem>
                      <SelectItem value="duplicate">Duplicados</SelectItem>
                      <SelectItem value="divergent">Divergentes</SelectItem>
                      <SelectItem value="review">Revisão manual</SelectItem>
                      <SelectItem value="error">Erros</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>EAN</TableHead>
                        <TableHead>Preço</TableHead>
                        <TableHead>Estoque</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ação</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAnalyzed.slice(0, 500).map((r) => (
                        <TableRow key={r.row_number}>
                          <TableCell>{r.row_number}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={r.norm.name}>{r.norm.name || "—"}</TableCell>
                          <TableCell>{r.norm.trier_product_id || r.norm.sku || "—"}</TableCell>
                          <TableCell>{r.norm.barcode || "—"}</TableCell>
                          <TableCell>{r.norm.price ?? "—"}</TableCell>
                          <TableCell>{r.norm.stock ?? "—"}</TableCell>
                          <TableCell><Badge className={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                          <TableCell className="text-xs">{r.action}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={r.reasons.join("; ")}>{r.reasons.join("; ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredAnalyzed.length > 500 && <div className="text-xs text-muted-foreground mt-2">Mostrando 500 de {filteredAnalyzed.length} linhas.</div>}
                </CardContent>
              </Card>

              <div className="flex gap-2 sticky bottom-0 bg-background py-3 border-t">
                <Button size="lg" onClick={confirmImport} disabled={confirming || fileType === "pdf"}>
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Confirmar importação
                </Button>
                <Button variant="outline" size="lg" onClick={() => setAnalyzed(null)}>Voltar para mapeamento</Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle className="text-base">Histórico de importações</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Criados</TableHead>
                    <TableHead>Atualizados</TableHead>
                    <TableHead>Ignorados</TableHead>
                    <TableHead>Erros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="text-xs">{new Date(j.created_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-xs">{j.file_name}</TableCell>
                      <TableCell className="text-xs uppercase">{j.file_type}</TableCell>
                      <TableCell className="text-xs">{j.status}</TableCell>
                      <TableCell>{j.total_rows}</TableCell>
                      <TableCell className="text-green-600">{j.created_count}</TableCell>
                      <TableCell className="text-blue-600">{j.updated_count}</TableCell>
                      <TableCell>{j.skipped_count}</TableCell>
                      <TableCell className="text-red-600">{j.error_count}</TableCell>
                    </TableRow>
                  ))}
                  {!history.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhuma importação ainda.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, v, color }: { label: string; v: number; color?: string }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${color || ""}`}>{v}</div>
    </div>
  );
}

function Opt({ l, c, on }: { l: string; c: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox checked={c} onCheckedChange={(v) => on(!!v)} />
      <span>{l}</span>
    </label>
  );
}

function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
