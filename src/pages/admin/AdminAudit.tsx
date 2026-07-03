import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, Trash2, Loader2, ExternalLink, RefreshCw } from "lucide-react";

type Status = "ok" | "warn" | "error" | "empty";

type Finding = {
  id: string;
  title: string;
  detail: string;
  status: Status;
  value?: string | number;
  action?: { label: string; to?: string; href?: string };
};

const STATUS_META: Record<Status, { label: string; cls: string; icon: any }> = {
  ok: { label: "Funcionando", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  warn: { label: "Precisa melhorar", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  error: { label: "Quebrado", cls: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  empty: { label: "Ocupando espaço", cls: "bg-slate-100 text-slate-700 border-slate-200", icon: Trash2 },
};

async function count(table: string, apply?: (q: any) => any): Promise<number> {
  let q = supabase.from(table as any).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count: c, error } = await q;
  if (error) return -1;
  return c ?? 0;
}

function useAudit() {
  return useQuery({
    queryKey: ["admin_audit_report_v1"],
    staleTime: 60_000,
    queryFn: async (): Promise<Finding[]> => {
      const [
        prodTotal, prodActive, prodStock, prodNoImg, prodActiveNoImg, prodNoEan,
        prodNoCat, prodNoPrice, prodZombie, prodPromoBad, prodLockPrice,
        orders, orders30d, orderPendStuck, orderPaidNotSent,
        categories, subcategories, departments, banners, campaigns, mosaic, menus,
        promoBlocks, variants, customers, prescriptions, sellers,
        recentStockSync,
      ] = await Promise.all([
        count("products"),
        count("products", (q) => q.eq("active", true)),
        count("products", (q) => q.gt("stock", 0)),
        count("products", (q) => q.or("image_url.is.null,image_url.eq.")),
        count("products", (q) => q.eq("active", true).or("image_url.is.null,image_url.eq.")),
        count("products", (q) => q.or("barcode.is.null,barcode.eq.")),
        count("products", (q) => q.is("category_id", null)),
        count("products", (q) => q.or("price.is.null,price.eq.0")),
        count("products", (q) => q.eq("active", false).lte("stock", 0)),
        count("products", (q) => q.not("promo_price", "is", null).filter("promo_price", "gte", "price")),
        count("products", (q) => q.eq("lock_manual_price", true)),
        count("orders"),
        count("orders", (q) => q.gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())),
        count("orders", (q) => q.eq("payment_status", "pending").lt("created_at", new Date(Date.now() - 3600000).toISOString())),
        count("orders", (q) => q.eq("payment_status", "approved").eq("trier_sent", false)),
        count("categories"),
        count("subcategories"),
        count("departments"),
        count("banners"),
        count("campaigns"),
        count("home_mosaic_tiles"),
        count("menu_items"),
        count("promo_banner_blocks"),
        count("product_variants"),
        count("profiles"),
        count("prescriptions"),
        count("user_roles", (q) => q.eq("role", "seller")),
        count("products", (q) => q.gte("last_stock_sync_at", new Date(Date.now() - 24 * 3600000).toISOString())),
      ]);

      const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
      const f: Finding[] = [];

      // ==== CATÁLOGO ====
      f.push({
        id: "cat-active",
        title: "Produtos ativos no site",
        detail: `${prodActive.toLocaleString("pt-BR")} ativos de ${prodTotal.toLocaleString("pt-BR")} no banco (${pct(prodActive, prodTotal)}%). O resto está oculto do site.`,
        status: prodActive > 100 ? "ok" : "warn",
        value: prodActive,
        action: { label: "Ver produtos", to: "/admin/produtos" },
      });
      f.push({
        id: "cat-zombie",
        title: "Produtos zumbi (inativos e sem estoque)",
        detail: `${prodZombie.toLocaleString("pt-BR")} produtos ocupam espaço no banco sem aparecer no site nem ter estoque. Candidatos a arquivar.`,
        status: prodZombie > 5000 ? "empty" : prodZombie > 0 ? "warn" : "ok",
        value: prodZombie,
        action: { label: "Filtrar no admin", to: "/admin/produtos?status=inactive" },
      });
      f.push({
        id: "cat-noimg",
        title: "Ativos sem imagem",
        detail: `${prodActiveNoImg.toLocaleString("pt-BR")} produtos ativos no site sem foto (${pct(prodActiveNoImg, prodActive)}% dos ativos). Total sem imagem no banco: ${prodNoImg.toLocaleString("pt-BR")}.`,
        status: prodActiveNoImg > 500 ? "error" : prodActiveNoImg > 50 ? "warn" : "ok",
        value: prodActiveNoImg,
        action: { label: "Ver lista", to: "/admin/qualidade-dados" },
      });
      f.push({
        id: "cat-noean",
        title: "Sem código de barras (EAN)",
        detail: `${prodNoEan.toLocaleString("pt-BR")} produtos sem EAN — sem EAN o botão "Atualizar estoque agora" e a sync do Trier não funcionam para eles.`,
        status: prodNoEan > 500 ? "warn" : "ok",
        value: prodNoEan,
        action: { label: "Ver lista", to: "/admin/qualidade-dados" },
      });
      f.push({
        id: "cat-nocat",
        title: "Sem categoria",
        detail: `${prodNoCat.toLocaleString("pt-BR")} produtos não aparecem em nenhuma categoria ou departamento.`,
        status: prodNoCat > 100 ? "warn" : "ok",
        value: prodNoCat,
        action: { label: "Ver lista", to: "/admin/qualidade-dados" },
      });
      f.push({
        id: "cat-noprice",
        title: "Sem preço",
        detail: `${prodNoPrice.toLocaleString("pt-BR")} produtos com preço zerado ou nulo.`,
        status: prodNoPrice > 50 ? "warn" : "ok",
        value: prodNoPrice,
      });
      f.push({
        id: "cat-promo-bad",
        title: "Promoções inválidas",
        detail: `${prodPromoBad} produtos com preço promocional maior ou igual ao preço normal.`,
        status: prodPromoBad > 0 ? "error" : "ok",
        value: prodPromoBad,
        action: prodPromoBad > 0 ? { label: "Corrigir em Ofertas", to: "/admin/ofertas" } : undefined,
      });
      f.push({
        id: "cat-lock",
        title: "Preços travados manualmente",
        detail: `${prodLockPrice.toLocaleString("pt-BR")} produtos com trava — a sync do Trier não sobrescreve o preço deles. Isso é o que impede o preço de sumir na atualização.`,
        status: "ok",
        value: prodLockPrice,
      });

      // ==== PEDIDOS / PAGAMENTOS ====
      f.push({
        id: "ord-total",
        title: "Pedidos no total",
        detail: `${orders} pedidos criados. ${orders30d} nos últimos 30 dias.`,
        status: orders > 0 ? "ok" : "empty",
        value: orders,
        action: { label: "Ver pedidos", to: "/admin/pedidos" },
      });
      f.push({
        id: "ord-stuck",
        title: "Pagamentos travados",
        detail: `${orderPendStuck} pedidos com status "pendente" há mais de 1 hora. Provável abandono ou webhook não recebido.`,
        status: orderPendStuck > 3 ? "warn" : "ok",
        value: orderPendStuck,
        action: orderPendStuck > 0 ? { label: "Investigar", to: "/admin/pagamentos" } : undefined,
      });
      f.push({
        id: "ord-not-sent",
        title: "Pagos, mas não enviados ao Trier",
        detail: `${orderPaidNotSent} pedidos pagos que ainda não foram registrados no Trier.`,
        status: orderPaidNotSent > 0 ? "error" : "ok",
        value: orderPaidNotSent,
        action: orderPaidNotSent > 0 ? { label: "Ver pedidos", to: "/admin/pedidos?filter=pending-trier" } : undefined,
      });

      // ==== INTEGRAÇÕES ====
      f.push({
        id: "int-trier-sync",
        title: "Sincronização de estoque (Trier)",
        detail: `${recentStockSync.toLocaleString("pt-BR")} produtos sincronizados nas últimas 24h.`,
        status: recentStockSync > 100 ? "ok" : recentStockSync > 0 ? "warn" : "error",
        value: recentStockSync,
        action: { label: "Abrir Trier", to: "/admin/integrations/trier" },
      });

      // ==== CONTEÚDO / HOME ====
      f.push({
        id: "home-banners",
        title: "Banners da home",
        detail: `${banners} banner(s) cadastrado(s).`,
        status: banners >= 3 ? "ok" : banners > 0 ? "warn" : "empty",
        value: banners,
        action: { label: "Gerenciar", to: "/admin/banners" },
      });
      f.push({
        id: "home-mosaic",
        title: "Mosaico da home",
        detail: `${mosaic} tile(s). A seção não aparece na home se estiver vazia.`,
        status: mosaic > 0 ? "ok" : "empty",
        value: mosaic,
        action: { label: "Configurar", to: "/admin/mosaico" },
      });
      f.push({
        id: "home-promo",
        title: "Faixa promocional (5 blocos)",
        detail: `${promoBlocks} bloco(s) configurado(s).`,
        status: promoBlocks >= 3 ? "ok" : promoBlocks > 0 ? "warn" : "empty",
        value: promoBlocks,
        action: { label: "Editar", to: "/admin/promo-banner" },
      });
      f.push({
        id: "home-campaigns",
        title: "Campanhas ativas",
        detail: `${campaigns} campanha(s) cadastrada(s).`,
        status: campaigns > 0 ? "ok" : "empty",
        value: campaigns,
        action: { label: "Gerenciar", to: "/admin/campanhas" },
      });
      f.push({
        id: "home-menus",
        title: "Itens de menu",
        detail: `${menus} item(ns) na navegação.`,
        status: menus > 3 ? "ok" : menus > 0 ? "warn" : "empty",
        value: menus,
        action: { label: "Editar menus", to: "/admin/menus" },
      });

      // ==== TAXONOMIA ====
      f.push({
        id: "tax-cat",
        title: "Categorias / subcategorias / departamentos",
        detail: `${categories} categorias · ${subcategories} subcategorias · ${departments} departamentos.`,
        status: categories > 0 ? "ok" : "empty",
        value: `${categories}/${subcategories}/${departments}`,
        action: { label: "Taxonomia", to: "/admin/taxonomia" },
      });

      // ==== CLIENTES ====
      f.push({
        id: "cust-total",
        title: "Clientes cadastrados",
        detail: `${customers} perfis criados no site.`,
        status: customers > 10 ? "ok" : "empty",
        value: customers,
        action: { label: "Ver clientes", to: "/admin/clientes" },
      });
      f.push({
        id: "sellers",
        title: "Vendedores",
        detail: `${sellers} vendedor(es) com acesso ao admin.`,
        status: "ok",
        value: sellers,
        action: { label: "Gerenciar", to: "/admin/vendedores" },
      });

      // ==== MÓDULOS OCIOSOS ====
      f.push({
        id: "presc",
        title: "Envio de receita",
        detail: `${prescriptions} receita(s) enviada(s). Se sempre 0, considere remover o CTA da home.`,
        status: prescriptions > 0 ? "ok" : "empty",
        value: prescriptions,
        action: { label: "Ver receitas", to: "/admin/receitas" },
      });
      f.push({
        id: "variants",
        title: "Variantes de produto",
        detail: `${variants} variante(s) cadastrada(s).`,
        status: variants > 0 ? "ok" : "empty",
        value: variants,
      });

      return f;
    },
  });
}

export default function AdminAudit() {
  const { data, isLoading, refetch, isFetching } = useAudit();

  const grouped = {
    error: data?.filter((x) => x.status === "error") ?? [],
    warn: data?.filter((x) => x.status === "warn") ?? [],
    empty: data?.filter((x) => x.status === "empty") ?? [],
    ok: data?.filter((x) => x.status === "ok") ?? [],
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Auditoria do Site</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Diagnóstico completo do que está funcionando, o que precisa melhorar, o que está quebrado e o que está apenas
            ocupando espaço. Use este painel para decidir por onde começar antes de colocar o site em uso real.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Rodando diagnóstico…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard status="error" count={grouped.error.length} />
            <SummaryCard status="warn" count={grouped.warn.length} />
            <SummaryCard status="empty" count={grouped.empty.length} />
            <SummaryCard status="ok" count={grouped.ok.length} />
          </div>

          <Section title="Quebrado — precisa consertar" items={grouped.error} />
          <Section title="Precisa melhorar" items={grouped.warn} />
          <Section title="Ocupando espaço — considerar remover" items={grouped.empty} />
          <Section title="Funcionando" items={grouped.ok} collapsedByDefault />

          <Card>
            <CardHeader><CardTitle className="text-base">Como usar este painel</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>1. Comece pelos itens em <strong>vermelho</strong> — são problemas que impedem uso real.</p>
              <p>2. Depois ataque os <strong>amarelos</strong> — funcionam mas prejudicam a qualidade.</p>
              <p>3. Os <strong>cinzas</strong> são módulos vazios/sem uso — decida se ativa ou remove para simplificar o admin.</p>
              <p>4. Clique em <strong>Atualizar</strong> depois de fazer mudanças para revalidar.</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({ status, count }: { status: Status; count: number }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <div className={`rounded-lg border p-4 ${meta.cls}`}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
        <Icon className="h-4 w-4" /> {meta.label}
      </div>
      <div className="text-3xl font-extrabold tabular-nums mt-2">{count}</div>
    </div>
  );
}

function Section({ title, items, collapsedByDefault }: { title: string; items: Finding[]; collapsedByDefault?: boolean }) {
  if (!items.length) return null;
  return (
    <details open={!collapsedByDefault} className="group">
      <summary className="cursor-pointer list-none flex items-center justify-between py-2 border-b mb-3">
        <h2 className="text-lg font-bold">{title} <span className="text-muted-foreground font-normal">({items.length})</span></h2>
        <span className="text-xs text-muted-foreground group-open:hidden">clique para expandir</span>
        <span className="text-xs text-muted-foreground hidden group-open:inline">clique para recolher</span>
      </summary>
      <div className="grid gap-3">
        {items.map((it) => <FindingRow key={it.id} f={it} />)}
      </div>
    </details>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const meta = STATUS_META[f.status];
  const Icon = meta.icon;
  return (
    <div className="border rounded-lg p-4 flex items-start gap-3 bg-card">
      <div className={`shrink-0 rounded-md p-2 ${meta.cls}`}><Icon className="h-4 w-4" /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold">{f.title}</div>
          {f.value !== undefined && (
            <Badge variant="outline" className="tabular-nums">{typeof f.value === "number" ? f.value.toLocaleString("pt-BR") : f.value}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{f.detail}</p>
      </div>
      {f.action && (
        f.action.to ? (
          <Link to={f.action.to}><Button size="sm" variant="outline">{f.action.label} <ExternalLink className="h-3.5 w-3.5 ml-1" /></Button></Link>
        ) : f.action.href ? (
          <a href={f.action.href} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">{f.action.label} <ExternalLink className="h-3.5 w-3.5 ml-1" /></Button></a>
        ) : null
      )}
    </div>
  );
}
