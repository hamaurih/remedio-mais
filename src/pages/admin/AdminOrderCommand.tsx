import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ErpMetricCard, ErpPage, ErpPageHeader, ErpPanel, ErpPanelHeader } from "@/components/admin/ErpPageShell";
import { Boxes, CheckCircle2, Clock3, LockKeyhole, RotateCcw, Search, ShieldCheck, FlaskConical } from "lucide-react";

const CHANNEL_LABEL: Record<string,string> = {
  site: "Site", whatsapp: "WhatsApp", balcao: "Balcão", telefone: "Telefone",
  pdv: "PDV", vendedor: "Vendedor", ia: "IA",
};
const STATE_LABEL: Record<string,string> = {
  none: "Sem reserva", reserved: "Reservado", committed: "Baixado",
  released: "Liberado", failed: "Falhou",
};

export default function AdminOrderCommand() {
  const qc = useQueryClient();
  const [search,setSearch] = useState("");
  const [busy,setBusy] = useState<string | null>(null);

  const { data: overview, refetch: refetchOverview } = useQuery({
    queryKey:["admin_order_command_overview"],
    queryFn: async () => {
      const { data,error } = await (supabase as any).rpc("admin_order_command_overview");
      if (error) throw error;
      return data as any;
    },
    staleTime:15_000,
  });

  const { data: pilots = [], refetch: refetchPilots } = useQuery({
    queryKey:["order_command_pilot_orders"],
    queryFn: async () => {
      const { data,error } = await (supabase as any)
        .from("order_command_pilot_orders")
        .select("order_id,enabled,enrolled_at,disabled_at,notes");
      if (error) throw error;
      return data || [];
    },
  });

  const pilotByOrder = useMemo(() => new Map(pilots.map((p:any) => [p.order_id,p])),[pilots]);

  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey:["admin_order_command_orders"],
    queryFn: async () => {
      const { data,error } = await (supabase as any)
        .from("orders")
        .select("id,order_code,created_at,customer_name,total,payment_status,status,order_status,fulfillment_status,sales_channel,source,store_id,inventory_state,inventory_reserved_at,inventory_committed_at,inventory_released_at,inventory_command_version,order_items(id,product_id,product_name,quantity,item_status)")
        .order("created_at",{ascending:false})
        .limit(300);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return orders;
    return orders.filter((o:any) =>
      [o.order_code,o.customer_name,o.sales_channel,o.source,o.payment_status,o.inventory_state]
        .some(v => String(v || "").toLowerCase().includes(t))
    );
  },[orders,search]);

  const refresh = async () => {
    await Promise.all([refetchOverview(),refetchOrders(),refetchPilots()]);
    qc.invalidateQueries({queryKey:["admin_orders"]});
    qc.invalidateQueries({queryKey:["admin_inventory_management"]});
  };

  const setPilot = async (order:any, enabled:boolean) => {
    const message = enabled
      ? `Incluir o pedido ${order.order_code || order.id.slice(0,6)} no piloto do Order Command? Isso habilita comandos somente para este pedido.`
      : `Remover o pedido ${order.order_code || order.id.slice(0,6)} do piloto?`;
    if (!window.confirm(message)) return;

    setBusy(`${order.id}:pilot`);
    const { error } = await (supabase as any).rpc("admin_set_order_command_pilot",{
      _order_id:order.id,
      _enabled:enabled,
      _notes: enabled ? "Piloto controlado por pedido" : "Removido manualmente do piloto",
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(enabled ? "Pedido incluído no piloto." : "Pedido removido do piloto.");
    await refresh();
  };

  const command = async (order:any, action:"reserve"|"commit"|"release") => {
    const pilot = pilotByOrder.get(order.id) as any;
    if (!overview?.enabled && !pilot?.enabled) {
      toast.warning("Este pedido não está habilitado no piloto do Order Command.");
      return;
    }
    if (action === "commit" && order.payment_status !== "approved") {
      toast.error("O pagamento precisa estar aprovado antes da baixa.");
      return;
    }
    if (action === "release" && order.inventory_state === "committed") {
      toast.error("Pedido já baixado exige fluxo de devolução/estorno.");
      return;
    }
    const label = action === "reserve" ? "reservar" : action === "commit" ? "baixar" : "liberar";
    if (!window.confirm(`Confirma ${label} o estoque interno do pedido ${order.order_code || order.id.slice(0,6)}?`)) return;

    setBusy(`${order.id}:${action}`);
    const { data,error } = await (supabase as any).rpc("admin_order_inventory_command",{
      _order_id:order.id,
      _action:action,
      _reason: action === "release" ? "manual_admin_pilot" : null,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    if (data?.ok === false) {
      toast.error(data?.reason === "insufficient_inventory" ? "Estoque interno insuficiente para reservar o pedido." : "Comando não concluído.");
    } else {
      toast.success(action === "reserve" ? "Estoque reservado." : action === "commit" ? "Estoque baixado e piloto encerrado." : "Reserva liberada e piloto encerrado.");
    }
    await refresh();
  };

  const c = overview?.counts || {};

  return (
    <ErpPage className="[&_table]:min-w-[1180px]">
      <ErpPageHeader
        title="Order Command"
        description="Cutover controlado por pedido. O modo global permanece Shadow; somente pedidos inscritos no piloto podem movimentar o estoque interno."
        eyebrow="Vendas e estoque"
        icon={LockKeyhole}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <ErpMetricCard label="Modo global" value={overview?.enabled ? "Controlado" : "Shadow"} icon={ShieldCheck} tone={overview?.enabled ? "warning" : "default"} />
        <ErpMetricCard label="Pedidos piloto" value={overview?.pilot_count ?? 0} icon={FlaskConical} tone={(overview?.pilot_count ?? 0) > 0 ? "warning" : "default"} />
        <ErpMetricCard label="Reservados" value={c.reserved ?? "—"} icon={Clock3} />
        <ErpMetricCard label="Reservas ativas" value={c.active_reservations ?? "—"} icon={Boxes} />
        <ErpMetricCard label="Baixados" value={c.committed ?? "—"} icon={CheckCircle2} />
        <ErpMetricCard label="Liberados" value={c.released ?? "—"} icon={RotateCcw} />
      </div>

      <div className="rounded-xl border bg-card p-4 text-sm">
        <div className="font-bold">Piloto por pedido</div>
        <div className="mt-1 text-muted-foreground">
          O Order Command global continua em Shadow. Para testar produção, inclua manualmente um pedido no piloto; somente esse pedido poderá reservar, baixar ou liberar estoque interno. Ao baixar ou liberar, ele sai do piloto automaticamente. Checkout, Cielo e Trier permanecem fora deste cutover.
        </div>
      </div>

      <ErpPanel>
        <ErpPanelHeader
          title="Pedidos disponíveis para piloto"
          description="Selecione poucos pedidos reais e acompanhe o estado de estoque individualmente."
        />
        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código, cliente, canal, pagamento ou estado..." />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/70 text-left">
              <tr>
                <th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3">Canal</th>
                <th className="p-3">Pagamento</th><th className="p-3">Piloto</th><th className="p-3">Estoque</th>
                <th className="p-3">Itens</th><th className="p-3">Criado</th><th className="p-3">Comandos</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o:any) => {
                const activeItems = (o.order_items || []).filter((i:any)=>i.item_status !== "removido");
                const pilot = pilotByOrder.get(o.id) as any;
                const pilotEnabled = !!pilot?.enabled;
                return (
                  <tr key={o.id} className="border-t align-top">
                    <td className="p-3 font-mono text-xs">{o.order_code || o.id.slice(0,8)}</td>
                    <td className="p-3 font-medium">{o.customer_name}</td>
                    <td className="p-3"><Badge variant="outline">{CHANNEL_LABEL[o.sales_channel] || o.sales_channel || o.source || "—"}</Badge></td>
                    <td className="p-3"><Badge variant={o.payment_status === "approved" ? "default" : "secondary"}>{o.payment_status || "—"}</Badge></td>
                    <td className="p-3"><Badge variant={pilotEnabled ? "secondary" : "outline"}>{pilotEnabled ? "Piloto ativo" : "Fora do piloto"}</Badge></td>
                    <td className="p-3"><Badge variant={o.inventory_state === "failed" ? "destructive" : o.inventory_state === "reserved" ? "secondary" : "outline"}>{STATE_LABEL[o.inventory_state] || o.inventory_state || "Sem reserva"}</Badge></td>
                    <td className="p-3 text-right">{activeItems.reduce((s:number,i:any)=>s+Number(i.quantity||0),0)}</td>
                    <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {!overview?.enabled && !pilotEnabled && o.inventory_state !== "committed" && (
                          <Button size="sm" variant="outline" disabled={busy===`${o.id}:pilot`} onClick={()=>setPilot(o,true)}>Entrar no piloto</Button>
                        )}
                        {!overview?.enabled && pilotEnabled && o.inventory_state !== "reserved" && (
                          <Button size="sm" variant="ghost" disabled={busy===`${o.id}:pilot`} onClick={()=>setPilot(o,false)}>Retirar do piloto</Button>
                        )}
                        {(["none","released","failed",null,undefined] as any[]).includes(o.inventory_state) && (overview?.enabled || pilotEnabled) && (
                          <Button size="sm" variant="outline" disabled={busy===`${o.id}:reserve`} onClick={()=>command(o,"reserve")}>Reservar</Button>
                        )}
                        {o.inventory_state === "reserved" && (overview?.enabled || pilotEnabled) && <>
                          <Button size="sm" disabled={o.payment_status !== "approved" || busy===`${o.id}:commit`} onClick={()=>command(o,"commit")}>Baixar</Button>
                          <Button size="sm" variant="outline" disabled={busy===`${o.id}:release`} onClick={()=>command(o,"release")}>Liberar</Button>
                        </>}
                        {o.inventory_state === "committed" && <span className="text-xs text-muted-foreground">Baixa concluída</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">Nenhum pedido encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </ErpPanel>
    </ErpPage>
  );
}
