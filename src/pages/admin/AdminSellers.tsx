import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ErpMetricCard, ErpPage, ErpPageHeader, ErpPanel, ErpPanelHeader } from "@/components/admin/ErpPageShell";

type Seller = {
  user_id: string;
  email: string;
  full_name: string | null;
  granted_at: string;
  can_request_refund: boolean;
  can_execute_refund: boolean;
  can_view_prescriptions: boolean;
  can_approve_prescriptions: boolean;
};

type PermissionField = "can_request_refund" | "can_execute_refund" | "can_view_prescriptions" | "can_approve_prescriptions";

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
    const normalizedEmail = email.trim();
    if (!normalizedEmail) { toast.error("Informe um email"); return; }
    setInviting(true);
    const { data, error } = await supabase.rpc("admin_invite_seller", { _email: normalizedEmail });
    setInviting(false);
    if (error) { toast.error(error.message); return; }
    const result = data as any;
    if (!result?.ok) { toast.error(result?.message || "Não foi possível convidar"); return; }
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

  const togglePerm = async (seller: Seller, field: PermissionField, value: boolean) => {
    const patch: Record<string, unknown> = { user_id: seller.user_id, [field]: value };
    // Quem aprova precisa conseguir abrir a receita. Ao desligar visualização,
    // também desligamos aprovação para não deixar uma permissão invisível ativa.
    if (field === "can_approve_prescriptions" && value) patch.can_view_prescriptions = true;
    if (field === "can_view_prescriptions" && !value) patch.can_approve_prescriptions = false;

    const { error } = await supabase
      .from("seller_permissions")
      .upsert(patch as any, { onConflict: "user_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin_sellers"] });
  };

  const prescriptionAccess = (sellers || []).filter((seller) => seller.can_view_prescriptions).length;
  const refundAccess = (sellers || []).filter((seller) => seller.can_request_refund || seller.can_execute_refund).length;

  return (
    <ErpPage>
      <ErpPageHeader
        title="Vendedores"
        description="Controle acesso da equipe comercial e permissões sensíveis de reembolso e receitas."
        eyebrow="Cadastros"
        icon={Users}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <ErpMetricCard label="Vendedores ativos" value={sellers?.length || 0} icon={Users} />
        <ErpMetricCard label="Com acesso a receitas" value={prescriptionAccess} icon={ShieldCheck} />
        <ErpMetricCard label="Com permissão de reembolso" value={refundAccess} icon={ShieldCheck} />
      </div>

      <ErpPanel>
        <ErpPanelHeader title="Conceder acesso" description="Informe o e-mail de uma conta existente para liberar o painel do vendedor." />
        <div className="flex gap-2 p-4">
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
      </ErpPanel>

      <ErpPanel>
        <ErpPanelHeader title="Vendedores ativos" description="Permissões podem ser ajustadas individualmente e têm efeito imediato." />
        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground">Carregando...</div>
        ) : !sellers?.length ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Nenhum vendedor cadastrado ainda.</div>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Pedir reembolso</th>
                  <th className="p-3">Executar reembolso</th>
                  <th className="p-3">Ver receitas</th>
                  <th className="p-3">Aprovar receitas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((seller) => (
                  <tr key={seller.user_id} className="border-t hover:bg-muted/20">
                    <td className="p-3">
                      <div className="font-medium">{seller.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{seller.email}</div>
                      <Badge variant="outline" className="mt-1 text-[10px]">Vendedor</Badge>
                    </td>
                    <td className="p-3">
                      <Switch checked={seller.can_request_refund}
                        onCheckedChange={(value) => void togglePerm(seller, "can_request_refund", value)} />
                    </td>
                    <td className="p-3">
                      <Switch checked={seller.can_execute_refund}
                        onCheckedChange={(value) => void togglePerm(seller, "can_execute_refund", value)} />
                    </td>
                    <td className="p-3">
                      <Switch checked={seller.can_view_prescriptions}
                        onCheckedChange={(value) => void togglePerm(seller, "can_view_prescriptions", value)} />
                    </td>
                    <td className="p-3">
                      <Switch checked={seller.can_approve_prescriptions}
                        onCheckedChange={(value) => void togglePerm(seller, "can_approve_prescriptions", value)} />
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
                              {seller.email} deixará de acessar a área do vendedor. A conta de cliente continua existindo.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void revoke(seller.user_id)}>Revogar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ErpPanel>
    </ErpPage>
  );
}
