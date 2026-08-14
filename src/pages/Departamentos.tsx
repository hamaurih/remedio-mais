import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Package2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";

type Dept = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  link: string | null;
  band_color: string | null;
};

export default function Departamentos() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["all_departments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id,name,slug,image_url,link,band_color")
        .eq("active", true)
        .order("position", { ascending: true });
      return (data || []) as Dept[];
    },
  });

  return (
    <Layout>
      <Seo title="Departamentos" description="Navegue por todos os departamentos da Farmácia Atacadão dos Medicamentos: medicamentos, higiene, beleza, infantil e mais." path="/departamentos" />
      <div className="container py-8 md:py-12">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="icon" asChild className="rounded-full">
            <Link to="/" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl md:text-3xl font-extrabold">Todos os Departamentos</h1>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl overflow-hidden">
                <div className="aspect-square bg-muted" />
                <div className="h-10 bg-muted/70 mt-1" />
              </div>
            ))}
          </div>
        ) : !data.length ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhum departamento encontrado</p>
            <p className="text-sm mt-1">Volte mais tarde para novidades.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {data.map((d) => {
              const href = d.link?.trim() ? d.link : `/categoria/${d.slug}`;
              const color = d.band_color || "#E11D2E";
              return (
                <Link
                  key={d.id}
                  to={href}
                  className="group flex flex-col bg-card border border-border rounded-2xl overflow-hidden hover:shadow-elevated hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="aspect-square bg-secondary/40 flex items-center justify-center overflow-hidden relative">
                    {d.image_url ? (
                      <img
                        src={d.image_url}
                        alt={d.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                        <Package2 className="h-12 w-12 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div
                    className="px-2 py-2.5 text-center text-white text-sm font-bold leading-tight min-h-[42px] flex items-center justify-center"
                    style={{ backgroundColor: color }}
                  >
                    {d.name}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
