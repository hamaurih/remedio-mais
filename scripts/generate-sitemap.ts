// Roda antes de `vite dev` e `vite build` (predev/prebuild); escreve public/sitemap.xml.
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://atacadaodosmedicamentos.com.br";

interface SitemapEntry {
  path: string;
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

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
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
  for (const c of categories) if (c?.slug) entries.push({ path: `/categoria/${c.slug}`, changefreq: "daily", priority: "0.8" });

  const departments = await fetchRows("departments", "select=slug&active=eq.true&limit=200");
  for (const d of departments) if (d?.slug) entries.push({ path: `/departamento/${d.slug}`, changefreq: "weekly", priority: "0.7" });

  // PostgREST limita a 1000 linhas por requisição — paginamos.
  for (let page = 0; page < 12; page++) {
    const products = await fetchRows(
      "products",
      `select=slug&active=eq.true&archived_at=is.null&stock=gt.0&order=updated_at.desc&limit=1000&offset=${page * 1000}`,
    );
    for (const p of products) if (p?.slug) entries.push({ path: `/produto/${p.slug}`, changefreq: "daily", priority: "0.7" });
    if (products.length < 1000) break;
  }

  writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
  console.log(`sitemap.xml gerado (${entries.length} URLs)`);
}

main();
