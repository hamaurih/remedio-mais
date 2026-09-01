import { Helmet } from "react-helmet-async";

const SITE = "https://www.atacadaodosmedicamentos.com.br";
const BRAND = "Atacadão dos Medicamentos";
const DEFAULT_DESCRIPTION =
  "Farmácia Atacadão dos Medicamentos em Campina Grande - PB. Preço baixo, entrega local e compra segura.";
const DEFAULT_IMAGE = `${SITE}/og-image.jpg?v=2`;

type SeoProps = {
  title: string;
  description?: string;
  path?: string;
  image?: string | null;
  type?: "website" | "product" | "article";
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | null;
};

function absoluteImage(image?: string | null) {
  if (!image) return DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(image)) return image;
  return `${SITE}${image.startsWith("/") ? image : `/${image}`}`;
}

/** Metadados por página: title, description, canonical, robots, Open Graph, Twitter e JSON-LD. */
export function Seo({ title, description, path, image, type = "website", noindex, jsonLd }: SeoProps) {
  const fullTitle = title.includes(BRAND) ? title : `${title} | ${BRAND}`;
  const metaDescription = description?.trim() || DEFAULT_DESCRIPTION;
  const canonicalPath = path
    ? path === "/"
      ? "/"
      : path.startsWith("/")
        ? path
        : `/${path}`
    : undefined;
  const url = canonicalPath ? `${SITE}${canonicalPath}` : undefined;
  const socialImage = absoluteImage(image);

  return (
    <Helmet htmlAttributes={{ lang: "pt-BR" }}>
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      <meta
        name="robots"
        content={noindex
          ? "noindex, nofollow"
          : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}
      />

      {url && <link rel="canonical" href={url} />}

      <meta property="og:site_name" content={BRAND} />
      <meta property="og:locale" content="pt_BR" />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      {url && <meta property="og:url" content={url} />}
      <meta property="og:image" content={socialImage} />
      <meta property="og:image:secure_url" content={socialImage} />
      <meta property="og:image:alt" content={fullTitle} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={socialImage} />

      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}

export { SITE as SEO_SITE, BRAND as SEO_BRAND };
