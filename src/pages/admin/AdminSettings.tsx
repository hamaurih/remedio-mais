import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function AdminSettings() {
  const [s, setS] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("store_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
      setS(data || {}); setLoading(false);
    });
  }, []);

  const save = async () => {
    const payload = { ...s, id: 1, delivery_fee: Number(s.delivery_fee || 0) };
    const { error } = await supabase.from("store_settings").upsert(payload);
    if (error) toast.error(error.message); else toast.success("Configurações salvas");
  };

  if (loading) return <div className="p-6">Carregando...</div>;
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-extrabold mb-6">Configurações da loja</h1>
      <div className="bg-card border rounded-xl p-6 shadow-card space-y-3">
        <div className="space-y-1"><Label>WhatsApp (somente números, com DDI)</Label><Input value={s.whatsapp || ""} onChange={(e) => setS({ ...s, whatsapp: e.target.value })} placeholder="5583999286000" /></div>
        <div className="space-y-1"><Label>Endereço</Label><Textarea value={s.address || ""} onChange={(e) => setS({ ...s, address: e.target.value })} /></div>
        <div className="space-y-1"><Label>Instagram (URL)</Label><Input value={s.instagram || ""} onChange={(e) => setS({ ...s, instagram: e.target.value })} /></div>
        <div className="space-y-1"><Label>Horário</Label><Input value={s.hours || ""} onChange={(e) => setS({ ...s, hours: e.target.value })} /></div>
        <div className="space-y-1"><Label>Taxa de entrega padrão</Label><Input type="number" step="0.01" value={s.delivery_fee || 0} onChange={(e) => setS({ ...s, delivery_fee: e.target.value })} /></div>
        <div className="space-y-1"><Label>Título do hero</Label><Input value={s.hero_title || ""} onChange={(e) => setS({ ...s, hero_title: e.target.value })} /></div>
        <div className="space-y-1"><Label>Subtítulo do hero</Label><Textarea value={s.hero_subtitle || ""} onChange={(e) => setS({ ...s, hero_subtitle: e.target.value })} /></div>
        <Button onClick={save}>Salvar</Button>
      </div>
    </div>
  );
}
