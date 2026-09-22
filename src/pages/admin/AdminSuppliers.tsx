import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Search, Truck } from "lucide-react";
import { toast } from "sonner";

export default function AdminSuppliers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ legal_name: "", trade_name: "", cnpj: "", email: "", phone: "", payment_terms: "", lead_time_days: "" });

  const { data: tenantId } = useQuery({
    queryKey: ["admin-supplier-tenant", user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await (supabase as any).from("tenant_memberships").select("tenant_id").eq("user_id", user!.id).limit(1).maybeSingle()).data?.tenant_id || null,
  });
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["admin-suppliers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("suppliers").select("*").eq("tenant_id", tenantId).order("legal_name");
      if (error) throw error;
      return data || [];
    },
  });
  const filtered = suppliers.filter((s: any) => [s.legal_name, s.trade_name, s.cnpj].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase())));

  const save = async () => {
    if (!tenantId || !form.legal_name.trim()) return toast.error("Informe a razão social.");
    setSaving(true);
    const { error } = await (supabase as any).from("suppliers").insert({ ...form, tenant_id: tenantId, lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : null, address: {} });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Fornecedor cadastrado."); setOpen(false); setForm({ legal_name: "", trade_name: "", cnpj: "", email: "", phone: "", payment_terms: "", lead_time_days: "" }); qc.invalidateQueries({ queryKey: ["admin-suppliers"] });
  };

  return <div className="p-6 space-y-6">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-extrabold flex items-center gap-2"><Truck className="h-6 w-6" /> Fornecedores</h1><p className="text-sm text-muted-foreground mt-1">Cadastro próprio do ERP para compras, custos e recebimentos.</p></div><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo fornecedor</Button></div>
    <div className="bg-card border rounded-xl p-4 flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por razão social, nome fantasia ou CNPJ" className="border-0 shadow-none" /></div>
    <div className="bg-card border rounded-xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary text-left"><tr><th className="p-3">Fornecedor</th><th className="p-3">CNPJ</th><th className="p-3">Contato</th><th className="p-3">Prazo</th><th className="p-3">Status</th></tr></thead><tbody>{!tenantId || isLoading ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Carregando...</td></tr> : filtered.map((s: any) => <tr key={s.id} className="border-t"><td className="p-3"><div className="font-semibold">{s.trade_name || s.legal_name}</div><div className="text-xs text-muted-foreground">{s.legal_name}</div></td><td className="p-3">{s.cnpj || "—"}</td><td className="p-3">{s.email || s.phone || "—"}</td><td className="p-3">{s.lead_time_days ? `${s.lead_time_days} dias` : "—"}</td><td className="p-3"><Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Ativo" : "Inativo"}</Badge></td></tr>)}{tenantId && !filtered.length && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Nenhum fornecedor cadastrado.</td></tr>}</tbody></table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Novo fornecedor</DialogTitle></DialogHeader><div className="grid gap-3"><Field label="Razão social *" value={form.legal_name} onChange={(v) => setForm({ ...form, legal_name: v })} /><Field label="Nome fantasia" value={form.trade_name} onChange={(v) => setForm({ ...form, trade_name: v })} /><div className="grid grid-cols-2 gap-3"><Field label="CNPJ" value={form.cnpj} onChange={(v) => setForm({ ...form, cnpj: v })} /><Field label="Telefone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div><div className="grid grid-cols-2 gap-3"><Field label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} /><Field label="Prazo de entrega (dias)" value={form.lead_time_days} onChange={(v) => setForm({ ...form, lead_time_days: v })} /></div><Field label="Condições de pagamento" value={form.payment_terms} onChange={(v) => setForm({ ...form, payment_terms: v })} /></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar fornecedor"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-1"><Label>{label}</Label><Input value={value} onChange={(e) => onChange(e.target.value)} /></div>; }
