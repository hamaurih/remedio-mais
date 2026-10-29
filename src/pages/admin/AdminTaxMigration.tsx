import { useCallback, useEffect, useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import {
  CBS_GO_LIVE,
  migrationCountdown,
  parseTaxChecklist,
  simulateTaxPrice,
  TAX_CHECKLIST,
  tax_migration_preview,
  taxMigrationMode,
} from "@/lib/taxMigration";

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function MigrationChecklist({ userId }: { userId: string }) {
  const storageKey = `remedio-mais:tax-migration:v1:${userId}`;
  const [checked, setChecked] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    try {
      setChecked(parseTaxChecklist(localStorage.getItem(storageKey)));
      setError("");
      setReady(true);
    } catch {
      setError(
        "Não foi possível ler o checklist local. Verifique o armazenamento do navegador e tente novamente.",
      );
      setReady(false);
    }
  }, [storageKey]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string, value: boolean) {
    const next = value
      ? [...checked.filter((entry) => entry !== id), id]
      : checked.filter((entry) => entry !== id);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setChecked(next);
      setError("");
    } catch {
      setError(
        "Não foi possível salvar. A alteração não foi aplicada; libere o armazenamento e tente marcar novamente.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist de preparação</CardTitle>
        <CardDescription>
          Marcações deste administrador, salvas somente neste navegador. Marcar
          um item não configura o sistema fiscal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ready && !error && <p role="status">Carregando checklist...</p>}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Armazenamento local indisponível</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
            <Button className="mt-3" variant="outline" onClick={load}>
              Tentar novamente
            </Button>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground" role="status">
          {checked.length} de {TAX_CHECKLIST.length} itens concluídos
          {ready && checked.length === 0 ? " — nenhum item marcado." : "."}
        </p>
        <Progress
          value={(checked.length / TAX_CHECKLIST.length) * 100}
          aria-label="Preparação concluída"
        />
        {TAX_CHECKLIST.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-lg border p-4"
          >
            <Checkbox
              id={`tax-${item.id}`}
              className="mt-1"
              checked={checked.includes(item.id)}
              disabled={!ready}
              onCheckedChange={(value) => toggle(item.id, value === true)}
              aria-describedby={`tax-${item.id}-detail`}
            />
            <div>
              <Label
                htmlFor={`tax-${item.id}`}
                className="cursor-pointer leading-relaxed"
              >
                {item.label}
              </Label>
              <p
                id={`tax-${item.id}-detail`}
                className="mt-1 text-sm text-muted-foreground"
              >
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminTaxMigration() {
  const { user, isAdmin, loading } = useAuth();
  const [now, setNow] = useState(Date.now);
  const [price, setPrice] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const mode = taxMigrationMode(tax_migration_preview, now);
  if (loading)
    return (
      <ErpPage>
        <p role="status">Carregando permissões...</p>
      </ErpPage>
    );
  if (!isAdmin || !user || mode === "off")
    return <Navigate to="/admin" replace />;
  const result = simulateTaxPrice(price);
  const invalid = price !== "" && !result;
  const countdown = migrationCountdown(now);

  return (
    <ErpPage>
      <ErpPageHeader
        title="Migração IBS/CBS"
        eyebrow="Financeiro · Ajuste tributário"
        icon={Calculator}
        description="Prepare a transição tributária e explore cenários de preço."
        actions={
          <Badge variant="secondary">
            {mode === "demo" ? "Demonstração" : "Efetivo (somente UI)"}
          </Badge>
        }
      />
      <Alert>
        <AlertTitle>
          Simulação informativa — nenhuma cobrança é realizada
        </AlertTitle>
        <AlertDescription>
          Em 2026, esta página é demonstrativa. A partir de 01/01/2027, o modo
          efetivo altera somente a apresentação. Nenhum valor é enviado ao
          checkout, à NF-e ou a integrações ERP.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>
            {now < CBS_GO_LIVE ? "Fase de migração" : "Marco de 2027 alcançado"}
          </CardTitle>
          <CardDescription>
            Início previsto da CBS efetiva: 01/01/2027, à meia-noite de
            Brasília. A data não ativa cobrança neste sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            role="timer"
            aria-label="Tempo até 2027"
          >
            {Object.entries({
              Dias: countdown.days,
              Horas: countdown.hours,
              Minutos: countdown.minutes,
              Segundos: countdown.seconds,
            }).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted p-4 text-center">
                <div className="text-3xl font-bold tabular-nums text-primary">
                  {String(value).padStart(2, "0")}
                </div>
                <div className="text-sm text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Simulador de preço</CardTitle>
          <CardDescription>
            Comparação simplificada com a mesma base de preço, sem créditos ou
            regimes específicos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-sm space-y-2">
            <Label htmlFor="tax-price">Preço base (R$)</Label>
            <Input
              id="tax-price"
              inputMode="decimal"
              placeholder="Ex.: 100,00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              aria-invalid={invalid}
              aria-describedby="tax-price-help"
            />
            <p
              id="tax-price-help"
              className={
                invalid
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {invalid
                ? "Informe um valor entre 0 e 1.000.000, com até duas casas decimais, sem separador de milhar."
                : "Digite um preço para comparar os dois cenários."}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2" aria-live="polite">
            <Card>
              <CardHeader>
                <CardTitle>2026 · Informativo</CardTitle>
                <CardDescription>CBS 0,9% + IBS 0,1%</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>CBS destacada: {result ? money(result.cbs2026) : "—"}</p>
                <p>IBS destacado: {result ? money(result.ibs2026) : "—"}</p>
                <p className="text-muted-foreground">
                  Destaque de teste, sem repasse ao cliente nesta simulação.
                </p>
                <p className="text-xl font-bold">
                  Preço final: {result ? money(result.total2026) : "—"}
                </p>
                <p>Impacto no preço: {result ? money(0) : "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>2027 · Cenário de referência</CardTitle>
                <CardDescription>
                  CBS 11,3% · referência TCU de 28/10/2026
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>CBS simulada: {result ? money(result.cbs2027) : "—"}</p>
                <p className="text-muted-foreground">
                  Hipótese de repasse integral: preço base + CBS de referência.
                </p>
                <p className="text-xl font-bold">
                  Preço final: {result ? money(result.total2027) : "—"}
                </p>
                <p>
                  Impacto no preço:{" "}
                  {result ? `+ ${money(result.cbs2027)} (11,3%)` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
          <p className="text-sm text-muted-foreground">
            A referência de 11,3% está sujeita a resolução do Senado. Este
            cenário considera apenas a CBS solicitada, sem IBS de 2027,
            substituição de PIS/Cofins, créditos, reduções ou alíquota zero de
            medicamentos. Não representa o preço fiscal definitivo.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a
              className="text-primary underline"
              href="https://portal.tcu.gov.br/imprensa/noticias/tcu-calcula-aliquota-de-referencia-de-113-para-novo-tributo-sobre-consumo"
              target="_blank"
              rel="noreferrer"
            >
              Referência TCU · 28/10/2026
            </a>
            <a
              className="text-primary underline"
              href="https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/reforma-tributaria-do-consumo/entenda"
              target="_blank"
              rel="noreferrer"
            >
              Transição · Receita Federal
            </a>
          </div>
        </CardContent>
      </Card>
      <MigrationChecklist key={user.id} userId={user.id} />
    </ErpPage>
  );
}
