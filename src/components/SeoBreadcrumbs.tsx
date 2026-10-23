import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { SEO_SITE } from "@/components/Seo";

export type SeoBreadcrumbItem = {
  name: string;
  path?: string;
};

export function SeoBreadcrumbs({ items, className = "" }: { items: SeoBreadcrumbItem[]; className?: string }) {
  const clean = items.filter((item) => item?.name);
  if (!clean.length) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: clean.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path
        ? { item: `${SEO_SITE}${item.path.startsWith("/") ? item.path : `/${item.path}`}` }
        : {}),
    })),
  };

  return (
    <>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <nav aria-label="Navegação estrutural" className={`flex flex-wrap items-center gap-1 text-xs text-muted-foreground ${className}`}>
        {clean.map((item, index) => {
          const last = index === clean.length - 1;
          return (
            <span key={`${item.name}-${index}`} className="inline-flex items-center gap-1 min-w-0">
              {item.path && !last ? (
                <Link to={item.path} className="hover:text-primary hover:underline truncate">
                  {item.name}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-foreground/80 truncate" : "truncate"}>
                  {item.name}
                </span>
              )}
              {!last && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />}
            </span>
          );
        })}
      </nav>
    </>
  );
}
