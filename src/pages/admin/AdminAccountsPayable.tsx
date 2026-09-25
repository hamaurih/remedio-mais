import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, CircleDollarSign, CreditCard, Edit2, FilePlus2, Loader2, Plus, WalletCards, XCircle } from "lucide-react";

const labels: Record<string, string> = {
  draft: "Rascunho", pending: "Pendente", approved: "Aprovada", partially_paid: "Parcial",
  paid: "Paga", overdue: "Vencida", cancelled: "Cancelada",
};
const tone: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700", pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700", partially_paid: "bg-violet-100 text-violet-700",
  paid: "bg-emerald-100 text-emerald-700", overdue: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};
const money = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminAccountsPayable() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  const { data: tenantId } = useQuery({
    queryKey: ["payable-tenant", user?.id], enabled: !!user?.id,
    queryFn: async () => (await (supabase as any).from("tenant_memberships").select("tenant_id").eq("user_id", user!.id).limit(1).maybeSingle()).data?.tenant_id,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["payable-suppliers", tenantId], enabled: !!tenantId,
    queryFn: async () => (await (supabase as any).from("suppliers").select("id,legal_name,trade_name").eq("tenant_id", tenantId).eq("active", true).order("legal_name")).data || [],
  });
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts-payable", tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const r = await (supabase as any).from("accounts_payable")
        .select("*, suppliers(legal_name,trade_name), goods_receipts(supplier_invoice_number)")
        .eq("tenant_id", tenantId).order("due_date", { ascending: true });
      if (r.error) throw r.error;
      return r.data || [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["accounts-payable"] });
  const totals = useMemo(() => ({
    open: accounts.filter((a: any) => !["paid", "cancelled"].includes(a.status)).reduce((s: number, a: any) => s + Number(a.amount || 0) - Number(a.paid_amount || 0), 0),
    due: accounts.filter((a: any) => ["approved", "overdue", "partially_paid"].includes(a.status)).reduce((s: number, a: any) => s + Number(a.amount || 0) - Number(a.paid_amount || 0), 0),
    paid: accounts.filter((a: any) => a.status === "paid").reduce((s: number, a: any) => s + Number(a.paid_amount || 0), 0),
  }), [accounts]);
  const shown = accounts.filter((a: any) => filter === "all" || a.status === filter);
  const approve = async (id: string) => {
    const { error } = await (supabase as any).rpc("approve_accounts_payable", { _account_id: id });
    if (error) toast.error(error.message); else { toast.success("Conta aprovada."); refresh(); }
  };
  const pay = async (id: string) => {
    const method = window.prompt("Forma de pagamento (Pix, transferência, cartão ou dinheiro):", "Pix");
    if (!method) return;
    const { error } = await (supabase as any).rpc("pay_accounts_payable", { _account_id: id, _payment_method: method, _paid_amount: null });
    if (error) toast.error(error.message); else { toast.success("Conta baixada como paga."); refresh(); }
  };
  const cancel = async (id: string) => {
    if (!window.confirm("Cancelar esta conta a pagar?")) return;
    const { error } = await (supabase as any).rpc("cancel_accounts_payable", { _account_id: id });
    if (error) toast.error(error.message); else { toast.success("Conta cancelada."); refresh(); }
  };
  return <div className="p-6 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold">Contas a Pagar</h1><p className="text-sm text-muted-foreground mt-1">Controle de despesas, fornecedores, vencimentos e pagamentos do ERP.</p></div>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Nova conta</Button>
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      <Metric icon={WalletCards} label="Em aberto" value={money(totals.open)} />
      <Metric icon={CircleDollarSign} label="Aprovado / vencido" value={money(totals.due)} />
      <Metric icon={CheckCircle2} label="Pago no período carregado" value={money(totals.paid)} />
    </div>
    <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-2">
      {["all", "draft", "approved", "overdue", "paid"].map((s) => <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>{s === "all" ? "Todas" : labels[s]}</Button>)}
    </div>
    <div className="bg-card border rounded-xl overflow-x-auto">
      <table className="w-full text-sm"><thead className="bg-secondary text-left"><tr><th className="p-3">Descrição</th><th className="p-3">Fornecedor</th><th className="p-3">Vencimento</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead>
      <tbody>{isLoading && <tr><td colSpan={6} className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>}
      {!isLoading && shown.map((a: any) => <tr key={a.id} className="border-t">
        <td className="p-3"><div className="font-medium">{a.description}</div><div className="text-xs text-muted-foreground">{a.document_number ? `NF ${a.document_number}` : a.goods_receipt_id ? "Gerada do recebimento" : "Lançamento manual"}</div></td>
        <td className="p-3">{a.suppliers?.trade_name || a.suppliers?.legal_name || "—"}</td>
        <td className="p-3">{new Date(`${a.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</td>
        <td className="p-3 font-semibold">{money(a.amount)}<div className="text-xs text-muted-foreground">Pago: {money(a.paid_amount)}</div></td>
        <td className="p-3"><Badge className={tone[a.status] || ""}>{labels[a.status] || a.status}</Badge></td>
        <td className="p-3"><div className="flex flex-wrap gap-2">{["draft", "pending"].includes(a.status) && <><Button size="sm" variant="outline" onClick={() => setEditing(a)}><Edit2 className="h-4 w-4 mr-1" />Editar</Button><Button size="sm" variant="outline" onClick={() => approve(a.id)}><CheckCircle2 className="h-4 w-4 mr-1" />Aprovar</Button><Button size="sm" variant="ghost" onClick={() => cancel(a.id)} title="Cancelar"><XCircle className="h-4 w-4" /></Button></>}{["approved", "partially_paid"].includes(a.status) && <Button size="sm" onClick={() => pay(a.id)}><CreditCard className="h-4 w-4 mr-1" />Pagar</Button>}</div></td>
      </tr>)}
      {!isLoading && !shown.length && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Nenhuma conta encontrada.</td></tr>}</tbody></table>
    </div>
    <NewPayableDialog open={open} onOpenChange={setOpen} tenantId={tenantId} suppliers={suppliers} onSaved={refresh} />
    <EditPayableDialog open={!!editing} onOpenChange={(v: boolean) => !v && setEditing(null)} account={editing} suppliers={suppliers} onSaved={() => { setEditing(null); refresh(); }} />
  </div>;
}

function Metric({ icon: Icon, label, value }: any) { return <div className="bg-card border rounded-xl p-4 flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2"><Icon className="h-5 w-5 text-primary" /></div><div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-extrabold">{value}</div></div></div>; }

function NewPayableDialog({ open, onOpenChange, tenantId, suppliers, onSaved }: any) {
  const [supplier, setSupplier] = useState(""); const [description, setDescription] = useState(""); const [documentNumber, setDocumentNumber] = useState(""); const [dueDate, setDueDate] = useState(""); const [amount, setAmount] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!tenantId || !description.trim() || !dueDate || Number(amount) <= 0) return toast.error("Informe descrição, vencimento e valor.");
    setSaving(true);
    const { error } = await (supabase as any).from("accounts_payable").insert({ tenant_id: tenantId, supplier_id: supplier || null, description: description.trim(), document_number: documentNumber.trim() || null, due_date: dueDate, amount: Number(amount), status: "draft" });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Conta criada em rascunho."); onOpenChange(false); onSaved(); setDescription(""); setDocumentNumber(""); setAmount(""); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle><FilePlus2 className="h-5 w-5 inline mr-2" />Nova conta a pagar</DialogTitle></DialogHeader><div className="grid gap-3">
    <div className="space-y-1"><Label>Fornecedor</Label><Select value={supplier} onValueChange={setSupplier}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.trade_name || s.legal_name}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1"><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: compra de medicamentos" /></div>
    <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Documento/NF</Label><Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} /></div><div className="space-y-1"><Label>Vencimento</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div></div>
    <div className="space-y-1"><Label>Valor total</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
  </div><DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Criar conta"}</Button></DialogFooter></DialogContent></Dialog>;
}

function EditPayableDialog({ open, onOpenChange, account, suppliers, onSaved }: any) {
  const [description, setDescription] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [notes, setNotes] = useState("");
  const [installments, setInstallments] = useState("1");
  const [interval, setInterval] = useState("30");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (!account) return;
    setDescription(account.description || "");
    setDocumentNumber(account.document_number || "");
    setDueDate(account.due_date || "");
    setAmount(String(account.amount || ""));
    setSupplier(account.supplier_id || "");
    setCostCenter(account.cost_center || "");
    setNotes(account.notes || "");
    setInstallments("1");
    setInterval("30");
  }, [account]);

  const save = async () => {
    if (!account?.id || !description.trim() || !dueDate || Number(amount) <= 0) return toast.error("Preencha descrição, vencimento e valor.");
    setSaving(true);
    const update = await (supabase as any).rpc("update_accounts_payable", {
      _account_id: account.id, _description: description, _document_number: documentNumber,
      _due_date: dueDate, _amount: Number(amount), _supplier_id: supplier || null,
      _cost_center: costCenter, _notes: notes,
    });
    if (!update.error) {
      const parcel = await (supabase as any).rpc("set_accounts_payable_installments", {
        _account_id: account.id, _installment_count: Number(installments), _first_due_date: dueDate, _interval_days: Number(interval),
      });
      if (parcel.error) update.error = parcel.error;
    }
    setSaving(false);
    if (update.error) toast.error(update.error.message);
    else { toast.success("Conta atualizada com vencimento e parcelas."); onOpenChange(false); onSaved(); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle><Edit2 className="h-5 w-5 inline mr-2" />Editar conta a pagar</DialogTitle></DialogHeader>
    <div className="grid gap-3">
      <div className="space-y-1"><Label>Fornecedor</Label><Select value={supplier || "none"} onValueChange={(v) => setSupplier(v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent><SelectItem value="none">Sem fornecedor</SelectItem>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.trade_name || s.legal_name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Documento/NF</Label><Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} /></div><div className="space-y-1"><Label>Primeiro vencimento</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div></div>
      <div className="grid grid-cols-3 gap-3"><div className="space-y-1"><Label>Valor total</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div><div className="space-y-1"><Label>Parcelas</Label><Input type="number" min="1" max="36" value={installments} onChange={(e) => setInstallments(e.target.value)} /></div><div className="space-y-1"><Label>Intervalo (dias)</Label><Input type="number" min="1" value={interval} onChange={(e) => setInterval(e.target.value)} /></div></div>
      <div className="space-y-1"><Label>Centro de custo</Label><Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="Ex.: Compras, Operação, Administrativo" /></div>
      <div className="space-y-1"><Label>Observações</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
    </div>
    <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
