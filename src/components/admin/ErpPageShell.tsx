import type { ReactNode } from "react";

export function ErpPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto max-w-[1480px] space-y-6 p-4 md:p-6 lg:p-8 ${className}`}>
      {children}
    </div>
  );
}

export function ErpPageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: any;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm md:p-6 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">{title}</h1>
            {description && (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}

export function ErpMetricCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  icon?: any;
  hint?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClasses = {
    default: "border-border bg-card",
    success: "border-emerald-500/25 bg-emerald-50/40",
    warning: "border-amber-500/25 bg-amber-50/40",
    danger: "border-red-500/25 bg-red-50/40",
  }[tone];

  const iconClasses = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm md:p-5 ${toneClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-black tabular-nums tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconClasses}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}

export function ErpPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function ErpPanelHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
      <div>
        <h2 className="font-extrabold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
