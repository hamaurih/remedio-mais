import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveSitePrice } from "@/lib/pricing";
import { formatBRL } from "@/lib/store";
import {
  MEDICATION_FACTS_NOTE,
  buildMedicationFacts,
  humanizeCatalogName,
  type CatalogProduct,
  type MedicationFact,
} from "@/lib/medicationFacts";

type Equivalent = {
  id: string;
  name: string;
  slug: string;
  price: number;
  promo_price: number | null;
  site_price?: number | null;
  site_promo_price?: number | null;
  promotion_start?: string | null;
  promotion_end?: string | null;
  manufacturer: string | null;
  stock: number | null;
  source: "cadastro" | "mesmo_principio";
};

const EQUIVALENT_SELECT = "id,name,slug,price,promo_price,site_price,site_promo_price,promotion_start,promotion_end,manufacturer,stock,active,is_generic";

type EquivalentRow = Omit<Equivalent, "source"> & { active?: boolean | null };

async function loadEquivalents(product: CatalogProduct & { id?: string }): Promise<Equivalent[]> {
  const rows: Equivalent[] = [];
  const seen = new Set<string>();
  const push = (row: EquivalentRow | null, source: Equivalent["source"]) => {
    if (!row?.id || row.id === product.id || seen.has(row.id) || row.active === false) return;
    seen.add(row.id);
    rows.push({ ...row, source });
  };

  if (product.generic_equivalent_id) {
    const { data, error } = await supabase
      .from("products")
      .select(EQUIVALENT_SELECT)
      .eq("id", product.generic_equivalent_id)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) push(data as EquivalentRow, "cadastro");
  }

  const ingredient = String(product.active_ingredient || "").trim();
  if (ingredient.length >= 3 && product.id) {
    const { data, error } = await supabase
      .from("products")
      .select(EQUIVALENT_SELECT)
      .eq("active", true)
      .eq("is_generic", true)
      .gt("stock", 0)
      .ilike("active_ingredient", ingredient)
      .neq("id", product.id)
      .limit(8);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as EquivalentRow[]) push(row, "mesmo_principio");
  }

  return rows
    .sort((a, b) => resolveSitePrice(a).finalPrice - resolveSitePrice(b).finalPrice)
    .slice(0, 6);
}

function sourceLabel(source: MedicationFact["source"]) {
  return source === "cadastro" ? "cadastro da loja" : "lido do nome cadastrado";
}

export function MedicationFacts({ product }: { product: CatalogProduct & { id?: string } }) {
  const model = buildMedicationFacts(product);
  const equivalents = useQuery({
    queryKey: ["generic-equivalents", product.id, product.active_ingredient, product.generic_equivalent_id],
    enabled: !!product.id && model.genericLookup,
    queryFn: () => loadEquivalents(product),
  });

  const hasBody = model.facts.length > 0 || model.publishedLinks.length > 0 || model.anvisaSearch || model.genericLookup;
  if (!hasBody) return null;

  return (
    <section aria-labelledby="ficha-do-produto" data-testid="medication-facts" className="mt-5 rounded-xl border bg-card p-4 shadow-card space-y-4">
      <div>
        <h2 id="ficha-do-produto" className="font-semibold">Ficha do produto</h2>
        <p className="text-xs text-muted-foreground mt-1">{MEDICATION_FACTS_NOTE}</p>
      </div>

      {model.facts.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {model.facts.map((fact) => (
            <div key={fact.id} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fact.label}</dt>
              <dd className="text-sm mt-0.5">{fact.value}</dd>
              <dd className="text-xs text-muted-foreground">{sourceLabel(fact.source)}</dd>
            </div>
          ))}
        </dl>
      )}

      {model.publishedLinks.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Material que já está no cadastro</h3>
          <ul className="space-y-1">
            {model.publishedLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline break-all">
                  {link.label} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.anvisaSearch && (
        <p className="text-sm">
          <a href={model.anvisaSearch.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            Buscar “{model.anvisaSearch.term}” no Bulário da Anvisa <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <span className="block text-xs text-muted-foreground mt-1">
            Abre a busca oficial da Anvisa. Confira se o resultado é este produto e esta apresentação. Esta página não guarda o texto da bula.
          </span>
        </p>
      )}

      {model.genericLookup && (equivalents.isLoading || equivalents.isError || (equivalents.data?.length ?? 0) > 0) && (
        <div>
          <h3 className="text-sm font-semibold">Genéricos no nosso catálogo</h3>
          {equivalents.isLoading && <p className="text-xs text-muted-foreground mt-1">Consultando o cadastro…</p>}
          {equivalents.isError && <p className="text-xs text-muted-foreground mt-1">Não foi possível consultar genéricos agora.</p>}
          {equivalents.data && equivalents.data.length > 0 && (
            <ul className="mt-2 divide-y border rounded-lg">
              {equivalents.data.map((item) => {
                const price = resolveSitePrice(item);
                const inStock = Number(item.stock || 0) > 0;
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 p-2.5">
                    <div className="min-w-0">
                      <Link to={`/produto/${item.slug}`} className="text-sm font-semibold hover:underline">
                        {humanizeCatalogName(item.name)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.source === "cadastro" ? "Indicado no cadastro" : "Mesmo princípio ativo cadastrado"}
                        {item.manufacturer ? ` · ${humanizeCatalogName(item.manufacturer)}` : ""}
                        {!inStock ? " · sem estoque" : ""}
                      </p>
                    </div>
                    <div className="text-sm font-bold shrink-0">{formatBRL(price.finalPrice)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
