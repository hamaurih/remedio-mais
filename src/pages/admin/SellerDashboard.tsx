import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CreditCard, FileText, ShoppingBag, Store, UserRound, BellRing } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type AccessCardProps = {
  to: string;
  title: string;
  description: string;
  icon: any;
  primary?: boolean;
};

function AccessCard({ to, title, description, icon: Icon, primary = false }: AccessCardProps) {
  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-accent text-primary flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-extrabold text-lg">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      <Button asChild className="mt-auto" variant={primary ? "default" : "outline"}>
        <Link to={to}>Acessar</Link>
      </Button>
    </Card>
  );
}

export default function SellerDashboard() {
  const { user, profile } = useAuth();
  const [canViewPrescriptions, setCanViewPrescriptions] = useState(false);
  const [canApprovePrescriptions, setCanApprovePrescriptions] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.id) return;

    db.from("seller_permissions")
      .select("can_view_prescriptions,can_approve_prescriptions")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (!active) return;
        setCanViewPrescriptions(Boolean(data?.can_view_prescriptions));
        setCanApprovePrescriptions(Boolean(data?.can_approve_prescriptions));
      });

    return () => { active = false; };
  }, [user?.id]);

  const displayName = (profile?.full_name || user?.user_metadata?.full_name || "Vendedor").toString().trim() || "Vendedor";
  const canAccessPrescriptions = canViewPrescriptions || canApprovePrescriptions;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
            <Store className="h-4 w-4" /> Área do vendedor
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Olá, {displayName}</h1>
          <p className="text-muted-foreground mt-1">Acesse rapidamente as rotinas de atendimento, venda e acompanhamento de pedidos.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold bg-card self-start">
          <UserRound className="h-4 w-4 text-primary" /> Perfil: Vendedor
        </div>
      </div>

      <Card className="p-4 border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3">
          <BellRing className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <div className="font-extrabold">Alertas em tempo real ativos</div>
            <p className="text-sm text-muted-foreground mt-1">
              Novas vendas pagas aparecem com popup e som. {canApprovePrescriptions ? "Receitas novas também geram alerta para análise e aprovação." : "O administrador pode liberar alertas de receitas para esta conta."}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AccessCard
          to="/admin/pdv"
          title="Nova venda / PDV"
          description="Abra o ponto de venda para registrar uma venda e receber o pagamento."
          icon={CreditCard}
          primary
        />
        <AccessCard
          to="/admin/pedidos"
          title="Pedidos"
          description="Consulte os pedidos da loja e acompanhe o atendimento de cada venda."
          icon={ShoppingBag}
        />
        <AccessCard
          to="/admin/pdv/indicadores"
          title="Indicadores do PDV"
          description="Acompanhe as vendas e os principais números operacionais do dia."
          icon={BarChart3}
        />
        {canAccessPrescriptions && (
          <AccessCard
            to="/admin/receitas"
            title={canApprovePrescriptions ? "Aprovar receitas" : "Receitas"}
            description={canApprovePrescriptions
              ? "Abra a fila de receitas recebidas, analise o arquivo e aprove ou recuse a solicitação."
              : "Consulte receitas quando esta permissão estiver liberada para sua conta."}
            icon={FileText}
          />
        )}
      </div>

      <Card className="p-5">
        <h2 className="font-extrabold">Seu acesso é operacional</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configurações administrativas, cadastros sensíveis e gestão geral da loja permanecem restritos ao administrador.
          Acesso e aprovação de receitas continuam controlados individualmente por vendedor.
        </p>
      </Card>
    </div>
  );
}
