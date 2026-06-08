import { Layout } from "@/components/Layout";
import { ReactNode } from "react";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Layout>
      <article className="container max-w-3xl py-10 md:py-14">
        <h1 className="text-3xl md:text-4xl font-extrabold mb-6">{title}</h1>
        <div className="prose prose-sm md:prose-base max-w-none text-foreground/90 space-y-4 leading-relaxed">
          {children}
        </div>
      </article>
    </Layout>
  );
}
