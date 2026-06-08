import { LegalPage } from "@/components/LegalPage";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { buildWhatsAppLink } from "@/lib/store";
import { MessageCircle, Mail, MapPin, Clock, Instagram } from "lucide-react";

function formatPhone(raw: string | null | undefined) {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  const local = d.length >= 12 ? d.slice(-11) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

export default function Contact() {
  const { data: s } = useStoreSettings();
  const waRaw = s?.whatsapp || "5583999286000";
  const waLink = buildWhatsAppLink(waRaw, "Olá! Vim pelo site.");
  return (
    <LegalPage title="Fale Conosco">
      <p>
        Nossa equipe está pronta para esclarecer dúvidas sobre produtos, pedidos, receitas e disponibilidade de medicamentos.
      </p>

      <div className="not-prose grid gap-3 mt-6">
        <a
          href={waLink}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-3 rounded-xl border p-4 hover:border-primary/40 transition-colors"
        >
          <span className="rounded-full bg-whatsapp/10 text-whatsapp p-2">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-bold">Atendimento WhatsApp</div>
            <div className="font-bold">{formatPhone(waRaw)}</div>
          </div>
        </a>

        {s?.contact_email && (
          <a
            href={`mailto:${s.contact_email}`}
            className="flex items-center gap-3 rounded-xl border p-4 hover:border-primary/40 transition-colors"
          >
            <span className="rounded-full bg-accent text-primary p-2">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-bold">E-mail</div>
              <div className="font-bold">{s.contact_email}</div>
            </div>
          </a>
        )}

        <div className="flex items-start gap-3 rounded-xl border p-4">
          <span className="rounded-full bg-accent text-primary p-2">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-bold">Endereço</div>
            <div className="font-bold">{s?.address || "Av. Mal. Floriano Peixoto, 4050 - Malvinas, Campina Grande - PB"}</div>
          </div>
        </div>

        {s?.hours && (
          <div className="flex items-start gap-3 rounded-xl border p-4">
            <span className="rounded-full bg-accent text-primary p-2">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-bold">Horário</div>
              <div className="font-bold">{s.hours}</div>
            </div>
          </div>
        )}

        {s?.instagram && (
          <a
            href={s.instagram}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-3 rounded-xl border p-4 hover:border-primary/40 transition-colors"
          >
            <span className="rounded-full bg-accent text-primary p-2">
              <Instagram className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-bold">Instagram</div>
              <div className="font-bold">@atacadaodosmedicamentoscg</div>
            </div>
          </a>
        )}
      </div>
    </LegalPage>
  );
}
