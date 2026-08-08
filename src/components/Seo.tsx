import { Helmet } from "react-helmet-async";

const SITE = "https://atacadaodosmedicamentos.com.br";
const BRAND = "Atacadão dos Medicamentos";

type SeoProps = {
  title: string;
  description?: string;
  path?: string;
  image?: string | null;
  type?: "website" | "product" | "article";
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | null;
};

/** Metadados por página (title/description/canonical/og). */
export function Seo({ title, description, path, image, type = "website", noindex, jsonLd }: SeoProps) {
  const fullTitle = title.includes(BRAND) ? title : `${title} | ${BRAND}`;
  const url = path ? `${SITE}${path}` : undefined;
  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {url && <link rel="canonical" href={url} />}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      {description && <meta name="twitter:description" content={description} />}
      {image && <meta property="og:image" content={image} />}
      {image && <meta name="twitter:image" content={image} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}

export { SITE as SEO_SITE, BRAND as SEO_BRAND };
