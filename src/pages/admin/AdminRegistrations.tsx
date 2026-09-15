import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL } from "@/lib/store";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  ShoppingBag,
  UserPlus,
  Users,
  WandSparkles,
} from "lucide-react";

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
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Registration | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [sendingResetFor, setSendingResetFor] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

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

  function openPasswordDialog(registration: Registration) {
    setSelected(registration);
    const generated = generateStrongPassword();
    setPassword(generated);
    setConfirm(generated);
    setShowPassword(false);
    setPasswordSaved(false);
  }

  function closePasswordDialog() {
    if (savingPassword) return;
    setSelected(null);
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setPasswordSaved(false);
  }

  async function readFunctionPayload(error: any) {
    try {
      const response: Response | undefined = error?.context;
      if (response && typeof response.clone === "function") {
        const text = await response.clone().text();
        try { return JSON.parse(text); } catch { return null; }
      }
    } catch {
      return null;
    }
    return null;
  }

  async function saveNewPassword() {
    if (!selected) return;
    if (selected.user_id === user?.id) {
      toast.error("Para sua própria conta, use a opção Alterar senha na área da conta.");
      return;
    }
    if (password.length < 8 || password.length > 128 || password !== confirm) {
      toast.error("Use entre 8 e 128 caracteres e confirme a mesma senha.");
      return;
    }

    setSavingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-user-security", {
        body: { action: "set-password", user_id: selected.user_id, password },
      });
      if (error) {
        const payload = await readFunctionPayload(error);
        if (payload?.error === "weak_password" || payload?.error === "pwned_password") {
          throw new Error("WEAK_PASSWORD");
        }
        if (payload?.error === "self_reset_not_allowed") throw new Error("SELF_RESET");
        if (payload?.error === "forbidden") throw new Error("FORBIDDEN");
        throw new Error("RESET_FAILED");
      }
      if (!data?.ok) throw new Error("RESET_FAILED");
      setPasswordSaved(true);
      toast.success("Senha redefinida com segurança.");
    } catch (error: any) {
      const code = String(error?.message || "");
      if (code === "WEAK_PASSWORD") {
        toast.error("Essa senha é muito comum ou apareceu em vazamentos. Gere outra senha.");
      } else if (code === "SELF_RESET") {
        toast.error("Use a área da sua conta para alterar sua própria senha.");
      } else if (code === "FORBIDDEN") {
        toast.error("Sua conta não tem permissão administrativa para redefinir senhas.");
      } else {
        toast.error("Não foi possível redefinir a senha deste usuário.");
      }
    } finally {
      setSavingPassword(false);
    }
  }

  async function sendResetLink(registration: Registration) {
    if (!registration.email) {
      toast.error("Este usuário não possui e-mail cadastrado.");
      return;
    }
    setSendingResetFor(registration.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-user-security", {
        body: { action: "send-reset-link", user_id: registration.user_id },
      });
      if (error) {
        const payload = await readFunctionPayload(error);
        if (payload?.error === "too_many_attempts") throw new Error("RATE_LIMIT");
        if (payload?.error === "forbidden") throw new Error("FORBIDDEN");
        throw new Error("SEND_FAILED");
      }
      if (!data?.ok) throw new Error("SEND_FAILED");
      toast.success(`Link de redefinição enviado para ${registration.email}.`);
    } catch (error: any) {
      const code = String(error?.message || "");
      if (code === "RATE_LIMIT") {
        toast.error("Um link já foi enviado recentemente para este usuário. Aguarde um minuto.");
      } else if (code === "FORBIDDEN") {
        toast.error("Sua conta não tem permissão administrativa para essa ação.");
      } else {
        toast.error("Não foi possível enviar o link de redefinição.");
      }
    } finally {
      setSendingResetFor(null);
    }
  }

  async function copyPassword() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Nova senha copiada.");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione a senha manualmente.");
    }
  }

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
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="bg-muted/50 text-left text-xs">
                  <tr>
                    <th className="p-3">Usuário</th>
                    <th className="p-3">Contato</th>
                    <th className="p-3">Cadastro</th>
                    <th className="p-3">Último acesso</th>
                    <th className="p-3">Situação</th>
                    <th className="p-3 text-center">Pedidos</th>
                    <th className="p-3 text-right">Total pago</th>
                    <th className="p-3 text-right">Segurança</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const orders = Number(r.order_count || 0);
                    const self = r.user_id === user?.id;
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
                            {self && <Badge variant="outline" className="text-[10px]">Sua conta</Badge>}
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
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPasswordDialog(r)}
                              disabled={self}
                              title={self ? "Altere sua própria senha pela área da conta" : "Definir uma nova senha"}
                            >
                              <KeyRound className="h-4 w-4 mr-1.5" />
                              Redefinir
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void sendResetLink(r)}
                              disabled={!r.email || sendingResetFor === r.user_id}
                            >
                              {sendingResetFor === r.user_id
                                ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                                : <Mail className="h-4 w-4 mr-1.5" />}
                              Enviar link
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-muted-foreground">
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

      <Dialog open={!!selected} onOpenChange={(open) => !open && closePasswordDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              {selected?.full_name || selected?.email || "Usuário"}. A senha atual não pode ser visualizada; você criará uma nova senha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-semibold">Segurança</div>
              <div className="text-muted-foreground mt-1">
                A senha antiga é armazenada de forma irreversível. Esta tela mostra apenas a nova senha criada agora e ela não é salva em texto puro no sistema.
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="admin-new-password">Nova senha</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const generated = generateStrongPassword();
                    setPassword(generated);
                    setConfirm(generated);
                    setPasswordSaved(false);
                    setShowPassword(true);
                  }}
                >
                  <WandSparkles className="h-4 w-4 mr-1.5" />
                  Gerar forte
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="admin-new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordSaved(false);
                  }}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  className="pr-11"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar nova senha" : "Mostrar nova senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-confirm-password">Confirmar nova senha</Label>
              <Input
                id="admin-confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setPasswordSaved(false);
                }}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de 8 caracteres. Senhas comuns ou encontradas em vazamentos são bloqueadas.
              </p>
            </div>

            {passwordSaved && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="font-semibold text-sm">Senha redefinida com sucesso.</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Copie a nova senha antes de fechar esta janela. Depois ela não poderá ser consultada novamente.
                </div>
                <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void copyPassword()}>
                  <Copy className="h-4 w-4 mr-1.5" />
                  Copiar nova senha
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closePasswordDialog} disabled={savingPassword}>
              {passwordSaved ? "Fechar" : "Cancelar"}
            </Button>
            {!passwordSaved && (
              <Button
                type="button"
                onClick={() => void saveNewPassword()}
                disabled={savingPassword || password.length < 8 || password !== confirm}
              >
                {savingPassword ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1.5" />}
                {savingPassword ? "Redefinindo..." : "Salvar nova senha"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function generateStrongPassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
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
