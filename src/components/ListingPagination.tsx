import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
};

function visiblePages(current: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const wanted = [1, totalPages, current - 1, current, current + 1].filter((n) => n >= 1 && n <= totalPages);
  const sorted = Array.from(new Set(wanted)).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

export function ListingPagination({ page, pageSize, total, onPage }: Props) {
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), totalPages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  return (
    <nav aria-label="Paginação de produtos" data-testid="listing-pagination" className="mt-8 flex flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">Mostrando {from}–{to} de {total}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={current <= 1} onClick={() => onPage(current - 1)}>
          Anterior
        </Button>
        {visiblePages(current, totalPages).map((item, index) => item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden="true">…</span>
        ) : (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={item === current ? "default" : "outline"}
            aria-current={item === current ? "page" : undefined}
            aria-label={`Página ${item}`}
            onClick={() => onPage(item)}
          >
            {item}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={current >= totalPages} onClick={() => onPage(current + 1)}>
          Próxima
        </Button>
      </div>
    </nav>
  );
}
