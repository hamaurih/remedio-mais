import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, Wand2, Save, X } from "lucide-react";
import { toast } from "sonner";

type TemplateKey =
  | "hero-horizontal"
  | "promo-vertical"
  | "mosaic-small"
  | "campanha-tematica"
  | "card-produto";

type Effects = {
  gradient: boolean;
  confetti: boolean;
  blocks: boolean;
  pedestal: boolean;
  badge: boolean;
};

type Config = {
  template: TemplateKey;
  title: string;
  subtitle: string;
  promoText: string;
  discount: string;
  selo: string;
  ctaText: string;
  ctaLink: string;
  placement: "hero" | "mosaico" | "secundario";
  images: string[];
  effects: Effects;
};

const TEMPLATES: { v: TemplateKey; l: string; w: number; h: number; desc: string }[] = [
  { v: "hero-horizontal", l: "Banner horizontal principal", w: 1600, h: 600, desc: "Ideal para HeroSlider" },
  { v: "promo-vertical", l: "Banner vertical promocional", w: 600, h: 900, desc: "Lateral / mobile" },
  { v: "mosaic-small", l: "Banner mosaico pequeno", w: 800, h: 500, desc: "Bloco do mosaico" },
  { v: "campanha-tematica", l: "Banner de campanha temática", w: 1600, h: 700, desc: "Datas comemorativas" },
  { v: "card-produto", l: "Card promocional de produto", w: 600, h: 700, desc: "Destaque de produto" },
];

const initial: Config = {
  template: "hero-horizontal",
  title: "Até 50% OFF em Genéricos",
  subtitle: "Economia de verdade na sua farmácia de bairro",
  promoText: "Frete grátis na entrega local",
  discount: "50",
  selo: "OFERTA",
  ctaText: "Aproveitar agora",
  ctaLink: "/categoria/medicamentos",
  placement: "hero",
  images: [],
  effects: { gradient: true, confetti: true, blocks: true, pedestal: true, badge: true },
};

