import { useTenant } from "@/hooks/useTenant";
import { selectTenantRows, tenantQueryKey } from "@/lib/tenantQuery";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Notif = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  order_id: string | null;
  read: boolean;
  priority: string | null;
  created_at: string;
};

export function NotificationsBell() {
  const { activeOrganization, activeStore } = useTenant();
  const tenantScope = {
    organizationId: activeOrganization?.id ?? null,
    storeId: activeStore?.id ?? null,
  };
  const { user, isAdmin, isSeller } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const fetchAll = async () => {
    const { data } = await selectTenantRows("admin_notifications", tenantScope, "*")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data || []) as Notif[]);
  };

  useEffect(() => {
    if (!user || (!isAdmin && !isSeller)) return;
    fetchAll();
    const ch = supabase
      .channel("admin_notifications_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, (payload) => {
        const n = payload.new as Notif;
        setItems((prev) => [n, ...prev].slice(0, 30));
        toast.message(n.title, { description: n.message || undefined });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "admin_notifications" }, (payload) => {
        const n = payload.new as Notif;
        setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, isAdmin, isSeller]);

  const unread = items.filter((i) => !i.read).length;

  const markAllRead = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    await supabase.from("admin_notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .in("id", ids);
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
  };

  const markRead = async (id: string) => {
    await supabase.from("admin_notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("id", id);
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
  };

  if (!user || (!isAdmin && !isSeller)) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">Notificações</div>
          <Button size="sm" variant="ghost" onClick={markAllRead} disabled={!unread}>
            <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar todas
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {!items.length ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Nenhuma notificação.</div>
          ) : items.map((n) => (
            <Link
              key={n.id}
              to={n.order_id ? `/admin/pedidos` : "/admin"}
              onClick={() => { markRead(n.id); setOpen(false); }}
              className={`block px-3 py-2 border-b hover:bg-accent transition-colors ${!n.read ? "bg-primary/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold">{n.title}</div>
                {n.priority === "high" && <Badge variant="destructive" className="text-[9px]">alta</Badge>}
              </div>
              {n.message && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</div>}
              <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
