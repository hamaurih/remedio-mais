import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Dept = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  link: string | null;
  band_color: string | null;
};

export function DepartmentCarousel() {
  const { data = [] } = useQuery({
    queryKey: ["home_departments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id,name,slug,image_url,link,band_color")
        .eq("active", true)
        .eq("show_on_home", true)
        .order("position", { ascending: true });
      return (data || []) as Dept[];
    },
  });

  if (!data.length) return null;

  return (
    <section className="container py-8 md:py-10">
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
          <span className="inline-block w-1 h-6 bg-primary rounded-full" />
          Navegue por departamento
        </h2>
      </div>
      <div className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
        {data.map((d) => {
          const href = d.link?.trim() ? d.link : `/categoria/${d.slug}`;
          const color = d.band_color || "#E11D2E";
          return (
            <Link
              key={d.id}
              to={href}
              className="snap-start shrink-0 w-36 md:w-auto bg-card border border-border rounded-2xl overflow-hidden flex flex-col hover:shadow-elevated hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="aspect-square bg-secondary/40 flex items-center justify-center overflow-hidden">
                {d.image_url ? (
                  <img
                    src={d.image_url}
                    alt={d.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-secondary to-muted" />
                )}
              </div>
              <div
                className="px-2 py-2.5 text-center text-white text-xs md:text-sm font-bold leading-tight min-h-[42px] flex items-center justify-center"
                style={{ backgroundColor: color }}
              >
                {d.name}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
