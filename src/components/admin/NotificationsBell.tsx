import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, CheckCheck, PartyPopper, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const SOUND_PREF_KEY = "atacadao:sale-sound-enabled";

function playSaleChime() {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const notes = [880, 1175, 1568]; // A5, D6, G6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      const end = start + 0.35;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.05);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch { /* ignore */ }
}

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
  const { user, isAdmin, isSeller } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [alertNotif, setAlertNotif] = useState<Notif | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(SOUND_PREF_KEY) !== "0";
  });
  const seenIds = useRef<Set<string>>(new Set());

  const toggleSound = () => {
    setSoundEnabled((v) => {
      const next = !v;
      try { localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const fetchAll = async () => {
    const { data } = await supabase
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    const list = (data || []) as Notif[];
    setItems(list);
    list.forEach((n) => seenIds.current.add(n.id));
  };

  useEffect(() => {
    if (!user || (!isAdmin && !isSeller)) return;
    fetchAll();
    const ch = supabase
      .channel("admin_notifications_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, (payload) => {
        const n = payload.new as Notif;
        if (seenIds.current.has(n.id)) return;
        seenIds.current.add(n.id);
        setItems((prev) => [n, ...prev].slice(0, 30));
        const isSale = n.type === "order_paid";
        if (isSale) {
          setAlertNotif(n);
          if (soundEnabled) playSaleChime();
        } else {
          toast.message(n.title, { description: n.message || undefined });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "admin_notifications" }, (payload) => {
        const n = payload.new as Notif;
        setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, isAdmin, isSeller, soundEnabled]);

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
