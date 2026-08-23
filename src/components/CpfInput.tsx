import { useId } from "react";
import { CircleAlert, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCpf, isValidCpf, normalizeCpf } from "@/lib/cpf";

type CpfInputProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function CpfInput({
  value,
  onChange,
  id,
  disabled,
  required,
  className,
}: CpfInputProps) {
  const statusId = useId();
  const digits = normalizeCpf(value);
  const complete = digits.length === 11;
  const valid = complete && isValidCpf(digits);
  const invalid = complete && !valid;
  const missingDigits = Math.max(0, 11 - digits.length);

  return (
    <div className="space-y-1.5">
      <Input
        id={id}
        value={formatCpf(value)}
        onChange={(event) => onChange(formatCpf(event.target.value))}
        placeholder="000.000.000-00"
        inputMode="numeric"
        maxLength={14}
        disabled={disabled}
        required={required}
        aria-label="CPF"
        aria-invalid={invalid || undefined}
        aria-describedby={digits.length > 0 ? statusId : undefined}
        className={cn(
          valid &&
            "border-emerald-500 bg-emerald-50/50 pr-10 focus-visible:ring-emerald-500",
          invalid &&
            "border-destructive bg-destructive/5 pr-10 focus-visible:ring-destructive",
          className,
        )}
      />

      {valid && (
        <p id={statusId} className="flex items-center gap-1.5 text-sm font-medium text-emerald-700" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          CPF válido
        </p>
      )}

      {invalid && (
        <p id={statusId} className="flex items-center gap-1.5 text-sm font-medium text-destructive" role="alert">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />
          CPF inválido. Confira os números digitados.
        </p>
      )}

      {!complete && digits.length > 0 && (
        <p id={statusId} className="text-xs text-muted-foreground" role="status">
          {missingDigits === 1
            ? "Falta 1 número para validar o CPF."
            : `Faltam ${missingDigits} números para validar o CPF.`}
        </p>
      )}
    </div>
  );
}
