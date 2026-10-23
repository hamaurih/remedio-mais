// Gera public/sitemap.xml antes de cada build.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = "https://www.atacadaodosmedicamentos.com.br";

const staticEntries = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/ofertas", changefreq: "daily", priority: "0.9" },
  { path: "/melhores-ofertas", changefreq: "daily", priority: "0.9" },
  { path: "/mais-vendidos", changefreq: "daily", priority: "0.9" },
  { path: "/medicamentos-populares", changefreq: "weekly", priority: "0.8" },
  { path: "/genericos-em-oferta", changefreq: "weekly", priority: "0.8" },
  { path: "/preco-reduzido", changefreq: "daily", priority: "0.8" },
  { path: "/novidades", changefreq: "weekly", priority: "0.7" },
  { path: "/departamentos", changefreq: "weekly", priority: "0.7" },
  { path: "/fale-conosco", changefreq: "monthly", priority: "0.5" },
  { path: "/trocas-e-devolucoes", changefreq: "yearly", priority: "0.3" },
  { path: "/politica-de-reembolso", changefreq: "yearly", priority: "0.3" },
  { path: "/politica-de-privacidade", changefreq: "yearly", priority: "0.3" },
  { path: "/termos-de-uso", changefreq: "yearly", priority: "0.3" },
];

function readEnv() {
  const out = { ...process.env };
  const envPath = resolve(".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !out[m[1]]) out[m[1]] = m[2];
    }
  }
  return out;
}

async function fetchRows(table, query) {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function xmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeLastmod(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isSeoSafeSlug(value) {
  const slug = String(value || "").trim();
  if (!slug) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  if (/^zzzzzz(?:-|$)/.test(slug)) return false;
  if (/^(?:teste|test)(?:-|$)/.test(slug)) return false;
  return true;
}

function generateSitemap(entries) {
  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.path, entry])).values());
  const urls = uniqueEntries.map((e) => {
    const lastmod = normalizeLastmod(e.lastmod);
    return [
      "  <url>",
      `    <loc>${xmlEscape(`${BASE_URL}${e.path}`)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      "  </url>",
    ].filter(Boolean).join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

async function main() {
  const entries = [...staticEntries];

  const categories = await fetchRows("categories", "select=slug&active=eq.true&limit=500");
  for (const c of categories) {
    if (isSeoSafeSlug(c?.slug)) entries.push({ path: `/categoria/${c.slug}`, changefreq: "daily", priority: "0.8" });
  }

  const departments = await fetchRows("departments", "select=slug&active=eq.true&limit=200");
  for (const d of departments) {
    if (isSeoSafeSlug(d?.slug)) entries.push({ path: `/departamento/${d.slug}`, changefreq: "weekly", priority: "0.7" });
  }

  for (let page = 0; page < 100; page++) {
    const products = await fetchRows(
      "products",
      `select=slug,updated_at&active=eq.true&archived_at=is.null&stock=gt.0&order=updated_at.desc&limit=1000&offset=${page * 1000}`,
    );
    for (const p of products) {
      if (isSeoSafeSlug(p?.slug)) {
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

  writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
  console.log(`sitemap.xml gerado (${new Set(entries.map((e) => e.path)).size} URLs válidas)`);
}

main().catch((error) => {
  console.error("Falha ao gerar sitemap:", error);
  process.exitCode = 1;
});
