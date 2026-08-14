import { Lock, ShieldCheck } from "lucide-react";

type Props = {
  /** "inline" = linha compacta; "card" = bloco destacado. */
  variant?: "inline" | "card";
  className?: string;
};

/**
 * Selo de conexão segura (cadeado). Mostra que a navegação usa HTTPS/TLS
 * e que os dados de pagamento são criptografados.
 */
export function SecureBadge({ variant = "inline", className = "" }: Props) {
  if (variant === "card") {
    return (
      <div
        className={`rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-3 ${className}`}
      >
        <div className="rounded-full bg-emerald-600 text-white p-2 shrink-0">
          <Lock className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="text-[13px] leading-snug text-emerald-900">
          <p className="font-semibold">Conexão segura (HTTPS)</p>
          <p className="text-emerald-800">
            Seus dados são protegidos por criptografia TLS. O pagamento é processado
            pela Cielo e não armazenamos os dados do seu cartão.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[12px] text-emerald-800 ${className}`}
    >
      <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
      <span>Site seguro · dados criptografados (HTTPS)</span>
    </div>
  );
}
