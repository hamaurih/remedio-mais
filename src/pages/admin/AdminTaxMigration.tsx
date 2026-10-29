import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Calculator } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ErpPage, ErpPageHeader } from "@/components/admin/ErpPageShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  simulateProductTax,
  classifyTaxProduct,
  loadTaxCatalog,
  summarizeTaxCatalog,
  taxMargin,
  parseTaxBase,
  TaxProduct,
  tax_migration_preview,
  taxMigrationMode,
} from "@/lib/taxMigration";

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminTaxMigration() {
  const { user, isAdmin, loading } = useAuth();
  const mode = taxMigrationMode(tax_migration_preview, Date.now());
  if (loading)
    return (
      <ErpPage>
        <p role="status">Carregando permissões...</p>
      </ErpPage>
    );
  if (!isAdmin || !user || mode === "off")
    return <Navigate to="/admin" replace />;
  return <MigrationSimulator key={user.id} userId={user.id} />;
}

function MigrationSimulator({ userId }: { userId: string }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [regime, setRegime] = useState<"presumido" | "real">("presumido");
  const [reducedIbs, setReducedIbs] = useState(true);
  const [split, setSplit] = useState("100");
  const [onlyChanges, setOnlyChanges] = useState(false);
  const catalog = useQuery({
    queryKey: ["tax-migration-catalog", userId],
    queryFn: () =>
      loadTaxCatalog(async (from, to) => {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("id")
          .range(from, to);
        if (error) throw error;
        return data as TaxProduct[];
      }),
  });
  const products = catalog.data ?? [];
  const summary = summarizeTaxCatalog(products, regime, reducedIbs);
  const product = products.find((p) => p.id === selected);
  const classification = product ? classifyTaxProduct(product) : null;
  const splitValue =
    split.trim() === "" ? NaN : Number(split.replace(",", "."));
  const validSplit =
    Number.isFinite(splitValue) && splitValue >= 0 && splitValue <= 100;
  const result = product
    ? simulateProductTax(product, price, regime, reducedIbs, splitValue)
    : null;
  const margin = result ? taxMargin(result, cost) : null;
  const changedIds = new Set(summary.changes.map((row) => row.product.id));
  const matching = products.filter(
    (p) =>
      (!onlyChanges || changedIds.has(p.id)) &&
      `${p.name} ${p.barcode ?? ""} ${p.sku ?? ""} ${p.ncm ?? ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const pct = (value: number | null) =>
    value === null
      ? "Indisponível"
      : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const delta = result
    ? Number((result.futureRate - result.todayRate).toFixed(2))
    : 0;
  return (
    <ErpPage>
      <ErpPageHeader
        title="Migração IBS/CBS"
        eyebrow="Remédio Mais · Campina Grande/PB"
        icon={Calculator}
        description="Balcão, site e delivery · simulação informativa por produto"
        actions={<Badge variant="secondary">Simulação</Badge>}
      />
      <Alert>
        <AlertTitle>
          Simulação informativa — nenhuma cobrança é realizada
        </AlertTitle>
        <AlertDescription>
          Hipóteses editáveis, sem créditos. Não altera checkout, NF-e, ERP ou
          Trier. Hoje e 2027 mostram imposto estimado reservado; Split Payment
          mostra retenção na liquidação. Confirme o enquadramento com a
          contabilidade.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Resumo geral do catálogo</CardTitle>
          <CardDescription>
            Média simples por item, sem ponderação por vendas. Pendências nunca
            contam como taxa zero.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {catalog.isPending ? (
            <p role="status">Carregando catálogo completo...</p>
          ) : catalog.isError ? (
            <Alert variant="destructive">
              <AlertTitle>
                Não foi possível carregar o catálogo completo
              </AlertTitle>
              <AlertDescription>
                Totais parciais não são exibidos.{" "}
                <Button onClick={() => catalog.refetch()}>
                  Recarregar catálogo
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p>
                {summary.total} produtos · {summary.classified} classificados ·{" "}
                {summary.review} em revisão · {summary.changes.length} com
                mudança de alíquota
              </p>
              {!summary.total && <p>Catálogo vazio.</p>}
              <p>
                Média de retenção estimada: hoje {pct(summary.todayAverage)} →
                2027 {pct(summary.futureAverage)}
              </p>
              <p>
                {summary.review
                  ? "Média parcial: catálogo inteiro ainda sem média fiscal confiável. Base: somente os itens classificados."
                  : "Cobertura completa do catálogo carregado."}
              </p>
              {!!summary.review && (
                <p role="status">
                  Revise NCM, CEST, monofásico e art. 146 nos cadastros fiscais.
                  Tarja e nome não comprovam benefício.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Parâmetros da simulação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="regime">Regime PIS/COFINS</Label>
            <Select
              value={regime}
              onValueChange={(value) => setRegime(value as typeof regime)}
            >
              <SelectTrigger id="regime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="presumido">
                  Lucro Presumido · 3,65%
                </SelectItem>
                <SelectItem value="real">Lucro Real · 9,25%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="split">
              Split Payment · % do IBS/CBS retido na liquidação
            </Label>
            <Input
              id="split"
              inputMode="decimal"
              value={split}
              onChange={(e) => setSplit(e.target.value)}
              aria-invalid={!validSplit}
            />
            {!validSplit && <p role="alert">Informe de 0 a 100%.</p>}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ibs"
              checked={reducedIbs}
              onCheckedChange={(v) => setReducedIbs(v === true)}
            />
            <Label htmlFor="ibs">
              Reduzir IBS dos medicamentos para 0,04% (senão 0,1%)
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            CBS geral de referência 11,2%; medicamento com redução de 60%:
            4,48%. ICMS não ST de 20% permanece em 2027. Split Payment é
            hipótese de liquidação, sujeito à regulamentação.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Buscar produto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label htmlFor="search">Nome, código de barras, SKU ou NCM</Label>
          <Input
            id="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!catalog.data}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="changes"
              checked={onlyChanges}
              onCheckedChange={(v) => setOnlyChanges(v === true)}
            />
            <Label htmlFor="changes">
              Somente alertas de mudança ({summary.changes.length})
            </Label>
          </div>
          <p>
            {matching.length} resultados
            {matching.length > 50 ? " · refine a busca (mostrando 50)" : ""}
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {matching.slice(0, 50).map((p) => (
              <Button
                key={p.id}
                variant={selected === p.id ? "secondary" : "outline"}
                className="h-auto w-full justify-start whitespace-normal text-left"
                onClick={() => {
                  setSelected(p.id);
                  setPrice(
                    Number.isFinite(p.price) && p.price >= 0
                      ? p.price.toFixed(2)
                      : "",
                  );
                  setCost("");
                }}
              >
                {p.name} ·{" "}
                {classifyTaxProduct(p).review
                  ? "Revisão"
                  : changedIds.has(p.id)
                    ? "Alíquota mudou"
                    : "Classificado"}
              </Button>
            ))}
          </div>
          {catalog.data && !matching.length && (
            <p>Nenhum produto encontrado para este filtro.</p>
          )}
        </CardContent>
      </Card>
      {!product ? (
        <p>Selecione um produto para comparar os três cenários.</p>
      ) : (
        <>
          <h2 className="text-xl">{product.name}</h2>
          <p>
            NCM: {product.ncm || "ausente"} · CEST: {product.cest || "ausente"}
          </p>
          {classification?.review && (
            <Alert variant="destructive">
              <AlertTitle>
                Classificação em revisão — cálculo bloqueado
              </AlertTitle>
              <AlertDescription>
                {classification.reasons.join("; ")}. Nenhuma alíquota foi
                presumida.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="price">Preço final de venda (R$)</Label>
              <Input
                id="price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={parseTaxBase(price) === null}
              />
              {parseTaxBase(price) === null && (
                <p role="alert">
                  Informe preço válido, com até duas casas decimais.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="cost">
                Custo unitário para simular margem (R$)
              </Label>
              <Input
                id="cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                aria-invalid={cost !== "" && parseTaxBase(cost) === null}
              />
              {cost && parseTaxBase(cost) === null && (
                <p role="alert">Custo inválido.</p>
              )}
            </div>
          </div>
          {!!delta && (
            <Alert>
              <AlertTitle>Alerta de mudança de alíquota</AlertTitle>
              <AlertDescription>
                Esse item {delta > 0 ? "subiu" : "caiu"}{" "}
                {Math.abs(delta).toLocaleString("pt-BR")} pontos percentuais em
                2027 ({pct(result!.todayRate)} → {pct(result!.futureRate)}).
                Impacto no lucro com preço fixo:{" "}
                {money(result!.todayAmount - result!.futureAmount)} por venda.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>HOJE</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p>Taxa: {result ? pct(result.todayRate) : "—"}</p>
                <p>
                  Valor retido / reservado:{" "}
                  {result ? money(result.todayAmount) : "—"}
                </p>
                <p className="text-sm">
                  ICMS: {result ? pct(result.icms) : "—"} · PIS/COFINS:{" "}
                  {result ? pct(result.pisCofins) : "—"}. ST e monofásico: zero
                  na saída quando classificados; não significa ausência de
                  tributo na cadeia.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>2027 reforma</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p>Taxa total: {result ? pct(result.futureRate) : "—"}</p>
                <p>
                  Valor retido / reservado:{" "}
                  {result ? money(result.futureAmount) : "—"}
                </p>
                <p>
                  CBS {result ? pct(result.cbs) : "—"} · IBS{" "}
                  {result ? pct(result.ibs) : "—"} + ICMS{" "}
                  {result ? pct(result.icms) : "—"}
                </p>
                <p>
                  2026 teste: CBS {result ? money(result.cbs2026) : "—"} (0,9%)
                  + IBS {result ? money(result.ibs2026) : "—"} (0,1%); sem somar
                  ao preço.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Split Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-lg font-semibold">
                  Alíquota deste produto na liquidação:{" "}
                  {result ? pct(result.splitRate) : "—"}
                </p>
                <p>
                  Valor retido na hora da venda:{" "}
                  {result ? money(result.splitAmount) : "—"}
                </p>
                <p className="text-xl font-bold">
                  Cai na conta do vendedor:{" "}
                  {result ? money(result.sellerAmount) : "—"}
                </p>
                <p>
                  Saldo de imposto a reservar depois:{" "}
                  {result
                    ? money(result.futureAmount - result.splitAmount)
                    : "—"}
                  . Não há segundo imposto: a retenção antecipa parte do tributo
                  de 2027. Sem tarifas do meio de pagamento.
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Impacto no preço final e na margem</CardTitle>
              <CardDescription>
                Preço final mantido; custo informado manualmente. Sem créditos,
                frete, tarifas ou outras despesas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {margin ? (
                <>
                  <p>Lucro antes dos impostos: {money(margin.beforeTax)}</p>
                  <p>
                    Hoje: lucro {money(margin.todayProfit)} · margem{" "}
                    {pct(margin.todayMargin)}
                  </p>
                  <p>
                    2027 e Split Payment: lucro {money(margin.futureProfit)} ·
                    margem {pct(margin.futureMargin)}
                  </p>
                  <p>
                    Imposto de 2027 consome{" "}
                    {margin.profitConsumed === null
                      ? "percentual indefinido (lucro antes de imposto não positivo)"
                      : pct(margin.profitConsumed)}{" "}
                    do lucro antes dos impostos.
                  </p>
                  {margin.futureProfit < 0 && (
                    <p role="alert">
                      Atenção: venda com prejuízo neste cenário.
                    </p>
                  )}
                  <p>
                    Preço final teórico para preservar o lucro de hoje:{" "}
                    {money(margin.priceToKeepProfit)} (variação{" "}
                    {money(margin.priceToKeepProfit - result!.base)}).
                  </p>
                </>
              ) : (
                <p>
                  Informe preço positivo e custo válido para calcular o impacto
                  na margem; custo ausente não é zero.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </ErpPage>
  );
}
