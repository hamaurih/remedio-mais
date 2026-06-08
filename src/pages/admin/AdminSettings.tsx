import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    const payload = {
      ...s,
      id: 1,
      delivery_fee: Number(s.delivery_fee || 0),
      pix_discount_enabled: !!s.pix_discount_enabled,
      pix_discount_percentage: Number(s.pix_discount_percentage || 0),
    };
    const { error } = await supabase.from("store_settings").upsert(payload);
    if (error) toast.error(error.message); else toast.success("Configurações salvas");
  };

  const set = (k: string) => (e: any) => setS({ ...s, [k]: e.target.value });

  if (loading) return <div className="p-6">Carregando...</div>;
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-6">Configurações da loja</h1>
      <div className="bg-card border rounded-xl p-6 shadow-card">
        <Tabs defaultValue="loja">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="loja">Loja</TabsTrigger>
            <TabsTrigger value="entrega">Entrega</TabsTrigger>
            <TabsTrigger value="pix">Pix</TabsTrigger>
            <TabsTrigger value="home">Home</TabsTrigger>
            <TabsTrigger value="legal">Legal / Sanitário</TabsTrigger>
          </TabsList>

          <TabsContent value="loja" className="space-y-3 pt-3">
            <div className="space-y-1"><Label>Nome da loja</Label><Input value={s.store_name || ""} onChange={set("store_name")} /></div>
            <div className="space-y-1"><Label>WhatsApp (só números, com DDI)</Label><Input value={s.whatsapp || ""} onChange={set("whatsapp")} placeholder="5583999286000" /></div>
            <div className="space-y-1"><Label>E-mail de contato</Label><Input type="email" value={s.contact_email || ""} onChange={set("contact_email")} placeholder="contato@..." /></div>
            <div className="space-y-1"><Label>Endereço</Label><Textarea value={s.address || ""} onChange={set("address")} /></div>
            <div className="space-y-1"><Label>Horário de funcionamento</Label><Input value={s.hours || ""} onChange={set("hours")} placeholder="Seg a Sáb, 7h às 22h" /></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="space-y-1"><Label>Instagram (URL)</Label><Input value={s.instagram || ""} onChange={set("instagram")} placeholder="https://instagram.com/..." /></div>
              <div className="space-y-1"><Label>Facebook (URL)</Label><Input value={s.facebook || ""} onChange={set("facebook")} placeholder="https://facebook.com/..." /></div>
              <div className="space-y-1"><Label>TikTok (URL)</Label><Input value={s.tiktok || ""} onChange={set("tiktok")} placeholder="https://tiktok.com/@..." /></div>
            </div>
          </TabsContent>

          <TabsContent value="entrega" className="space-y-3 pt-3">
            <div className="space-y-1"><Label>Taxa de entrega padrão (R$)</Label><Input type="number" step="0.01" value={s.delivery_fee || 0} onChange={set("delivery_fee")} /></div>
            <div className="space-y-1"><Label>Bairros atendidos</Label><Textarea rows={4} value={s.served_neighborhoods || ""} onChange={set("served_neighborhoods")} placeholder="Centro, Catolé, Liberdade..." /></div>
          </TabsContent>

          <TabsContent value="pix" className="space-y-3 pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!s.pix_discount_enabled}
                onChange={(e) => setS({ ...s, pix_discount_enabled: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold">Ativar desconto Pix global</span>
            </label>
            <div className="space-y-1">
              <Label>Percentual de desconto Pix (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={s.pix_discount_percentage ?? 0}
                onChange={set("pix_discount_percentage")}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">Usado quando o produto não tem desconto Pix próprio.</p>
            </div>
          </TabsContent>

          <TabsContent value="home" className="space-y-3 pt-3">
            <div className="space-y-1"><Label>Título do hero</Label><Input value={s.hero_title || ""} onChange={set("hero_title")} /></div>
            <div className="space-y-1"><Label>Subtítulo do hero</Label><Textarea value={s.hero_subtitle || ""} onChange={set("hero_subtitle")} /></div>
            <div className="space-y-1"><Label>Texto do rodapé</Label><Textarea value={s.footer_text || ""} onChange={set("footer_text")} /></div>
          </TabsContent>

          <TabsContent value="legal" className="space-y-3 pt-3">
            <div className="space-y-1"><Label>Razão social</Label><Input value={s.legal_name || ""} onChange={set("legal_name")} /></div>
            <div className="space-y-1"><Label>CNPJ</Label><Input value={s.cnpj || ""} onChange={set("cnpj")} /></div>
            <div className="space-y-1"><Label>Inscrição Estadual</Label><Input value={s.state_registration || ""} onChange={set("state_registration")} /></div>
            <div className="space-y-1"><Label>Farmacêutico responsável</Label><Input value={s.pharmacist_name || ""} onChange={set("pharmacist_name")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>CRF</Label><Input value={s.crf || ""} onChange={set("crf")} /></div>
              <div className="space-y-1"><Label>Licença sanitária</Label><Input value={s.sanitary_license || ""} onChange={set("sanitary_license")} /></div>
            </div>
            <div className="space-y-1"><Label>AFE</Label><Input value={s.afe || ""} onChange={set("afe")} /></div>
            <div className="space-y-1"><Label>Aviso sanitário padrão</Label><Textarea value={s.sanitary_notice || ""} onChange={set("sanitary_notice")} placeholder="A persistirem os sintomas..." /></div>
          </TabsContent>
        </Tabs>

        <Button className="mt-6" onClick={save}>Salvar tudo</Button>
      </div>
    </div>
  );
}
