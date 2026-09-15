import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL } from "@/lib/store";
import { CheckCircle2, Clock3, Search, ShoppingBag, UserPlus, Users } from "lucide-react";

type Registration = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  registered_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  account_role: string;
  order_count: number;
  paid_order_count: number;
  total_spent: number;
};

type Filter = "all" | "buyers" | "prospects";

export default function AdminRegistrations() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const query = useQuery({
    queryKey: ["admin-site-registrations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_list_site_registrations");
      if (error) throw error;
      return (data || []) as Registration[];
    },
    staleTime: 30_000,
  });

  const rows = query.data || [];
  const stats = useMemo(() => {
    const buyers = rows.filter((r) => Number(r.order_count || 0) > 0).length;
    const prospects = rows.length - buyers;
    const confirmed = rows.filter((r) => !!r.email_confirmed_at).length;
    return { total: rows.length, buyers, prospects, confirmed };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      const orders = Number(r.order_count || 0);
      if (filter === "buyers" && orders === 0) return false;
      if (filter === "prospects" && orders > 0) return false;
      if (!term) return true;
      return [r.full_name, r.email, r.phone, r.cpf]
        .some((v) => String(v || "").toLowerCase().includes(term));
    });
  }, [rows, q, filter]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">Cadastros do site</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todas as contas criadas no e-commerce, inclusive usuários que ainda não fizeram pedido.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total cadastrados" value={stats.total} icon={Users} />
        <StatCard title="Com pedidos" value={stats.buyers} icon={ShoppingBag} />
        <StatCard title="Ainda não compraram" value={stats.prospects} icon={UserPlus} />
        <StatCard title="E-mail confirmado" value={stats.confirmed} icon={CheckCircle2} />
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4 md:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, e-mail, telefone ou CPF..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="all">Todos ({stats.total})</TabsTrigger>
                <TabsTrigger value="buyers">Com pedidos ({stats.buyers})</TabsTrigger>
                <TabsTrigger value="prospects">Sem pedidos ({stats.prospects})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {query.isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando cadastros...</div>
          ) : query.isError ? (
            <div className="py-12 text-center text-sm text-destructive">
              Não foi possível carregar os cadastros. Atualize a página e tente novamente.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/50 text-left text-xs">
                  <tr>
                    <th className="p-3">Usuário</th>
                    <th className="p-3">Contato</th>
                    <th className="p-3">Cadastro</th>
                    <th className="p-3">Último acesso</th>
                    <th className="p-3">Situação</th>
                    <th className="p-3 text-center">Pedidos</th>
                    <th className="p-3 text-right">Total pago</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const orders = Number(r.order_count || 0);
                    return (
                      <tr key={r.user_id} className="border-t align-top hover:bg-muted/20">
                        <td className="p-3">
                          <div className="font-semibold">{r.full_name || "Nome não informado"}</div>
                          <div className="mt-1 flex gap-1.5 flex-wrap">
                            {r.account_role !== "user" && (
                              <Badge variant="outline" className="text-[10px]">{roleLabel(r.account_role)}</Badge>
                            )}
                            {r.email_confirmed_at && (
                              <Badge variant="secondary" className="text-[10px]">E-mail confirmado</Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          <div>{r.email || "—"}</div>
                          <div className="text-muted-foreground mt-1">{r.phone || "Sem telefone"}</div>
                          {r.cpf && <div className="text-muted-foreground mt-1">CPF: {r.cpf}</div>}
                        </td>
                        <td className="p-3 text-xs whitespace-nowrap">{formatDateTime(r.registered_at)}</td>
                        <td className="p-3 text-xs whitespace-nowrap">
                          {r.last_sign_in_at ? (
                            formatDateTime(r.last_sign_in_at)
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1"><Clock3 className="h-3 w-3" /> Nunca</span>
                          )}
                        </td>
                        <td className="p-3">
                          {orders > 0 ? (
                            <Badge>Com pedidos</Badge>
                          ) : (
                            <Badge variant="outline">Ainda não comprou</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold">{orders}</td>
                        <td className="p-3 text-right font-semibold whitespace-nowrap">{formatBRL(Number(r.total_spent || 0))}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-muted-foreground">
                        Nenhum cadastro encontrado com esses filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: any }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-muted-foreground">{title}</div>
          <div className="text-2xl font-black mt-1">{value}</div>
        </div>
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role: string) {
  if (role === "admin") return "Administrador";
  if (role === "seller") return "Vendedor";
  return "Usuário";
}
