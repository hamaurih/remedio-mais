import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, UserPlus, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Seller = {
  user_id: string;
  email: string;
  full_name: string | null;
  granted_at: string;
  can_request_refund: boolean;
  can_execute_refund: boolean;
  can_view_prescriptions: boolean;
};

export default function AdminSellers() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const { data: sellers, isLoading } = useQuery({
    queryKey: ["admin_sellers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_sellers");
      if (error) throw error;
      return (data || []) as Seller[];
    },
  });

  const invite = async () => {
    const e = email.trim();
    if (!e) { toast.error("Informe um email"); return; }
    setInviting(true);
    const { data, error } = await supabase.rpc("admin_invite_seller", { _email: e });
    setInviting(false);
    if (error) { toast.error(error.message); return; }
    const res = data as any;
    if (!res?.ok) { toast.error(res?.message || "Não foi possível convidar"); return; }
    toast.success("Vendedor adicionado");
    setEmail("");
    qc.invalidateQueries({ queryKey: ["admin_sellers"] });
  };

  const revoke = async (userId: string) => {
    const { error } = await supabase.rpc("admin_revoke_seller", { _user_id: userId });
    if (error) { toast.error(error.message); return; }
    toast.success("Acesso revogado");
    qc.invalidateQueries({ queryKey: ["admin_sellers"] });
  };

  const togglePerm = async (s: Seller, field: keyof Seller, value: boolean) => {
    const { error } = await supabase
      .from("seller_permissions")
      .upsert({ user_id: s.user_id, [field]: value } as any, { onConflict: "user_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin_sellers"] });
  };

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-2">Vendedores</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Vendedores acessam apenas pedidos e itens — não veem financeiro, produtos, banners ou configurações.
        A pessoa deve criar conta em <code>/auth</code> primeiro; depois você libera o acesso por email.
      </p>

      <Card className="p-4 mb-6">
        <div className="text-sm font-semibold mb-2">Convidar por email</div>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="email@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
          />
          <Button onClick={invite} disabled={inviting}>
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
            Conceder acesso
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold">Vendedores ativos</div>
        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground">Carregando...</div>
        ) : !sellers?.length ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Nenhum vendedor cadastrado ainda.</div>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">Vendedor</th>
                <th className="p-3">Pode pedir reembolso</th>
                <th className="p-3">Pode executar reembolso</th>
                <th className="p-3">Ver receitas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.user_id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{s.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.email}</div>
                    <Badge variant="outline" className="mt-1 text-[10px]">Vendedor</Badge>
                  </td>
                  <td className="p-3">
                    <Switch checked={s.can_request_refund}
                      onCheckedChange={(v) => togglePerm(s, "can_request_refund", v)} />
                  </td>
                  <td className="p-3">
                    <Switch checked={s.can_execute_refund}
                      onCheckedChange={(v) => togglePerm(s, "can_execute_refund", v)} />
                  </td>
                  <td className="p-3">
                    <Switch checked={s.can_view_prescriptions}
                      onCheckedChange={(v) => togglePerm(s, "can_view_prescriptions", v)} />
                  </td>
                  <td className="p-3 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revogar acesso?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {s.email} deixará de ver pedidos. A conta de cliente continua existindo.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => revoke(s.user_id)}>Revogar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
