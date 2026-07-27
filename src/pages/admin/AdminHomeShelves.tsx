import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShelfReorderDialog } from "@/components/admin/ShelfReorderDialog";
import { HOME_SHELVES } from "@/lib/homeShelves";
import { LayoutList, Settings2, Sparkles } from "lucide-react";

export default function AdminHomeShelves() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const { data: counts } = useQuery({
    queryKey: ["home_shelf_items", "counts", openKey],
    queryFn: async () => {
      const { data } = await (supabase as any).from("home_shelf_items").select("shelf_key");
      const map: Record<string, number> = {};
      ((data || []) as { shelf_key: string }[]).forEach((r) => {
        map[r.shelf_key] = (map[r.shelf_key] || 0) + 1;
      });
      return map;
    },
  });

  const current = HOME_SHELVES.find((s) => s.key === openKey);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <LayoutList className="h-6 w-6 text-primary" /> Vitrines da Home
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha quais produtos aparecem em cada vitrine da página inicial e em qual ordem.
          Vitrines sem produtos definidos continuam automáticas.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {HOME_SHELVES.map((s) => {
          const n = counts?.[s.key] || 0;
          return (
            <Card key={s.key}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                  <div className="text-xs mt-1 flex items-center gap-1">
                    {n > 0 ? (
                      <span className="text-primary font-semibold flex items-center gap-1">
                        <Settings2 className="h-3.5 w-3.5" /> {n} produto(s) fixados manualmente
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" /> Automática
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={() => setOpenKey(s.key)}>Organizar</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {current && (
        <ShelfReorderDialog
          open={!!openKey}
          onOpenChange={(b) => !b && setOpenKey(null)}
          shelfKey={current.key}
          shelfTitle={current.title}
        />
      )}
    </div>
  );
}
