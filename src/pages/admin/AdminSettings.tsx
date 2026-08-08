import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";

type Zone = { min_km: number; max_km: number; fee: number; label?: string };

export default function AdminSettings() {
  const [s, setS] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);

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
      delivery_max_km: Number(s.delivery_max_km || 0),
      delivery_mode: s.delivery_mode || "distance",
      delivery_fee_zones: Array.isArray(s.delivery_fee_zones) ? s.delivery_fee_zones : [],
      pix_discount_enabled: !!s.pix_discount_enabled,
      pix_discount_percentage: Number(s.pix_discount_percentage || 0),
    };
    const { error } = await supabase.from("store_settings").upsert(payload);
    if (error) toast.error(error.message); else toast.success("Configurações salvas");
  };

  const set = (k: string) => (e: any) => setS({ ...s, [k]: e.target.value });

  const zones: Zone[] = Array.isArray(s.delivery_fee_zones) ? s.delivery_fee_zones : [];
  const updateZones = (next: Zone[]) => setS({ ...s, delivery_fee_zones: next });
  const setZone = (i: number, patch: Partial<Zone>) => {
    const next = zones.map((z, idx) => (idx === i ? { ...z, ...patch } : z));
    updateZones(next);
  };
  const addZone = () => {
    const last = zones[zones.length - 1];
    const start = last ? Number(last.max_km) : 0;
    updateZones([...zones, { min_km: start, max_km: start + 3, fee: 0, label: `${start} a ${start + 3} km` }]);
  };
  const removeZone = (i: number) => updateZones(zones.filter((_, idx) => idx !== i));

  const geocodeNow = async () => {
    setGeocoding(true);
    try {
      const { data, error } = await supabase.functions.invoke("geocode-store-address", {
        body: { address: s.address || "" },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error || error?.message || "Falha");
      setS({ ...s, store_lat: (data as any).lat, store_lng: (data as any).lng, store_geocoded_at: new Date().toISOString() });
      toast.success(`Loja localizada: ${(data as any).lat.toFixed(6)}, ${(data as any).lng.toFixed(6)}`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao geocodificar");
    } finally {
      setGeocoding(false);
    }
  };

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

          <TabsContent value="entrega" className="space-y-4 pt-3">
            <div className="bg-muted/40 border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm"><MapPin className="h-4 w-4" /> Origem (loja)</div>
              <p className="text-xs text-muted-foreground">Endereço usado para calcular a distância até o cliente. O endereço da loja vem da aba "Loja".</p>
              <div className="text-xs">
                {s.store_lat != null && s.store_lng != null ? (
                  <>
                    Coordenadas: <span className="font-mono">{Number(s.store_lat).toFixed(6)}, {Number(s.store_lng).toFixed(6)}</span>
                    {s.store_geocoded_at && <span className="text-muted-foreground"> · atualizado em {new Date(s.store_geocoded_at).toLocaleString("pt-BR")}</span>}
                  </>
                ) : (
                  <span className="text-destructive">Origem ainda não geocodificada.</span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={geocodeNow} disabled={geocoding}>
                {geocoding ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Geocodificando…</> : "Recalcular coordenadas do endereço"}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Modo de cálculo do frete</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={s.delivery_mode || "distance"}
                  onChange={(e) => setS({ ...s, delivery_mode: e.target.value })}
                >
                  <option value="distance">Por distância (faixas km)</option>
                  <option value="flat">Taxa fixa (legado)</option>
                </select>
              </div>
              <div className="space-y-1"><Label>Raio máximo de entrega (km)</Label><Input type="number" step="0.5" value={s.delivery_max_km ?? 18} onChange={set("delivery_max_km")} /></div>
              <div className="space-y-1"><Label>Taxa fixa (R$) — fallback</Label><Input type="number" step="0.01" value={s.delivery_fee || 0} onChange={set("delivery_fee")} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Faixas por distância</Label>
                <Button size="sm" variant="outline" onClick={addZone}><Plus className="h-3 w-3 mr-1" /> Adicionar faixa</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto -mx-2 px-2"><table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left p-2">De (km)</th>
                      <th className="text-left p-2">Até (km)</th>
                      <th className="text-left p-2">Valor (R$)</th>
                      <th className="text-left p-2">Rótulo</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.length === 0 && (<tr><td colSpan={5} className="p-3 text-center text-muted-foreground text-xs">Nenhuma faixa cadastrada.</td></tr>)}
                    {zones.map((z, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2"><Input type="number" step="0.5" value={z.min_km} onChange={(e) => setZone(i, { min_km: Number(e.target.value) })} className="h-8" /></td>
                        <td className="p-2"><Input type="number" step="0.5" value={z.max_km} onChange={(e) => setZone(i, { max_km: Number(e.target.value) })} className="h-8" /></td>
                        <td className="p-2"><Input type="number" step="0.01" value={z.fee} onChange={(e) => setZone(i, { fee: Number(e.target.value) })} className="h-8" /></td>
                        <td className="p-2"><Input value={z.label || ""} onChange={(e) => setZone(i, { label: e.target.value })} className="h-8" placeholder="Ex.: Até 3 km" /></td>
                        <td className="p-2 text-right"><Button size="icon" variant="ghost" onClick={() => removeZone(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
              <p className="text-xs text-muted-foreground">Faixas são inclusivas nas duas pontas. Distâncias acima do raio máximo bloqueiam a entrega no checkout.</p>
            </div>

            <div className="space-y-1"><Label>Bairros atendidos (informativo)</Label><Textarea rows={3} value={s.served_neighborhoods || ""} onChange={set("served_neighborhoods")} placeholder="Centro, Catolé, Liberdade..." /></div>
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
