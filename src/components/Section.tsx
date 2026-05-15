import { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Section({ title, link, linkLabel = "Ver tudo", children }: { title: string; link?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <section className="container py-8">
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-extrabold">{title}</h2>
        {link && <Link to={link} className="text-sm text-primary font-semibold hover:underline">{linkLabel} →</Link>}
      </div>
      {children}
    </section>
  );
}
