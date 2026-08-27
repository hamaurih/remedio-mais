import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/store";

type Props = {
  editing: any;
  setEditing: React.Dispatch<React.SetStateAction<any>>;
};

export function AdminProductGenericTab({ editing, setEditing }: Props) {
  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center gap-2 p-3 border rounded-lg bg-emerald-50">
        <Switch
          checked={!!editing.is_generic}
          onCheckedChange={(value) => setEditing({
            ...editing,
            is_generic: value,
            generic_equivalent_id: value ? null : editing.generic_equivalent_id,
          })}
        />
        <div>
          <Label className="font-semibold">Este produto é um genérico</Label>
          <p className="text-[11px] text-muted-foreground">Marque para que ele possa ser sugerido como alternativa mais barata em produtos de marca.</p>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Princípio ativo</Label>
        <Input
          value={editing.active_ingredient || ""}
          onChange={(event) => setEditing({ ...editing, active_ingredient: event.target.value })}
          placeholder="Ex.: Paracetamol 500mg"
        />
        <p className="text-[11px] text-muted-foreground">
          Usado para sugerir genéricos automaticamente quando dois produtos têm o mesmo princípio ativo.
        </p>
      </div>

      {!editing.is_generic && (
        <div className="space-y-1 pt-3 border-t">
          <Label>Genérico equivalente (manual)</Label>
          <GenericEquivalentPicker
            currentId={editing.generic_equivalent_id}
            selfId={editing.id}
            onPick={(id) => setEditing({ ...editing, generic_equivalent_id: id })}
          />
          <p className="text-[11px] text-muted-foreground">
            Quando definido, este vínculo tem prioridade sobre a busca automática por princípio ativo.
          </p>
        </div>
      )}
    </div>
  );
}

function GenericEquivalentPicker({
  currentId,
  selfId,
  onPick,
}: {
  currentId: string | null;
  selfId: string;
  onPick: (id: string | null) => void;
}) {
  const [current, setCurrent] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (!currentId) {
      setCurrent(null);
      return;
    }
    supabase
      .from("products")
      .select("id,name,manufacturer,image_url,price,promo_price")
      .eq("id", currentId)
      .maybeSingle()
      .then(({ data }) => setCurrent(data));
  }, [currentId]);

  useEffect(() => {
    if (search.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,manufacturer,image_url,price,promo_price")
        .eq("is_generic", true)
        .eq("active", true)
        .ilike("name", `%${search}%`)
        .neq("id", selfId || "00000000-0000-0000-0000-000000000000")
        .limit(8);
      setResults(data || []);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, selfId]);

  if (current) {
    return (
      <div className="flex items-center gap-2 border rounded-md p-2 bg-background">
        {current.image_url && <img src={current.image_url} alt="" className="h-10 w-10 object-contain" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{current.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {current.manufacturer || "—"} · {formatBRL(Number(current.promo_price ?? current.price))}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => onPick(null)}><X className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
      <Input className="pl-8" placeholder="Buscar genérico..." value={search} onChange={(event) => setSearch(event.target.value)} />
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => {
                onPick(result.id);
                setCurrent(result);
                setSearch("");
                setResults([]);
              }}
              className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left text-sm"
            >
              {result.image_url && <img src={result.image_url} alt="" className="h-8 w-8 object-contain shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="truncate">{result.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {result.manufacturer || "—"} · {formatBRL(Number(result.promo_price ?? result.price))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {search.length >= 2 && results.length === 0 && (
        <div className="text-xs text-muted-foreground mt-2">
          Nenhum genérico encontrado. Marque produtos como "genérico" na própria aba para que apareçam aqui.
        </div>
      )}
    </div>
  );
}
