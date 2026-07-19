import { useTenant } from "@/hooks/useTenant";
import { selectTenantRows, tenantQueryKey } from "@/lib/tenantQuery";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL } from "@/lib/store";

export default function AdminCustomers() {
  const { activeOrganization, activeStore } = useTenant();
  const tenantScope = {
    organizationId: activeOrganization?.id ?? null,
    storeId: activeStore?.id ?? null,
  };
  const [q, setQ] = useState("");
  const [view, setView] = useState<any>(null);

  const { data } = useQuery({
    queryKey: tenantQueryKey(tenantScope, ["admin_customers"]),
    queryFn: async () => {
      const { data: customerOrders, error: ordersError } = await selectTenantRows(
        "orders",
        tenantScope,
        "user_id",
      ).not("user_id", "is", null);
      if (ordersError) throw ordersError;

      const customerIds = Array.from(
        new Set((customerOrders ?? []).map((order: any) => order.user_id).filter(Boolean)),
      );
      if (customerIds.length === 0) return [];

      const { data: customers, error: customersError } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, cpf, created_at")
        .in("id", customerIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (customersError) throw customersError;
      return customers ?? [];
    },
  });

  const filtered = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return data || [];
    return (data || []).filter((c: any) =>
      [c.full_name, c.email, c.phone, c.cpf].some((v) => (v || "").toLowerCase().includes(t)),
    );
  }, [data, q]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-extrabold">Clientes</h1>

      <div className="bg-card border rounded-xl shadow-card p-5 space-y-3">
        <Input placeholder="Buscar por nome, e-mail, telefone ou CPF..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-2">Nome</th>
                <th className="p-2">E-mail</th>
                <th className="p-2">Telefone</th>
                <th className="p-2">CPF</th>
                <th className="p-2">Desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2 font-medium">{c.full_name || "—"}</td>
                  <td className="p-2 text-xs">{c.email || "—"}</td>
                  <td className="p-2 text-xs">{c.phone || "—"}</td>
                  <td className="p-2 text-xs">{c.cpf || "—"}</td>
                  <td className="p-2 text-xs">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="p-2 text-right"><Button size="sm" variant="outline" onClick={() => setView(c)}>Ver</Button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum cliente.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{view?.full_name || "Cliente"}</DialogTitle></DialogHeader>
          {view && <CustomerDetail customer={view} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerDetail({ customer }: { customer: any }) {
  const { activeOrganization, activeStore } = useTenant();
  const tenantScope = {
    organizationId: activeOrganization?.id ?? null,
    storeId: activeStore?.id ?? null,
  };
  const { data: addresses } = useQuery({
    queryKey: tenantQueryKey(tenantScope, ["customer_addresses", customer.id]),
    queryFn: async () =>
      (await supabase.from("customer_addresses").select("*").eq("customer_id", customer.id).order("is_default", { ascending: false })).data || [],
  });
  const { data: orders } = useQuery({
    queryKey: tenantQueryKey(tenantScope, ["customer_orders", customer.id]),
    queryFn: async () =>
      (await selectTenantRows("orders", tenantScope, "id, created_at, total, status, payment_status")
        .eq("user_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(50)).data || [],
  });

  return (
    <Tabs defaultValue="info">
      <TabsList className="grid grid-cols-3 w-full">
        <TabsTrigger value="info">Dados</TabsTrigger>
        <TabsTrigger value="enderecos">Endereços ({addresses?.length || 0})</TabsTrigger>
        <TabsTrigger value="pedidos">Pedidos ({orders?.length || 0})</TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="space-y-2 text-sm pt-3">
        <Row k="E-mail" v={customer.email} />
        <Row k="Telefone" v={customer.phone} />
        <Row k="CPF" v={customer.cpf} />
        <Row k="Cadastro" v={new Date(customer.created_at).toLocaleString("pt-BR")} />
      </TabsContent>

      <TabsContent value="enderecos" className="space-y-2 pt-3">
        {(addresses || []).map((a: any) => (
          <div key={a.id} className="border rounded p-3 text-sm">
            <div className="flex justify-between items-start">
              <div className="font-semibold">{a.label || "Endereço"}</div>
              {a.is_default && <Badge>Padrão</Badge>}
            </div>
            <div className="text-muted-foreground text-xs mt-1">
              {a.street}, {a.number} {a.complement && `- ${a.complement}`}<br />
              {a.neighborhood} · {a.city}/{a.state} · CEP {a.cep}
              {a.reference && <><br />Ref: {a.reference}</>}
            </div>
          </div>
        ))}
        {(!addresses || addresses.length === 0) && (
          <div className="text-xs text-muted-foreground">Nenhum endereço cadastrado.</div>
        )}
      </TabsContent>

      <TabsContent value="pedidos" className="space-y-1 pt-3">
        {(orders || []).map((o: any) => (
          <div key={o.id} className="flex justify-between text-xs border-b py-1">
            <span className="font-mono">#{o.id.slice(0, 6)}</span>
            <span>{new Date(o.created_at).toLocaleDateString("pt-BR")}</span>
            <span>{o.status}</span>
            <span className="font-semibold">{formatBRL(o.total)}</span>
          </div>
        ))}
        {(!orders || orders.length === 0) && (
          <div className="text-xs text-muted-foreground">Nenhum pedido.</div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex justify-between border-b py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v || "—"}</span>
    </div>
  );
}