export default function AdminBannerGenerator() {
  const navigate = useNavigate();
  const previewRef = useRef<HTMLDivElement>(null);
  const [cfg, setCfg] = useState<Config>(initial);
  const [saving, setSaving] = useState(false);

  const tpl = TEMPLATES.find((t) => t.v === cfg.template)!;

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 4 - cfg.images.length);
    const urls: string[] = [];
    for (const f of arr) {
      try {
        const path = `gen/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error } = await supabase.storage.from("banners").upload(path, f);
        if (error) throw error;
        urls.push(supabase.storage.from("banners").getPublicUrl(path).data.publicUrl);
      } catch (e: any) {
        toast.error(`Falha ao enviar ${f.name}: ${e.message}`);
      }
    }
    setCfg((c) => ({ ...c, images: [...c.images, ...urls].slice(0, 4) }));
  };

  const removeImage = (i: number) =>
    setCfg((c) => ({ ...c, images: c.images.filter((_, idx) => idx !== i) }));

  const exportAndSave = async () => {
    if (!previewRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(previewRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `banner-${Date.now()}.png`, { type: "image/png" });
      const path = `gerados/${Date.now()}-${cfg.template}.png`;
      const { error: upErr } = await supabase.storage.from("banners").upload(path, file);
      if (upErr) throw upErr;
      const url = supabase.storage.from("banners").getPublicUrl(path).data.publicUrl;

      const { error: insErr } = await supabase.from("banners").insert({
        title: cfg.title,
        subtitle: cfg.subtitle,
        cta_text: cfg.ctaText,
        link: cfg.ctaLink,
        image_url: url,
        mobile_image_url: url,
        placement: cfg.placement,
        position: 0,
        active: true,
      });
      if (insErr) throw insErr;

      toast.success("Banner gerado e publicado!");
      navigate("/admin/banners");
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/banners"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-primary" /> Gerador de Banner
        </h1>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        {/* CONFIG PANEL */}
        <div className="space-y-4 bg-card border rounded-xl p-4 shadow-card max-h-[80vh] overflow-y-auto">
          <div className="space-y-1">
            <Label>Template</Label>
            <Select value={cfg.template} onValueChange={(v) => setCfg({ ...cfg, template: v as TemplateKey })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.v} value={t.v}>{t.l} · {t.w}×{t.h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{tpl.desc}</p>
          </div>

          <div className="space-y-1">
            <Label>Imagens de produto (até 4)</Label>
            <div className="grid grid-cols-4 gap-2">
              {cfg.images.map((u, i) => (
                <div key={i} className="relative aspect-square bg-secondary rounded">
                  <img src={u} className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {cfg.images.length < 4 && (
                <label className="aspect-square border-2 border-dashed rounded flex items-center justify-center cursor-pointer hover:bg-accent">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="space-y-1"><Label>Título</Label>
            <Input value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} /></div>
          <div className="space-y-1"><Label>Subtítulo</Label>
            <Input value={cfg.subtitle} onChange={(e) => setCfg({ ...cfg, subtitle: e.target.value })} /></div>
          <div className="space-y-1"><Label>Texto promocional</Label>
            <Textarea rows={2} value={cfg.promoText} onChange={(e) => setCfg({ ...cfg, promoText: e.target.value })} /></div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Desconto %</Label>
              <Input value={cfg.discount} onChange={(e) => setCfg({ ...cfg, discount: e.target.value })} /></div>
            <div className="space-y-1"><Label>Selo</Label>
              <Input value={cfg.selo} onChange={(e) => setCfg({ ...cfg, selo: e.target.value })} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>CTA</Label>
              <Input value={cfg.ctaText} onChange={(e) => setCfg({ ...cfg, ctaText: e.target.value })} /></div>
            <div className="space-y-1"><Label>Link</Label>
              <Input value={cfg.ctaLink} onChange={(e) => setCfg({ ...cfg, ctaLink: e.target.value })} /></div>
          </div>

          <div className="space-y-1">
            <Label>Publicar em</Label>
            <Select value={cfg.placement} onValueChange={(v) => setCfg({ ...cfg, placement: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hero">Hero principal</SelectItem>
                <SelectItem value="mosaico">Mosaico</SelectItem>
                <SelectItem value="secundario">Banner secundário</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Efeitos visuais</Label>
            {(Object.keys(cfg.effects) as (keyof Effects)[]).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-sm capitalize">{labelOf(k)}</span>
                <Switch
                  checked={cfg.effects[k]}
                  onCheckedChange={(v) => setCfg({ ...cfg, effects: { ...cfg.effects, [k]: v } })}
                />
              </div>
            ))}
          </div>

          <Button className="w-full" onClick={exportAndSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Gerando..." : "Gerar banner e publicar"}
          </Button>
        </div>

        {/* PREVIEW */}
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Preview em tempo real · {tpl.w}×{tpl.h}px (escalado para caber)
          </div>
          <div className="bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)] bg-[length:24px_24px] rounded-xl p-6 overflow-auto">
            <div className="mx-auto" style={{ width: "100%", maxWidth: tpl.w, aspectRatio: `${tpl.w}/${tpl.h}` }}>
              <div
                ref={previewRef}
                className="relative w-full h-full overflow-hidden rounded-xl"
                style={{ aspectRatio: `${tpl.w}/${tpl.h}` }}
              >
                <BannerTemplate cfg={cfg} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function labelOf(k: keyof Effects) {
  return ({
    gradient: "Gradiente de fundo",
    confetti: "Confetes promocionais",
    blocks: "Blocos de oferta",
    pedestal: "Pedestal / sombra",
    badge: "Selo de desconto",
  } as Record<keyof Effects, string>)[k];
}

/* ============== TEMPLATES ============== */

function BannerTemplate({ cfg }: { cfg: Config }) {
  switch (cfg.template) {
    case "promo-vertical": return <PromoVertical cfg={cfg} />;
    case "mosaic-small": return <MosaicSmall cfg={cfg} />;
    case "campanha-tematica": return <CampanhaTematica cfg={cfg} />;
    case "card-produto": return <CardProduto cfg={cfg} />;
    default: return <HeroHorizontal cfg={cfg} />;
  }
}

function Background({ cfg, scheme = "primary" }: { cfg: Config; scheme?: "primary" | "warm" | "fresh" }) {
  const grad = cfg.effects.gradient
    ? scheme === "warm"
      ? "linear-gradient(135deg, hsl(20 90% 55%) 0%, hsl(0 80% 50%) 60%, hsl(340 70% 45%) 100%)"
      : scheme === "fresh"
        ? "linear-gradient(135deg, hsl(170 70% 45%) 0%, hsl(200 80% 50%) 60%, hsl(220 70% 45%) 100%)"
        : "linear-gradient(135deg, hsl(0 80% 50%) 0%, hsl(355 75% 45%) 55%, hsl(20 80% 50%) 100%)"
    : "hsl(0 0% 98%)";
  return (
    <>
      <div className="absolute inset-0" style={{ background: grad }} />
      {cfg.effects.confetti && <Confetti />}
      {cfg.effects.blocks && (
        <>
          <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-3xl rotate-12 bg-white/10" />
          <div className="absolute right-10 top-6 w-24 h-24 rounded-2xl rotate-6 bg-white/15" />
        </>
      )}
    </>
  );
}

function Confetti() {
  const dots = Array.from({ length: 24 });
  return (
    <div className="absolute inset-0 pointer-events-none">
      {dots.map((_, i) => {
        const colors = ["#fde68a", "#fca5a5", "#86efac", "#93c5fd", "#f9a8d4"];
        const c = colors[i % colors.length];
        const left = (i * 53) % 100;
        const top = (i * 37) % 100;
        const size = 6 + (i % 4) * 3;
        const rot = (i * 23) % 360;
        return (
          <span
            key={i}
            className="absolute rounded-sm"
            style={{
              left: `${left}%`, top: `${top}%`, width: size, height: size * 0.5,
              background: c, transform: `rotate(${rot}deg)`, opacity: 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

function Pedestal({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-[70%] h-3 rounded-[50%] bg-black/30 blur-md" />
    </div>
  );
}

function DiscountBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="absolute top-6 right-6 z-10">
      <div className="relative bg-yellow-400 text-yellow-950 font-extrabold rounded-full w-28 h-28 flex flex-col items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.35)] border-4 border-white rotate-[-8deg]">
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        <span className="text-3xl leading-none">{value}%</span>
        <span className="text-[10px] uppercase">OFF</span>
      </div>
    </div>
  );
}

function CTAButton({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-2 bg-white text-primary font-extrabold px-5 py-3 rounded-full shadow-lg">
      {text} →
    </span>
  );
}

function ProductImages({ urls, max = 3, size = "w-[42%]" }: { urls: string[]; max?: number; size?: string }) {
  const list = urls.slice(0, max);
  if (list.length === 0) {
    return <div className={`${size} aspect-square bg-white/10 rounded-2xl flex items-center justify-center text-white/60 text-sm`}>Suba imagens de produto</div>;
  }
  return (
    <div className="flex items-end gap-3">
      {list.map((u, i) => (
        <Pedestal key={i}>
          <img
            src={u}
            crossOrigin="anonymous"
            className={`${size} max-w-[260px] aspect-square object-contain drop-shadow-2xl`}
            style={{ transform: `translateY(${i % 2 === 0 ? 0 : -10}px)` }}
          />
        </Pedestal>
      ))}
    </div>
  );
}

/* ----- Templates ----- */
function HeroHorizontal({ cfg }: { cfg: Config }) {
  return (
    <div className="absolute inset-0 text-white">
      <Background cfg={cfg} />
      {cfg.effects.badge && <DiscountBadge value={cfg.discount} label={cfg.selo} />}
      <div className="relative z-10 h-full flex items-center justify-between px-12 gap-8">
        <div className="max-w-[55%] space-y-3">
          <span className="inline-block text-xs font-bold uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full">{cfg.selo}</span>
          <h2 className="text-5xl font-extrabold leading-tight drop-shadow">{cfg.title}</h2>
          <p className="text-lg opacity-95">{cfg.subtitle}</p>
          <p className="text-sm opacity-80">{cfg.promoText}</p>
          <div className="pt-2"><CTAButton text={cfg.ctaText} /></div>
        </div>
        <div className="flex-1 flex justify-end items-end h-full pb-8">
          <ProductImages urls={cfg.images} max={3} size="w-40" />
        </div>
      </div>
    </div>
  );
}

function PromoVertical({ cfg }: { cfg: Config }) {
  return (
    <div className="absolute inset-0 text-white">
      <Background cfg={cfg} scheme="warm" />
      {cfg.effects.badge && <DiscountBadge value={cfg.discount} label={cfg.selo} />}
      <div className="relative z-10 h-full flex flex-col items-center text-center px-6 py-8 gap-4">
        <span className="text-xs font-bold uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full">{cfg.selo}</span>
        <h2 className="text-4xl font-extrabold leading-tight drop-shadow">{cfg.title}</h2>
        <p className="opacity-95">{cfg.subtitle}</p>
        <div className="flex-1 flex items-end">
          <ProductImages urls={cfg.images} max={2} size="w-32" />
        </div>
        <p className="text-sm opacity-80">{cfg.promoText}</p>
        <CTAButton text={cfg.ctaText} />
      </div>
    </div>
  );
}

function MosaicSmall({ cfg }: { cfg: Config }) {
  return (
    <div className="absolute inset-0 text-white">
      <Background cfg={cfg} scheme="fresh" />
      <div className="relative z-10 h-full flex items-center justify-between px-6">
        <div className="space-y-2 max-w-[60%]">
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest bg-white/20 px-2 py-1 rounded">{cfg.selo}</span>
          <h3 className="text-2xl font-extrabold leading-tight">{cfg.title}</h3>
          <p className="text-xs opacity-90">{cfg.subtitle}</p>
          <span className="inline-flex bg-white text-primary text-xs font-bold px-3 py-1.5 rounded-full">{cfg.ctaText} →</span>
        </div>
        <ProductImages urls={cfg.images} max={1} size="w-32" />
      </div>
    </div>
  );
}

function CampanhaTematica({ cfg }: { cfg: Config }) {
  return (
    <div className="absolute inset-0 text-white">
      <Background cfg={cfg} scheme="warm" />
      {cfg.effects.confetti && <Confetti />}
      {cfg.effects.badge && <DiscountBadge value={cfg.discount} label={cfg.selo} />}
      <div className="relative z-10 h-full flex items-center justify-center text-center px-12">
        <div className="space-y-4 max-w-3xl">
          <span className="inline-block text-xs font-bold uppercase tracking-widest bg-white/25 px-4 py-1.5 rounded-full">Campanha {cfg.selo}</span>
          <h2 className="text-6xl font-extrabold leading-none drop-shadow">{cfg.title}</h2>
          <p className="text-xl opacity-95">{cfg.subtitle}</p>
          <p className="opacity-80">{cfg.promoText}</p>
          <div className="pt-3"><CTAButton text={cfg.ctaText} /></div>
        </div>
      </div>
    </div>
  );
}

function CardProduto({ cfg }: { cfg: Config }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-white" />
      {cfg.effects.gradient && (
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, hsl(0 80% 95%) 0%, #fff 60%)" }} />
      )}
      {cfg.effects.confetti && <Confetti />}
      {cfg.effects.badge && <DiscountBadge value={cfg.discount} label={cfg.selo} />}
      <div className="relative z-10 h-full flex flex-col items-center justify-between px-6 py-8 text-center">
        <span className="inline-block text-[11px] font-bold uppercase tracking-widest bg-primary text-primary-foreground px-3 py-1 rounded-full">{cfg.selo}</span>
        <div className="flex-1 flex items-center">
          <ProductImages urls={cfg.images} max={1} size="w-56" />
        </div>
        <div className="space-y-1">
          <h3 className="text-2xl font-extrabold text-foreground">{cfg.title}</h3>
          <p className="text-sm text-muted-foreground">{cfg.subtitle}</p>
          <p className="text-xs text-muted-foreground">{cfg.promoText}</p>
        </div>
        <span className="inline-flex bg-primary text-primary-foreground font-extrabold px-5 py-2.5 rounded-full shadow">
          {cfg.ctaText} →
        </span>
      </div>
    </div>
  );
}
