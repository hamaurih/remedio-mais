import { Instagram, Facebook, MessageCircle, MapPin, Phone, Mail, Clock } from "lucide-react";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { Link } from "react-router-dom";
import { buildWhatsAppLink } from "@/lib/store";
import { useMenu, resolveMenuHref, type MenuItem } from "@/hooks/useMenu";
import logoRed from "@/assets/logo-red.png";

function renderFooterLinks(items: MenuItem[], fallback: { label: string; href: string }[]) {
  const list = items.length > 0
    ? items.filter((i) => i.show_on_desktop || i.show_on_mobile).map((i) => ({ label: i.label, href: resolveMenuHref(i), newTab: i.open_in_new_tab }))
    : fallback.map((f) => ({ ...f, newTab: false }));
  return list.map((l) =>
    l.href.startsWith("http") || l.newTab ? (
      <li key={l.href + l.label}>
        <a className="hover:text-primary" href={l.href} target={l.newTab ? "_blank" : undefined} rel={l.newTab ? "noopener" : undefined}>{l.label}</a>
      </li>
    ) : (
      <li key={l.href + l.label}><Link className="hover:text-primary" to={l.href}>{l.label}</Link></li>
    ),
  );
}

// TikTok icon (lucide não tem) – SVG inline
function TikTokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.5 3a5.5 5.5 0 0 0 5 5v3a8.5 8.5 0 0 1-5-1.6V15a6 6 0 1 1-6-6c.34 0 .67.03 1 .09v3.13A3 3 0 1 0 13.5 15V3h3z" />
    </svg>
  );
}

