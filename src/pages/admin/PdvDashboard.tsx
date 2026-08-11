import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_LABELS, PosPaymentMethod, brl } from "@/lib/pos";

const db = supabase as any;

export default function PdvDashboard() {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [openSessions, setOpenSessions] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);

  useEffect(() => {
    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const iso = start.toISOString();
      const [s, sess] = await Promise.all([
        db.from("pos_sales").select("id,sale_number,total,operator_id,created_at,status").gte("created_at", iso).neq("status", "cancelled"),
        db.from("cash_register_sessions").select("id").eq("status", "open"),
      ]);
      const rows = (s.data as any[]) || [];
      setSales(rows);
      setOpenSessions(((sess.data as any[]) || []).length);
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const [p, it] = await Promise.all([
          db.from("pos_sale_payments").select("method,amount,sale_id").in("sale_id", ids),
          db.from("pos_sale_items").select("quantity,sale_id").in("sale_id", ids),
        ]);
        setPayments(((p.data as any[]) || []));
        setItemsCount(((it.data as any[]) || []).reduce((a, r) => a + Number(r.quantity || 0), 0));
      } else {
        setPayments([]);
        setItemsCount(0);
      }
      setLoading(false);
    })();
  }, []);

  const revenue = sales.reduce((a, r) => a + Number(r.total || 0), 0);
  const ticket = sales.length ? revenue / sales.length : 0;
  const byMethod = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] || 0) + Number(p.amount || 0);
    return acc;
  }, {});
  const byOperator = sales.reduce<Record<string, { count: number; total: number }>>((acc, s) => {
    const k = s.operator_id || "—";
    acc[k] = acc[k] || { count: 0, total: 0 };
    acc[k].count += 1;
    acc[k].total += Number(s.total || 0);
    return acc;
  }, {});

  if (loading) return <div className="p-10 text-center">Carregando indicadores...</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-extrabold">PDV — Indicadores de hoje</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Vendas do dia" value={String(sales.length)} />
        <Kpi label="Faturamento" value={brl(revenue)} />
        <Kpi label="Ticket médio" value={brl(ticket)} />
        <Kpi label="Itens vendidos" value={String(itemsCount)} />
        <Kpi label="Caixas abertos" value={String(openSessions)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="font-bold mb-2">Por forma de pagamento</div>
          {Object.keys(byMethod).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem vendas hoje.</p>
          ) : (
            Object.entries(byMethod).map(([m, v]) => (
              <div key={m} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{PAYMENT_LABELS[m as PosPaymentMethod] || m}</span>
                <span className="font-semibold">{brl(v)}</span>
              </div>
            ))
          )}
        </Card>
        <Card className="p-4">
          <div className="font-bold mb-2">Por operador</div>
          {Object.keys(byOperator).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem vendas hoje.</p>
          ) : (
            Object.entries(byOperator).map(([op, v]) => (
              <div key={op} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span className="truncate max-w-[60%]">{op}</span>
                <span className="font-semibold">{v.count} venda(s) · {brl(v.total)}</span>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </Card>
  );
}
