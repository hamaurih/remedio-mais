// Regras de parcelamento sem juros do Atacadão dos Medicamentos (Cielo).
// Tabela combinada com a operação:
//   até R$ 40  → 1x
//   R$ 40+    → até 2x
//   R$ 70+    → até 3x
//   R$ 150+   → até 4x
//   R$ 200+   → até 5x
//   R$ 300+   → até 6x
// Todas as parcelas sem juros. Valor mínimo por parcela = piso da faixa correspondente.

export function maxInstallmentsForTotal(total: number): number {
  const t = Number(total || 0);
  if (t >= 300) return 6;
  if (t >= 200) return 5;
  if (t >= 150) return 4;
  if (t >= 70) return 3;
  if (t >= 40) return 2;
  return 1;
}

export function buildInstallmentOptions(total: number): Array<{ n: number; label: string; each: number }> {
  const max = maxInstallmentsForTotal(total);
  const out: Array<{ n: number; label: string; each: number }> = [];
  for (let n = 1; n <= max; n++) {
    const each = total / n;
    out.push({
      n,
      each,
      label: n === 1
        ? `1x de ${formatBRLnum(total)} à vista`
        : `${n}x de ${formatBRLnum(each)} sem juros`,
    });
  }
  return out;
}

function formatBRLnum(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