function formatPhone(raw: string | null | undefined) {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  const local = d.length >= 12 ? d.slice(-11) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

export function Footer() {
  const { data: s } = useStoreSettings();
  const { data: institutional = [] } = useMenu("footer_institutional");
  const { data: support = [] } = useMenu("footer_support");
  const { data: footerCats = [] } = useMenu("footer_categories");
  const year = new Date().getFullYear();

  const waRaw = s?.whatsapp || "5583999286000";
  const waLink = buildWhatsAppLink(waRaw, "Olá! Vim pelo site.");
  const waText = formatPhone(waRaw) || "(83) 99928-6000";

  const address =
    s?.address ||
    "Av. Mal. Floriano Peixoto, 4050 - Malvinas, Campina Grande - PB, 58428-111";
  const instagram = s?.instagram || "https://www.instagram.com/atacadaodosmedicamentoscg/";

  const socials = [
    { key: "whatsapp", href: waLink, label: "WhatsApp", icon: MessageCircle, className: "bg-whatsapp text-white hover:opacity-90" },
    { key: "instagram", href: instagram || "", label: "Instagram", icon: Instagram, className: "bg-foreground/5 text-foreground hover:bg-foreground/10" },
    { key: "facebook", href: s?.facebook || "", label: "Facebook", icon: Facebook, className: "bg-foreground/5 text-foreground hover:bg-foreground/10" },
    { key: "tiktok", href: s?.tiktok || "", label: "TikTok", icon: TikTokIcon, className: "bg-foreground/5 text-foreground hover:bg-foreground/10" },
  ].filter((s2) => !!s2.href);

  const Field = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
    <li className="flex gap-2 items-start">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" />
      <span>{children}</span>
    </li>
  );

  return (
    <footer className="mt-16 bg-secondary/40 border-t">
      <div className="container py-10 grid gap-10 md:grid-cols-12">
        {/* Marca + endereço */}
        <div className="md:col-span-4 space-y-4">
          <img src={logoRed} alt="Atacadão dos Medicamentos" className="h-12 w-auto object-contain" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Farmácia em Campina Grande - PB. Atendimento humano, preço justo e regularidade sanitária.
          </p>
          {socials.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              {socials.map((soc) => (
                <a
                  key={soc.key}
                  href={soc.href}
                  target="_blank"
                  rel="noopener"
                  aria-label={soc.label}
                  className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${soc.className}`}
                >
                  <soc.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Contato */}
        <div className="md:col-span-4">
          <h4 className="font-bold mb-3 text-foreground">Contato</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <Field icon={MapPin}>{address}</Field>
            <Field icon={Phone}>
              <a href={waLink} target="_blank" rel="noopener" className="hover:text-primary">
                {waText}
              </a>{" "}
              <span className="text-xs">(WhatsApp)</span>
            </Field>
            {s?.contact_email && (
              <Field icon={Mail}>
                <a className="hover:text-primary" href={`mailto:${s.contact_email}`}>{s.contact_email}</a>
              </Field>
            )}
            {s?.hours && <Field icon={Clock}>{s.hours}</Field>}
          </ul>
        </div>

        {/* Links úteis */}
        <div className="md:col-span-4 grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-bold mb-3 text-foreground">Atendimento</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {renderFooterLinks(support, [
                { label: "Fale Conosco", href: "/fale-conosco" },
                { label: "Envio de Receita", href: "/enviar-receita" },
                { label: "Trocas e Devoluções", href: "/trocas-e-devolucoes" },
                { label: "Política de Reembolso", href: "/politica-de-reembolso" },
              ])}
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-foreground">Institucional</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {renderFooterLinks(institutional, [
                { label: "Política de Privacidade", href: "/politica-de-privacidade" },
                { label: "Termos de Uso", href: "/termos-de-uso" },
              ])}
            </ul>
          </div>
          {footerCats.length > 0 && (
            <div className="col-span-2">
              <h4 className="font-bold mb-3 text-foreground">Categorias</h4>
              <ul className="space-y-2 text-sm text-muted-foreground grid grid-cols-2 gap-x-3">
                {renderFooterLinks(footerCats, [])}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Aviso sanitário — faixa discreta */}
      <div className="border-t bg-muted/30">
        <div className="container py-4 text-center text-xs text-muted-foreground max-w-4xl leading-relaxed">
          Imagens meramente ilustrativas. Preços e promoções sujeitos a alterações e à disponibilidade de estoque.
          Medicamentos com receita ou controle especial passam por análise farmacêutica antes da liberação.{" "}
          <strong className="text-foreground">Não se automedique. Consulte um profissional de saúde.</strong>
        </div>
      </div>

      {/* Dados legais — grid organizado */}
      <div className="border-t bg-background">
        <div className="container py-6">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 text-xs text-muted-foreground">
            {s?.legal_name && (
              <div><div className="font-semibold text-foreground uppercase tracking-wide text-[10px] mb-0.5">Razão social</div>{s.legal_name}</div>
            )}
            {s?.cnpj && (
              <div><div className="font-semibold text-foreground uppercase tracking-wide text-[10px] mb-0.5">CNPJ</div>{s.cnpj}</div>
            )}
            {s?.state_registration && (
              <div><div className="font-semibold text-foreground uppercase tracking-wide text-[10px] mb-0.5">Inscrição Estadual</div>{s.state_registration}</div>
            )}
            {(s?.pharmacist_name || s?.crf) && (
              <div><div className="font-semibold text-foreground uppercase tracking-wide text-[10px] mb-0.5">Farmacêutico responsável</div>{s?.pharmacist_name}{s?.crf ? ` — ${s.crf}` : ""}</div>
            )}
            {s?.sanitary_license && (
              <div><div className="font-semibold text-foreground uppercase tracking-wide text-[10px] mb-0.5">Licença sanitária</div>{s.sanitary_license}</div>
            )}
            {s?.afe && (
              <div><div className="font-semibold text-foreground uppercase tracking-wide text-[10px] mb-0.5">AFE / ANVISA</div>{s.afe}</div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {year} {s?.legal_name || "Farmácia Atacadão dos Medicamentos"}. Todos os direitos reservados.
      </div>
    </footer>
  );
}
