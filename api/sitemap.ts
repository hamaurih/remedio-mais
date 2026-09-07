const OFFICIAL_SUPABASE_URL = "https://jzltdocmvvdlyaukwzix.supabase.co";
const OFFICIAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_geFYMQbAFOJ3d3qazu0RYA_Xa1pBcxL";
const SITE = "https://www.atacadaodosmedicamentos.com.br";
const PAGE_SIZE = 1000;

type Row = { slug?: string | null; updated_at?: string | null };

function config() {
  return {
    url: (process.env.SUPABASE_URL || OFFICIAL_SUPABASE_URL).replace(/\/$/, ""),
    key: process.env.SUPABASE_PUBLISHABLE_KEY || OFFICIAL_SUPABASE_PUBLISHABLE_KEY,
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchAll(table: string, params: Record<string, string>, signal: AbortSignal): Promise<Row[]> {
  const { url, key } = config();
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const endpoint = new URL(`${url}/rest/v1/${table}`);
    for (const [k, v] of Object.entries(params)) endpoint.searchParams.set(k, v);
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        apikey: key,
        Range: `${from}-${from + PAGE_SIZE - 1}`,
      },
      signal,
    });
    if (!response.ok) throw new Error(`${table}_${response.status}`);
    const rows = (await response.json()) as Row[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

function urlNode(loc: string, opts: { lastmod?: string | null; changefreq?: string; priority?: string } = {}) {
  const lastmod = opts.lastmod ? `<lastmod>${escapeXml(new Date(opts.lastmod).toISOString())}</lastmod>` : "";
  const changefreq = opts.changefreq ? `<changefreq>${opts.changefreq}</changefreq>` : "";
  const priority = opts.priority ? `<priority>${opts.priority}</priority>` : "";
  return `<url><loc>${escapeXml(loc)}</loc>${lastmod}${changefreq}${priority}</url>`;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const [products, categories, departments] = await Promise.all([
        fetchAll("products", {
          select: "slug,updated_at",
          active: "eq.true",
          stock: "gt.0",
          slug: "not.is.null",
          order: "updated_at.desc",
        }, controller.signal),
        fetchAll("categories", {
          select: "slug,updated_at",
          active: "eq.true",
          show_in_menu: "eq.true",
          slug: "not.is.null",
          order: "position.asc",
        }, controller.signal),
        fetchAll("departments", {
          select: "slug,updated_at",
          active: "eq.true",
          show_in_menu: "eq.true",
          slug: "not.is.null",
          order: "position.asc",
        }, controller.signal),
      ]);

      const staticUrls = [
        ["/", "daily", "1.0"],
        ["/ofertas", "daily", "0.9"],
        ["/melhores-ofertas", "daily", "0.9"],
        ["/mais-vendidos", "daily", "0.9"],
        ["/medicamentos-populares", "weekly", "0.8"],
        ["/genericos-em-oferta", "weekly", "0.8"],
        ["/preco-reduzido", "daily", "0.8"],
        ["/novidades", "weekly", "0.7"],
        ["/departamentos", "weekly", "0.7"],
        ["/enviar-receita", "monthly", "0.6"],
        ["/fale-conosco", "monthly", "0.5"],
        ["/trocas-e-devolucoes", "yearly", "0.3"],
        ["/politica-de-reembolso", "yearly", "0.3"],
        ["/politica-de-privacidade", "yearly", "0.3"],
        ["/termos-de-uso", "yearly", "0.3"],
      ].map(([path, changefreq, priority]) => urlNode(`${SITE}${path}`, { changefreq, priority }));

      const categoryUrls = categories
        .filter((row) => row.slug)
        .map((row) => urlNode(`${SITE}/categoria/${encodeURIComponent(row.slug!)}`, {
          lastmod: row.updated_at,
          changefreq: "weekly",
          priority: "0.7",
        }));

      const departmentUrls = departments
        .filter((row) => row.slug)
        .map((row) => urlNode(`${SITE}/departamento/${encodeURIComponent(row.slug!)}`, {
          lastmod: row.updated_at,
          changefreq: "weekly",
          priority: "0.7",
        }));

      const productUrls = products
        .filter((row) => row.slug)
        .map((row) => urlNode(`${SITE}/produto/${encodeURIComponent(row.slug!)}`, {
          lastmod: row.updated_at,
          changefreq: "weekly",
          priority: "0.6",
        }));

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...staticUrls, ...categoryUrls, ...departmentUrls, ...productUrls].join("")}</urlset>`;
      const headers = {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Robots-Tag": "noindex",
        "X-Sitemap-Products": String(productUrls.length),
        "X-Sitemap-Categories": String(categoryUrls.length),
        "X-Sitemap-Departments": String(departmentUrls.length),
      };
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(xml, { status: 200, headers });
    } catch (error) {
      return new Response(`Sitemap unavailable: ${error instanceof Error ? error.message : "unknown"}`, {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    } finally {
      clearTimeout(timeout);
    }
  },
};
