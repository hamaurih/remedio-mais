import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, CheckCheck, PartyPopper, FileCheck2, History, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const SOUND_PREF_KEY = "atacadao:operational-alert-sound-enabled";

function playToneSequence(notes: Array<{ frequency: number; offset: number; duration: number }>) {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    void ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    notes.forEach(({ frequency, offset, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const start = now + offset;
      const end = start + duration;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.05);
    });

    const maxEnd = Math.max(...notes.map((n) => n.offset + n.duration), 1);
    setTimeout(() => ctx.close().catch(() => {}), (maxEnd + 0.8) * 1000);
  } catch {
    // Alguns navegadores bloqueiam áudio até a primeira interação do usuário.
  }
}

function playSaleChime() {
  playToneSequence([
    { frequency: 880, offset: 0, duration: 0.32 },
    { frequency: 1175, offset: 0.18, duration: 0.32 },
    { frequency: 1568, offset: 0.36, duration: 0.45 },
  ]);
}

function playPrescriptionChime() {
  playToneSequence([
    { frequency: 660, offset: 0, duration: 0.28 },
    { frequency: 990, offset: 0.22, duration: 0.28 },
    { frequency: 660, offset: 0.48, duration: 0.4 },
  ]);
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
  metadata?: Record<string, unknown> | null;
};

function isOperationalAlert(n: Notif) {
  return n.type === "order_paid" || n.type === "prescription_received";
}

function destinationFor(n: Notif) {
  if (n.type === "prescription_received") return "/admin/receitas";
  if (n.order_id) return "/admin/pedidos";
  return "/admin";
}

