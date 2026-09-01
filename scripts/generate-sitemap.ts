// Roda antes de `vite dev` e `vite build` (predev/prebuild); escreve public/sitemap.xml.
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://www.atacadaodosmedicamentos.com.br";

interface SitemapEntry {
  path: string;
  lastmod?: string | null;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/ofertas", changefreq: "daily", priority: "0.9" },
  { path: "/melhores-ofertas", changefreq: "daily", priority: "0.9" },
  { path: "/mais-vendidos", changefreq: "daily", priority: "0.9" },
  { path: "/medicamentos-populares", changefreq: "weekly", priority: "0.8" },
  { path: "/genericos-em-oferta", changefreq: "weekly", priority: "0.8" },
  { path: "/preco-reduzido", changefreq: "daily", priority: "0.8" },
  { path: "/novidades", changefreq: "weekly", priority: "0.7" },
  { path: "/departamentos", changefreq: "weekly", priority: "0.7" },
  { path: "/enviar-receita", changefreq: "monthly", priority: "0.6" },
  { path: "/fale-conosco", changefreq: "monthly", priority: "0.5" },
  { path: "/trocas-e-devolucoes", changefreq: "yearly", priority: "0.3" },
  { path: "/politica-de-reembolso", changefreq: "yearly", priority: "0.3" },
  { path: "/politica-de-privacidade", changefreq: "yearly", priority: "0.3" },
  { path: "/termos-de-uso", changefreq: "yearly", priority: "0.3" },
];

function readEnv(): Record<string, string> {
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  const envPath = resolve(".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !out[m[1]]) out[m[1]] = m[2];
    }
  }
  return out;
}

async function fetchRows(table: string, query: string): Promise<any[]> {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as any[];
  } catch {
    return [];
  }
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeLastmod(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function generateSitemap(entries: SitemapEntry[]) {
  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.path, entry])).values());
  const urls = uniqueEntries.map((e) => {
    const lastmod = normalizeLastmod(e.lastmod);
    return [
      `  <url>`,
      `    <loc>${xmlEscape(`${BASE_URL}${e.path}`)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

async function main() {
  const entries: SitemapEntry[] = [...staticEntries];

  const categories = await fetchRows("categories", "select=slug&active=eq.true&limit=500");
  for (const c of categories) {
    if (c?.slug) entries.push({ path: `/categoria/${c.slug}`, changefreq: "daily", priority: "0.8" });
  }

  const departments = await fetchRows("departments", "select=slug&active=eq.true&limit=200");
  for (const d of departments) {
    if (d?.slug) entries.push({ path: `/departamento/${d.slug}`, changefreq: "weekly", priority: "0.7" });
  }

  // PostgREST limita a 1000 linhas por requisição — paginamos.
  // Somente produtos ativos, publicados e com estoque entram no sitemap.
  for (let page = 0; page < 12; page++) {
    const products = await fetchRows(
      "products",
      `select=slug,updated_at&active=eq.true&archived_at=is.null&stock=gt.0&order=updated_at.desc&limit=1000&offset=${page * 1000}`,
    );
    for (const p of products) {
      if (p?.slug) {
        entries.push({
          path: `/produto/${p.slug}`,
          lastmod: p.updated_at,
          changefreq: "daily",
          priority: "0.7",
        });
      }
    }
    if (products.length < 1000) break;
  }

  const sitemap = generateSitemap(entries);
  writeFileSync(resolve("public/sitemap.xml"), sitemap);
  console.log(`sitemap.xml gerado (${Array.from(new Set(entries.map((e) => e.path))).length} URLs)`);
}

main();