export function NotificationsBell() {
  const { user, isAdmin, isSeller } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [alertQueue, setAlertQueue] = useState<Notif[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const current = localStorage.getItem(SOUND_PREF_KEY);
    if (current !== null) return current !== "0";
    return localStorage.getItem("atacadao:sale-sound-enabled") !== "0";
  });
  const seenIds = useRef<Set<string>>(new Set());

  const currentAlert = alertQueue[0] || null;
  const isPrescriptionAlert = currentAlert?.type === "prescription_received";

  const toggleSound = () => {
    setSoundEnabled((value) => {
      const next = !value;
      try { localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      if (next) playSaleChime();
      return next;
    });
  };

  const fetchAll = async () => {
    if (!user?.id) return;
    let query = supabase
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    query = isAdmin
      ? query.eq("role_target", "admin")
      : query.eq("target_user_id", user.id);

    const { data } = await query;
    const list = (data || []) as Notif[];
    setItems(list);
    list.forEach((n) => seenIds.current.add(n.id));
  };

  const enqueueAlert = (n: Notif) => {
    setAlertQueue((prev) => prev.some((x) => x.id === n.id) ? prev : [...prev, n]);
    if (!soundEnabled) return;
    if (n.type === "prescription_received") playPrescriptionChime();
    else playSaleChime();
  };

  useEffect(() => {
    if (!user || (!isAdmin && !isSeller)) return;
    void fetchAll();

    const realtimeFilter = isAdmin
      ? "role_target=eq.admin"
      : `target_user_id=eq.${user.id}`;

    const ch = supabase
      .channel(`admin_notifications_live:${user.id}:${isAdmin ? "admin" : "seller"}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "admin_notifications",
        filter: realtimeFilter,
      }, (payload) => {
        const n = payload.new as Notif;
        if (seenIds.current.has(n.id)) return;
        seenIds.current.add(n.id);
        setItems((prev) => [n, ...prev].slice(0, 30));

        if (isOperationalAlert(n)) {
          enqueueAlert(n);
        } else {
          toast.message(n.title, { description: n.message || undefined });
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "admin_notifications",
        filter: realtimeFilter,
      }, (payload) => {
        const n = payload.new as Notif;
        setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)));
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user?.id, isAdmin, isSeller, soundEnabled]);

  useEffect(() => {
    if (!currentAlert) return;
    const original = document.title;
    const alertTitle = isPrescriptionAlert ? "💊 RECEITA PARA APROVAR" : "🔔 NOVA VENDA";
    let alternate = false;
    document.title = alertTitle;
    const timer = window.setInterval(() => {
      alternate = !alternate;
      document.title = alternate ? alertTitle : original;
    }, 900);
    return () => {
      window.clearInterval(timer);
      document.title = original;
    };
  }, [currentAlert?.id, isPrescriptionAlert]);

  const unread = items.filter((i) => !i.read).length;
  const visibleItems = showHistory ? items : items.filter((i) => !i.read);

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

  const dismissCurrent = async () => {
    if (!currentAlert) return;
    await markRead(currentAlert.id);
    setAlertQueue((prev) => prev.filter((n) => n.id !== currentAlert.id));
  };

  const openCurrent = async () => {
    if (!currentAlert) return;
    const destination = destinationFor(currentAlert);
    await dismissCurrent();
    navigate(destination);
  };

  if (!user || (!isAdmin && !isSeller)) return null;

  return (
    <>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setShowHistory(false); }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className={`relative ${unread > 0 ? "animate-pulse" : ""}`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="flex items-center justify-between px-3 py-2 border-b gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{showHistory ? "Histórico" : "Notificações pendentes"}</div>
              {!showHistory && <div className="text-[10px] text-muted-foreground">Somente itens que ainda exigem atenção</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant={showHistory ? "secondary" : "ghost"}
                onClick={() => setShowHistory((v) => !v)}
                title={showHistory ? "Voltar para pendentes" : "Ver histórico"}
              >
                <History className="h-3.5 w-3.5 mr-1" /> {showHistory ? "Pendentes" : "Histórico"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleSound}
                title={soundEnabled ? "Som dos alertas ativado" : "Som dos alertas desativado"}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </Button>
              {!showHistory && (
                <Button size="sm" variant="ghost" onClick={markAllRead} disabled={!unread} title="Marcar todas como lidas">
                  <CheckCheck className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {!visibleItems.length ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {showHistory ? "Nenhuma notificação no histórico." : "Nenhuma notificação pendente."}
              </div>
            ) : visibleItems.map((n) => (
              <Link
                key={n.id}
                to={destinationFor(n)}
                onClick={() => { void markRead(n.id); setOpen(false); setShowHistory(false); }}
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

      {currentAlert && (
        <div
          className={`fixed inset-0 z-[49] pointer-events-none animate-pulse ${isPrescriptionAlert ? "bg-amber-500/10" : "bg-primary/10"}`}
          aria-hidden="true"
        />
      )}

      <Dialog open={!!currentAlert} onOpenChange={(nextOpen) => { if (!nextOpen) void dismissCurrent(); }}>
        <DialogContent
          className={`max-w-md border-4 shadow-2xl ${isPrescriptionAlert ? "border-amber-500" : "border-primary"}`}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full mb-2 animate-pulse ${isPrescriptionAlert ? "bg-amber-500/15" : "bg-primary/10"}`}>
              {isPrescriptionAlert
                ? <FileCheck2 className="h-10 w-10 text-amber-600" />
                : <PartyPopper className="h-10 w-10 text-primary" />}
            </div>
            <DialogTitle className="text-center text-2xl">
              {currentAlert?.title || (isPrescriptionAlert ? "Receita para aprovar!" : "Venda realizada!")}
            </DialogTitle>
            <DialogDescription className="text-center text-base pt-2">
              {currentAlert?.message || (isPrescriptionAlert
                ? "Uma nova receita está aguardando análise."
                : "Um novo pedido foi pago.")}
            </DialogDescription>
            {alertQueue.length > 1 && (
              <div className="text-center text-xs font-semibold text-muted-foreground pt-2">
                + {alertQueue.length - 1} alerta(s) aguardando
              </div>
            )}
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="outline" onClick={() => void dismissCurrent()}>
              Confirmar e fechar
            </Button>
            <Button onClick={() => void openCurrent()}>
              {isPrescriptionAlert ? "Analisar receita" : "Ver pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
